mod doctor;
mod git;
mod plan;
mod projects;
mod pty;
mod shell_env;
mod tree;
mod watcher;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::path::BaseDirectory;
use tauri::Manager;

#[tauri::command]
fn resolve_claude(override_path: Option<String>) -> Result<String, String> {
    shell_env::resolve_claude(override_path.as_deref())
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
fn pty_open(
    app: tauri::AppHandle,
    reg: tauri::State<pty::SessionRegistry>,
    id: String,
    cwd: String,
    program: String,
) -> Result<(), String> {
    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    if map.contains_key(&id) {
        return Ok(());
    }
    let session = pty::spawn(&cwd, &program, shell_env::login_shell_path())?;
    pty::start_reader(app, id.clone(), session.reader()?);
    map.insert(id, session);
    Ok(())
}

#[tauri::command]
fn pty_write(reg: tauri::State<pty::SessionRegistry>, id: String, data: String) -> Result<(), String> {
    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    map.get_mut(&id).ok_or_else(|| format!("no session: {id}"))?.write(&data)
}

#[tauri::command]
fn pty_resize(reg: tauri::State<pty::SessionRegistry>, id: String, rows: u16, cols: u16) -> Result<(), String> {
    let map = reg.0.lock().map_err(|e| e.to_string())?;
    map.get(&id).ok_or_else(|| format!("no session: {id}"))?.resize(rows, cols)
}

#[tauri::command]
fn pty_close(reg: tauri::State<pty::SessionRegistry>, id: String) -> Result<(), String> {
    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    match map.remove(&id) {
        Some(mut session) => {
            session.kill();
            Ok(())
        }
        None => Err(format!("no session: {id}")),
    }
}

/// Reserved id for the installer session. Project ids are path-derived 16-hex
/// digests, so this cannot collide with one.
const INSTALL_SESSION: &str = "__install__";

/// Exposed rather than hardcoded in the frontend: the install pane must
/// subscribe to this id BEFORE install_efficlaude opens the session, for the
/// reason recorded at terminal-pane.tsx:42 — a late subscription drops the
/// opening output. Two copies of the literal would eventually disagree.
#[tauri::command]
fn install_session_id() -> &'static str {
    INSTALL_SESSION
}

/// Running the installer in the PTY puts its output and its prompts in the
/// terminal the user is already looking at.
#[tauri::command]
fn install_efficlaude(
    app: tauri::AppHandle,
    reg: tauri::State<pty::SessionRegistry>,
) -> Result<(), String> {
    // The resource path differs between dev and a bundled .app, so this must be
    // resolved — a hardcoded relative path fails only in the shipped build.
    let script = app
        .path()
        .resolve("install.sh", BaseDirectory::Resource)
        .map_err(|e| e.to_string())?;
    let home = std::env::var("HOME").unwrap_or_else(|_| "/".into());

    let mut map = reg.0.lock().map_err(|e| e.to_string())?;
    if map.contains_key(INSTALL_SESSION) {
        return Ok(());
    }
    let mut session = pty::spawn(&home, "/bin/bash", shell_env::login_shell_path())?;
    pty::start_reader(app, INSTALL_SESSION.to_string(), session.reader()?);
    // The resolved path contains a space in every bundled build
    // (/Applications/EffiClaude Studio.app/Contents/Resources/install.sh), so it
    // is single-quoted here: written bare, bash splits it at the space and the
    // installer never runs. Dev paths have no space, which is why this only ever
    // failed in the shipped .app.
    let quoted = format!("'{}'", script.to_string_lossy().replace('\'', r"'\''"));
    session.write(&format!("bash {quoted}\r"))?;
    map.insert(INSTALL_SESSION.to_string(), session);
    Ok(())
}

/// Watchers and PTY sessions have independent lifetimes — closing a terminal
/// must not stop watching the project, and vice versa.
#[derive(Default)]
struct WatcherRegistry(Mutex<HashMap<String, watcher::SharedWatcher>>);

/// A folder that has been deleted on disk fails to watch; that must never stop
/// the other projects from being watched.
fn start_watch(app: &tauri::AppHandle, id: &str, path: &str) {
    let Ok(w) = watcher::watch(app.clone(), id.to_string(), PathBuf::from(path)) else {
        return;
    };
    if let Some(reg) = app.try_state::<WatcherRegistry>() {
        if let Ok(mut map) = reg.0.lock() {
            map.insert(id.to_string(), w);
        }
    }
}

// add_project and remove_project are wrapped here rather than registered from
// projects.rs: the watcher set is lib.rs's concern, and wrapping is what keeps
// it exactly equal to the configured set.
#[tauri::command]
async fn add_project(app: tauri::AppHandle) -> Result<Option<projects::ProjectView>, String> {
    let added = projects::add_project(app.clone()).await?;
    if let Some(p) = &added {
        start_watch(&app, &p.id, &p.path);
    }
    Ok(added)
}

/// Wrapped for the same reason add_project is: a promoted folder must start
/// being watched, and that is lib.rs's concern rather than projects.rs's.
#[tauri::command]
fn promote_project(app: tauri::AppHandle, path: String) -> Result<projects::ProjectView, String> {
    let added = projects::promote_project(path)?;
    start_watch(&app, &added.id, &added.path);
    Ok(added)
}

#[tauri::command]
fn remove_project(app: tauri::AppHandle, id: String) -> Result<(), String> {
    projects::remove_project(id.clone())?;
    if let Some(reg) = app.try_state::<WatcherRegistry>() {
        if let Ok(mut map) = reg.0.lock() {
            // Taken out of the map, not left in it: the drop is what stops the thread.
            drop(map.remove(&id));
        }
    }
    Ok(())
}

/// A claude left running after the app goes away burns CPU with no UI attached
/// and accumulates one per launch. Both hooks are needed: Cmd+Q never destroys
/// a window, and closing the last window does not by itself emit Exit — wiring
/// only one of them leaks a process on the other path. kill() waits, which is
/// what keeps the killed children from becoming zombies.
fn kill_all_sessions(app: &tauri::AppHandle) {
    if let Some(reg) = app.try_state::<pty::SessionRegistry>() {
        if let Ok(mut map) = reg.0.lock() {
            for session in map.values_mut() {
                session.kill();
            }
            map.clear();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                kill_all_sessions(window.app_handle());
            }
        })
        .setup(|app| {
            app.manage(pty::SessionRegistry::default());
            app.manage(WatcherRegistry::default());
            let handle = app.handle().clone();
            for p in projects::stored_projects() {
                start_watch(&handle, &p.id, &p.path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            resolve_claude,
            pty_open,
            pty_write,
            pty_resize,
            pty_close,
            add_project,
            remove_project,
            projects::list_projects,
            plan::read_project_state,
            doctor::run_doctor,
            install_efficlaude,
            projects::claude_override,
            projects::set_claude_override,
            tree::list_children,
            install_session_id,
            promote_project,
            git::git_info,
            git::git_checkout,
            git::git_create_branch,
            projects::panels,
            projects::set_panels
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(
                event,
                tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
            ) {
                kill_all_sessions(app);
            }
        });
}

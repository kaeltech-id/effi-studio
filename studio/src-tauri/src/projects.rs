use crate::tree::{git_mark, GitMark};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// A separate view model on purpose. `Project` is the PERSISTED shape in
/// studio.json and must not grow a derived field: a git marker written to disk
/// would be read back stale after the user initialises or deletes a repo
/// outside the app. ProjectView is recomputed on every read instead.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectView {
    pub id: String,
    pub name: String,
    pub path: String,
    pub git_mark: GitMark,
}

impl From<&Project> for ProjectView {
    fn from(p: &Project) -> Self {
        let path = PathBuf::from(&p.path);
        ProjectView {
            id: p.id.clone(),
            name: p.name.clone(),
            path: p.path.clone(),
            // No stop_at for a root the user added explicitly: if it sits inside
            // a larger repository, saying so is correct.
            git_mark: git_mark(&path, None),
        }
    }
}

#[derive(Serialize, Deserialize, Default)]
pub struct StudioConfig {
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub claude_override: Option<String>,
}

/// studio.json sits beside the worker's state but is the only file this app owns.
/// efficlaude.db, worker.pid and chroma/ belong to the Python side — never touched.
fn config_path() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".efficlaude/studio.json")
}

/// Any failure degrades to an empty config: a hand-corrupted studio.json costs
/// the project list, never the app's ability to start.
pub fn load() -> StudioConfig {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(cfg: &StudioConfig) -> Result<(), String> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

/// Derived from the absolute path, so a project keeps its id across restarts
/// without adding a uuid dependency.
fn project_id(abs: &str) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    abs.hash(&mut h);
    format!("{:016x}", h.finish())
}

use tauri_plugin_dialog::DialogExt;

/// Plain fn, not a command: lib.rs wraps it so adding a project also starts
/// its watcher.
pub async fn add_project(app: tauri::AppHandle) -> Result<Option<ProjectView>, String> {
    // The native panel is both the UX and the macOS file-access grant for the folder.
    let Some(dir) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let path = dir.into_path().map_err(|e| e.to_string())?;
    let abs = path.to_string_lossy().into_owned();
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| abs.clone());
    let id = project_id(&abs);

    let mut cfg = load();
    // A second add of the same folder returns the existing row rather than a duplicate.
    if let Some(existing) = cfg.projects.iter().find(|p| p.id == id) {
        return Ok(Some(ProjectView::from(existing)));
    }
    let proj = Project { id, name, path: abs };
    cfg.projects.push(proj.clone());
    save(&cfg)?;
    Ok(Some(ProjectView::from(&proj)))
}

/// add_project without the panel. The macOS file-access grant was already
/// given when the ancestor was picked, so a second dialog would ask for
/// nothing new — and asking again for a folder the user just clicked in the
/// tree would read as a bug.
pub fn promote_project(path: String) -> Result<ProjectView, String> {
    let abs = PathBuf::from(&path);
    let name = abs
        .file_name()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.clone());
    let id = project_id(&path);

    let mut cfg = load();
    // Promoting an already-configured folder returns the existing row, the
    // same contract add_project has above.
    if let Some(existing) = cfg.projects.iter().find(|p| p.id == id) {
        return Ok(ProjectView::from(existing));
    }
    let proj = Project { id, name, path };
    cfg.projects.push(proj.clone());
    save(&cfg)?;
    Ok(ProjectView::from(&proj))
}

#[tauri::command]
pub fn list_projects() -> Vec<ProjectView> {
    load().projects.iter().map(ProjectView::from).collect()
}

/// lib.rs starts a watcher per configured project and needs the stored rows,
/// not the view model.
pub fn stored_projects() -> Vec<Project> {
    load().projects
}

/// Plain fn, not a command: lib.rs wraps it so removing a project also drops
/// its watcher.
pub fn remove_project(id: String) -> Result<(), String> {
    let mut cfg = load();
    // retain() makes an unknown id a no-op success — the UI may fire twice on a
    // fast double-click, and that is not an error.
    cfg.projects.retain(|p| p.id != id);
    save(&cfg)
}

#[tauri::command]
pub fn claude_override() -> Option<String> {
    load().claude_override
}

/// Persisted so a hand-entered path survives a restart — the field exists in
/// StudioConfig for exactly this, and an override that lasted one session only
/// would send the user back to the doctor screen on every launch.
#[tauri::command]
pub fn set_claude_override(path: Option<String>) -> Result<(), String> {
    let mut cfg = load();
    cfg.claude_override = path.filter(|p| !p.is_empty());
    save(&cfg)
}

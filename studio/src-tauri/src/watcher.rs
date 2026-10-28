use crate::plan;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::PathBuf;
use std::sync::mpsc;
use std::sync::{Arc, Mutex, Weak};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const DEBOUNCE: Duration = Duration::from_millis(250);

/// Shared so the debounce thread can upgrade the watch from the project root to
/// `.claude/` once that directory appears. The registry holds the only strong
/// reference: dropping it drops the watcher, closes the channel, and ends the thread.
pub type SharedWatcher = Arc<Mutex<RecommendedWatcher>>;

pub fn watch(app: AppHandle, id: String, root: PathBuf) -> notify::Result<SharedWatcher> {
    let (tx, rx) = mpsc::channel::<()>();
    let watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if res.is_ok() {
            let _ = tx.send(());
        }
    })?;
    let shared: SharedWatcher = Arc::new(Mutex::new(watcher));

    let claude_dir = root.join(".claude");
    let mut watching_claude = claude_dir.is_dir();
    if let Ok(mut w) = shared.lock() {
        if watching_claude {
            // Only `.claude`, never the project root recursively: node_modules and
            // target/ would swamp the app with events it has no use for.
            w.watch(&claude_dir, RecursiveMode::Recursive)?;
        } else {
            // Nothing to watch inside yet — the root tells us when .claude appears.
            w.watch(&root, RecursiveMode::NonRecursive)?;
        }
    }

    let weak: Weak<Mutex<RecommendedWatcher>> = Arc::downgrade(&shared);
    std::thread::spawn(move || {
        let path = root.to_string_lossy().into_owned();
        let mut last: Option<String> = None;

        while rx.recv().is_ok() {
            // Collapse the burst /ec-execute makes rewriting the plan file once
            // per completed task into a single re-read.
            while rx.recv_timeout(DEBOUNCE).is_ok() {}

            if !watching_claude && claude_dir.is_dir() {
                if let Some(strong) = weak.upgrade() {
                    if let Ok(mut w) = strong.lock() {
                        let _ = w.unwatch(&root);
                        watching_claude = w.watch(&claude_dir, RecursiveMode::Recursive).is_ok();
                    }
                }
            }

            let state = plan::read_project_state(path.clone());
            // Diff before emitting: a touched file that changes nothing the UI
            // renders should not cause a render.
            let fingerprint = serde_json::to_string(&state).unwrap_or_default();
            if last.as_deref() != Some(fingerprint.as_str()) {
                last = Some(fingerprint);
                let _ = app.emit("project://state", (&id, &state));
            }
        }
    });

    Ok(shared)
}

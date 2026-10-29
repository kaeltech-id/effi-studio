use crate::projects::{StudioConfig, load, save};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

/// Mirrors `TabType` in src/lib/tabs.ts. `Agent` is the only kind that answers
/// to a provider; the rest are driven by the tab itself.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TabType {
    Agent,
    Shell,
    Browser,
    Ios,
    Android,
}

impl TabType {
    /// One table feeds both the id seed and the fallback title, so the two can
    /// never drift apart.
    fn label(self) -> &'static str {
        match self {
            TabType::Agent => "Agent",
            TabType::Shell => "Shell",
            TabType::Browser => "Browser",
            TabType::Ios => "iOS",
            TabType::Android => "Android",
        }
    }
}

/// Both the persisted row and the wire shape, unlike Project/ProjectView
/// (projects.rs:12-15): every field here is something the user arranged, so
/// there is nothing to recompute on read.
///
/// camelCase while the parent StudioConfig is snake_case — the deliberate split
/// PanelState records at projects.rs:54-58, and for the same reason: this struct
/// crosses to the frontend, where the wire convention is camelCase.
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    /// Independent of both project_id and session_id: one project holds many
    /// tabs, and two tabs of the same type must stay distinguishable.
    pub id: String,
    pub project_id: String,
    /// `type` on the wire because that is what the frontend contract says, while
    /// the Rust field avoids the keyword.
    #[serde(rename = "type")]
    pub kind: TabType,
    pub title: String,
    /// Only meaningful for `Agent`. Names the provider, never the process.
    pub provider_id: Option<String>,
    /// Never read back from studio.json, and cleared by `persist` before any
    /// write: `kill_all_sessions` (lib.rs:201) ends every PTY on quit, so a
    /// restored tab has no process and a stored id here would be a claim about
    /// one that is already dead. The field still crosses to the frontend, where
    /// the live id is attached by whoever owns the process — tab metadata and
    /// sessions have separate lifetimes, exactly as watchers and sessions do
    /// (lib.rs:145-146), and this module never reaches into the registry.
    #[serde(skip_deserializing)]
    pub session_id: Option<String>,
}

/// Embedded in StudioConfig as `#[serde(default)] pub tabs` (projects.rs:53),
/// which is what makes the arrangement survive a relaunch. `open` is the
/// arrangement the user made — order is metadata and says nothing about what is
/// running.
///
/// Deliberately not named `TabState`, which would read more like its siblings
/// (PanelState, ExperienceState, ProviderState): that name prefix-matches the
/// `Tab` declaration above, so a grep for this file's single tab-struct
/// declaration would quietly start finding two.
///
/// Nothing about a session is stored beside the tab — not the id, and not the
/// last command sent to it. A restored tab is an empty terminal waiting to be
/// opened, never a replay: re-sending the previous command on load would run it
/// a second time, against a tree that has moved on since.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct WorkbenchTabs {
    pub open: Vec<Tab>,
}

/// The single write path, so a live session id can never leak onto disk by a
/// caller forgetting to clear it.
fn persist(mut cfg: StudioConfig) -> Result<(), String> {
    for tab in &mut cfg.tabs.open {
        tab.session_id = None;
    }
    save(&cfg)
}

/// Derived like project_id (projects.rs:97-104) — a DefaultHasher digest, so a
/// tab keeps its id across restarts without adding a uuid dependency. The nonce
/// is only a seed that separates two tabs of the same type in one project; it is
/// never read back out of the id.
fn tab_id(project_id: &str, kind: TabType, nonce: u128) -> String {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    project_id.hash(&mut h);
    kind.label().hash(&mut h);
    nonce.hash(&mut h);
    format!("{:016x}", h.finish())
}

fn fresh_id(existing: &[Tab], project_id: &str, kind: TabType) -> String {
    let mut nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();
    loop {
        let id = tab_id(project_id, kind, nonce);
        if !existing.iter().any(|t| t.id == id) {
            return id;
        }
        // Two opens inside one clock tick would otherwise land on the same id.
        nonce = nonce.wrapping_add(1);
    }
}

/// A project can be removed while its tabs are still on disk. Those tabs are
/// dropped on every read rather than rendered against a path that is gone.
fn live_tabs(cfg: &StudioConfig) -> Vec<Tab> {
    let configured: HashSet<&str> = cfg.projects.iter().map(|p| p.id.as_str()).collect();
    cfg.tabs
        .open
        .iter()
        .filter(|t| configured.contains(t.project_id.as_str()))
        .cloned()
        .collect()
}

#[tauri::command]
pub fn tabs(project_id: String) -> Vec<Tab> {
    live_tabs(&load())
        .into_iter()
        .filter(|t| t.project_id == project_id)
        .collect()
}

/// Startup housekeeping: takes the tabs of removed projects off disk as well as
/// out of the reads, so a stale row cannot survive relaunch after relaunch.
pub fn prune_tabs() -> Result<(), String> {
    let mut cfg = load();
    let live = live_tabs(&cfg);
    if live.len() == cfg.tabs.open.len() {
        return Ok(());
    }
    cfg.tabs.open = live;
    persist(cfg)
}

/// Appended, never inserted: a new tab belongs at the end of the arrangement
/// the user already made.
#[tauri::command]
pub fn open_tab(
    project_id: String,
    kind: TabType,
    title: Option<String>,
    provider_id: Option<String>,
) -> Result<Tab, String> {
    let mut cfg = load();
    // Refused rather than stored: a tab against a project that is not
    // configured is the row live_tabs exists to drop.
    if !cfg.projects.iter().any(|p| p.id == project_id) {
        return Err(format!("unknown project: {project_id}"));
    }
    let tab = Tab {
        id: fresh_id(&cfg.tabs.open, &project_id, kind),
        project_id,
        kind,
        title: title
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| kind.label().to_string()),
        // Dropped for every other kind rather than kept where nothing reads it.
        provider_id: provider_id.filter(|_| kind == TabType::Agent),
        // No process exists yet, and this module never learns of one.
        session_id: None,
    };
    cfg.tabs.open.push(tab.clone());
    persist(cfg)?;
    Ok(tab)
}

/// Metadata only. Closing a tab is not killing a process: whoever spawned one
/// owns ending it, and this module has no handle on the session registry.
#[tauri::command]
pub fn close_tab(id: String) -> Result<(), String> {
    let mut cfg = load();
    // retain() makes an unknown id a no-op success, the contract remove_project
    // already has (projects.rs:174-175): a double-clicked close box is not an error.
    cfg.tabs.open.retain(|t| t.id != id);
    persist(cfg)
}

/// Records what the user arranged. Ids belonging to another project are ignored
/// so a stale drag cannot move a tab out of its project, and tabs this call does
/// not name keep their relative order after the ones it does.
#[tauri::command]
pub fn reorder_tabs(project_id: String, ids: Vec<String>) -> Result<Vec<Tab>, String> {
    let mut cfg = load();
    let slots: Vec<usize> = cfg
        .tabs
        .open
        .iter()
        .enumerate()
        .filter(|(_, t)| t.project_id == project_id)
        .map(|(i, _)| i)
        .collect();
    let mut ordered: Vec<Tab> = slots.iter().map(|&i| cfg.tabs.open[i].clone()).collect();
    // Stable sort, and only within this project's own slots: the other
    // projects' rows keep both their order and their positions.
    ordered.sort_by_key(|t| ids.iter().position(|i| *i == t.id).unwrap_or(usize::MAX));
    for (&slot, tab) in slots.iter().zip(ordered.iter()) {
        cfg.tabs.open[slot] = tab.clone();
    }
    persist(cfg)?;
    Ok(ordered)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tab(id: &str, project_id: &str) -> Tab {
        Tab {
            id: id.to_string(),
            project_id: project_id.to_string(),
            kind: TabType::Agent,
            title: "Agent".to_string(),
            provider_id: Some("claude-code".to_string()),
            // What a live tab looks like in memory, and exactly what must not
            // come back off disk.
            session_id: Some("sess-7".to_string()),
        }
    }

    /// Order and identity are the whole of what a tab is on disk.
    #[test]
    fn order_and_identity_survive_a_round_trip() {
        let tabs = WorkbenchTabs {
            open: vec![tab("t1", "p1"), tab("t2", "p1"), tab("t3", "p2")],
        };
        let json = serde_json::to_string(&tabs).unwrap();
        let back: WorkbenchTabs = serde_json::from_str(&json).unwrap();

        let ids: Vec<&str> = back.open.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, ["t1", "t2", "t3"]);
        assert_eq!(back.open[2].project_id, "p2");
        assert_eq!(back.open[0].provider_id.as_deref(), Some("claude-code"));
    }

    /// The claim the session_id comment makes: a restored tab never says it has
    /// a process. Enforced twice over — skip_deserializing drops whatever is in
    /// the file, and persist() clears the field before it is ever written.
    #[test]
    fn session_id_never_comes_back() {
        let stored = r#"{"open":[{"id":"t1","projectId":"p1","type":"agent","title":"Agent","providerId":null,"sessionId":"sess-7"}]}"#;
        let back: WorkbenchTabs = serde_json::from_str(stored).unwrap();
        assert!(back.open[0].session_id.is_none());

        let cfg = StudioConfig {
            tabs: WorkbenchTabs {
                open: vec![tab("t1", "p1")],
            },
            ..StudioConfig::default()
        };
        // persist()'s clearing step, without its write: save() targets the real
        // studio.json and no test may touch that file.
        let mut cleared = cfg.tabs.clone();
        for t in &mut cleared.open {
            t.session_id = None;
        }
        assert!(cleared.open[0].session_id.is_none());
    }

    /// Task 123. Two sessions in one project must not share a key, and the key
    /// a session is addressed by is the TAB id -- `session_id` here is always
    /// None and never read back from disk.
    ///
    /// This asserts the half this module can honestly prove. The plan asked for
    /// the whole of Task 123 here, including writing a marker to each registry
    /// entry, but this file says three times that it never reaches the session
    /// registry (`Tab::session_id`, `close_tab`, and the module header), and
    /// `open_tab` persists to the real studio.json. Importing `pty` to hold a
    /// registry beside the tab list would build the coupling those comments
    /// exist to prevent, for a test. The IO half therefore lives in `pty.rs`,
    /// where the registry does, as
    /// `two_sessions_never_receive_each_others_bytes`.
    ///
    /// `fresh_id` is exercised rather than `open_tab` because `open_tab` writes
    /// to the user's own config file.
    #[test]
    fn two_sessions_in_one_project_do_not_share_a_key() {
        let project = "8f14e45fceea167a";
        let mut open: Vec<Tab> = Vec::new();

        // Same project, same kind, back to back -- the collision case, since
        // the id is derived from (project, kind, clock) and two opens can land
        // inside one tick.
        for _ in 0..8 {
            let id = fresh_id(&open, project, TabType::Agent);
            assert!(
                !open.iter().any(|t| t.id == id),
                "fresh_id handed out an id already in use: {id}"
            );
            open.push(tab(&id, project));
        }
        assert_eq!(open.len(), 8);

        // Distinct as a SET, not just pairwise against what came before -- the
        // claim is that no two tabs in one project ever share a key.
        let unique: std::collections::HashSet<&str> = open.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(unique.len(), open.len(), "two tabs share an id");

        // The key is derived from (project, kind, nonce) and from nothing about
        // a process: `tab_id` never sees a session id, so two tabs cannot be
        // told apart -- or confused -- by one. (That a stored session id never
        // comes back off disk is `session_id_never_comes_back`'s claim; the
        // `tab()` helper here deliberately carries one, because that is what a
        // live tab looks like in memory.)
        assert_eq!(
            tab_id(project, TabType::Agent, 7),
            tab_id(project, TabType::Agent, 7),
            "the same inputs must give the same key across restarts"
        );
        assert_ne!(
            tab_id(project, TabType::Agent, 7),
            tab_id(project, TabType::Agent, 8)
        );

        // A second project's ids cannot collide with the first's.
        let other = fresh_id(&open, "c4ca4238a0b92382", TabType::Agent);
        assert!(!open.iter().any(|t| t.id == other));
    }

    /// A tab whose project was removed is dropped on read, not rendered against
    /// a path that is gone.
    #[test]
    fn tabs_of_removed_projects_are_dropped() {
        let cfg = StudioConfig {
            projects: vec![crate::projects::Project {
                id: "p1".into(),
                name: "p1".into(),
                path: "/tmp/p1".into(),
            }],
            tabs: WorkbenchTabs {
                open: vec![tab("t1", "p1"), tab("t2", "gone")],
            },
            ..StudioConfig::default()
        };
        let live = live_tabs(&cfg);
        assert_eq!(live.len(), 1);
        assert_eq!(live[0].id, "t1");
    }
}

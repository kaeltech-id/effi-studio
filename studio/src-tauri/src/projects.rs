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
    #[serde(default)]
    pub panels: PanelState,
    #[serde(default)]
    pub experiences: crate::experiences::ExperienceState,
    /// The workbench arrangement: which tabs are open, in which order. Metadata
    /// only — tabs.rs clears every session id before a write, so a restored tab
    /// never claims a process (tabs.rs:52-60).
    #[serde(default)]
    pub tabs: crate::tabs::WorkbenchTabs,
    /// Path overrides and user-defined CLIs. Without this field a custom CLI
    /// could be described but not launched: pty_open resolves through the
    /// registry, and the registry only knows what was persisted here.
    #[serde(default)]
    pub providers: crate::agents::ProviderState,
    /// Connections and their per-consumer bindings. Credential REFERENCES
    /// only — projects.rs never sees a secret (connections.rs:40-52).
    #[serde(default)]
    pub connections: crate::connections::ConnectionState,
}

// Every field above carries #[serde(default)] for one reason: an existing
// studio.json written by an earlier build has none of the newer keys, and
// load() below turns a single deserialisation failure into
// StudioConfig::default() — i.e. into an empty project list. A missing default
// anywhere here costs the user every project they had added.

/// Which rail sections are collapsed. Persisted, unlike the sidebar's
/// expansion state: that is a transient view of the filesystem, while a
/// collapsed panel is a preference the user expects to survive a relaunch.
/// Default is all sections open, so an older studio.json needs no migration.
///
/// camelCase while the parent StudioConfig is snake_case, which looks
/// inconsistent inside one file and is deliberate: this struct also crosses to
/// the frontend via the `panels` command, and the wire convention there is
/// camelCase (the reason is recorded at plan.rs:177-179). Renaming the parent
/// instead would stop it reading a studio.json written by any earlier build.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct PanelState {
    pub properties_collapsed: bool,
    pub tasks_collapsed: bool,
    pub history_collapsed: bool,
    /// The left sidebar, not a rail section. It lives here so there is one
    /// persistence mechanism for every collapsible surface rather than two.
    pub sidebar_collapsed: bool,
    /// The flow bar above the terminal. Default open, like every other region:
    /// the row exists to be read before it is dismissed.
    pub flow_collapsed: bool,
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
pub fn panels() -> PanelState {
    load().panels
}

#[tauri::command]
pub fn set_panels(panels: PanelState) -> Result<(), String> {
    let mut cfg = load();
    cfg.panels = panels;
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

#[cfg(test)]
mod tests {
    use super::*;

    /// The reason every StudioConfig field carries #[serde(default)], proved
    /// rather than asserted: a studio.json written before tabs, providers or
    /// experiences existed must still deserialise. One missing default makes
    /// this input fail, load() swallows the failure into StudioConfig::default()
    /// and the user's whole project list disappears on first launch.
    ///
    /// Deliberately a serde-level test with a literal input — load() reads
    /// $HOME/.efficlaude/studio.json, and no test may touch the real file.
    #[test]
    fn config_from_before_the_newer_keys_keeps_its_projects() {
        let old = r#"{
            "projects": [
                { "id": "a1b2c3", "name": "EffiClaude", "path": "/Users/me/dev/EffiClaude" },
                { "id": "d4e5f6", "name": "studio", "path": "/Users/me/dev/studio" }
            ],
            "claude_override": "/Users/me/.local/bin/claude",
            "panels": { "sidebarCollapsed": true }
        }"#;

        let cfg: StudioConfig = serde_json::from_str(old).expect("old studio.json must load");

        assert_eq!(cfg.projects.len(), 2);
        assert_eq!(cfg.projects[0].name, "EffiClaude");
        assert_eq!(cfg.projects[1].path, "/Users/me/dev/studio");
        assert_eq!(
            cfg.claude_override.as_deref(),
            Some("/Users/me/.local/bin/claude")
        );
        assert!(cfg.panels.sidebar_collapsed);
        // The keys the old file never had, defaulted rather than fatal.
        assert!(cfg.tabs.open.is_empty());
        assert!(cfg.providers.overrides.is_empty());
        assert!(cfg.providers.custom.is_empty());
        assert!(!cfg.experiences.build_enabled);
        assert!(cfg.connections.items.is_empty());
    }

    /// The same shape as a file, through the exact expression load() uses, so
    /// the degrade-to-default branch is shown not to fire. A scratch file in the
    /// OS temp dir, never $HOME/.efficlaude/studio.json: a test that read the
    /// user's own config would prove nothing and could rewrite it.
    #[test]
    fn an_old_file_does_not_degrade_to_default() {
        let path = std::env::temp_dir().join("efficlaude-compat-studio.json");
        std::fs::write(
            &path,
            r#"{"projects":[{"id":"a1","name":"p","path":"/tmp/p"}],"claude_override":null,"panels":{}}"#,
        )
        .unwrap();

        // load()'s body with config_path() swapped for the scratch file.
        let cfg: StudioConfig = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        let _ = std::fs::remove_file(&path);
        assert_eq!(cfg.projects.len(), 1, "projects must survive the load path");
        assert_eq!(cfg.projects[0].id, "a1");
        assert!(cfg.tabs.open.is_empty());
        assert!(cfg.providers.custom.is_empty());
        assert!(cfg.connections.items.is_empty());
    }

    /// The same proof for `connections`, the newest field, against the hardest
    /// input it will meet: a studio.json carrying EVERY key that existed before
    /// it and populated values in all of them. The two tests above start from a
    /// sparse file, which a missing default on an early field would also
    /// survive; this one would not.
    ///
    /// Read through load()'s exact expression from a real file, because the
    /// failure being excluded is load() swallowing a deserialisation error into
    /// `StudioConfig::default()` — an assert on `from_str` alone never reaches
    /// that branch. The OS temp dir, never $HOME/.efficlaude/studio.json: a
    /// test that read the user's own config would prove nothing and could
    /// rewrite it.
    #[test]
    fn a_full_config_written_before_connections_existed_keeps_everything() {
        let before_connections = r#"{
            "projects": [
                { "id": "a1b2c3", "name": "EffiClaude", "path": "/Users/me/dev/EffiClaude" }
            ],
            "claude_override": "/Users/me/.local/bin/claude",
            "panels": { "propertiesCollapsed": true, "flowCollapsed": true },
            "experiences": { "buildEnabled": true },
            "tabs": {
                "open": [
                    {
                        "id": "t1",
                        "projectId": "a1b2c3",
                        "type": "agent",
                        "title": "Agent",
                        "providerId": "claude-code"
                    },
                    {
                        "id": "t2",
                        "projectId": "a1b2c3",
                        "type": "shell",
                        "title": "Shell",
                        "providerId": null
                    }
                ]
            },
            "providers": {
                "overrides": { "codex": "/opt/homebrew/bin/codex" },
                "custom": [
                    {
                        "id": "aider",
                        "name": "Aider",
                        "program": "/Users/me/My Tools/aider",
                        "args": ["--no-auto-commits"]
                    }
                ]
            }
        }"#;

        let path = std::env::temp_dir().join("efficlaude-pre-connections-studio.json");
        std::fs::write(&path, before_connections).unwrap();

        // load()'s body with config_path() swapped for the scratch file.
        let cfg: StudioConfig = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();

        let _ = std::fs::remove_file(&path);

        // The degrade-to-default branch did not fire: the projects are here.
        assert_eq!(cfg.projects.len(), 1, "projects must survive the load path");
        assert_eq!(cfg.projects[0].name, "EffiClaude");
        assert_eq!(cfg.projects[0].path, "/Users/me/dev/EffiClaude");
        // And so is everything the older keys carried, unshifted by the new one.
        assert_eq!(
            cfg.claude_override.as_deref(),
            Some("/Users/me/.local/bin/claude")
        );
        assert!(cfg.panels.properties_collapsed);
        assert!(cfg.panels.flow_collapsed);
        assert!(!cfg.panels.sidebar_collapsed);
        assert!(cfg.experiences.build_enabled);
        assert_eq!(cfg.tabs.open.len(), 2);
        assert_eq!(cfg.tabs.open[0].provider_id.as_deref(), Some("claude-code"));
        assert_eq!(
            cfg.providers.overrides.get("codex").map(String::as_str),
            Some("/opt/homebrew/bin/codex")
        );
        assert_eq!(cfg.providers.custom.len(), 1);
        assert_eq!(cfg.providers.custom[0].args, vec!["--no-auto-commits"]);

        // The key this file could not have had, defaulted rather than fatal.
        assert!(
            cfg.connections.items.is_empty(),
            "a file written before connections existed has none"
        );
    }
}

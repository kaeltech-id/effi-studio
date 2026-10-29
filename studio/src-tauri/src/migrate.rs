//! Reading a `studio.json` an earlier build wrote, and bringing it forward
//! without losing anything that is already in it.
//!
//! WHY THIS MODULE READS A DOCUMENT AND NOT A `StudioConfig`, which would be
//! the obvious shape. Two things a `StudioConfig` cannot express:
//!
//!   * serde IGNORES a key it does not know. `StudioConfig` therefore reads an
//!     older file perfectly — every field carries `#[serde(default)]`, and
//!     projects.rs:65-69 records what one missing default would cost — but a
//!     load→save CYCLE through it silently ERASES every key the running build
//!     has never heard of. The loss is invisible on the read and happens on the
//!     write, which is why Task 125 is a round trip and not a load;
//!   * a missing key and an empty value are the same thing to
//!     `#[serde(default)]`, and for `tabs` they mean opposite things: no key at
//!     all is a file from before the workbench existed, while `{"open": []}` is
//!     a user who closed their last tab and meant it. The backfill below turns
//!     on exactly that distinction, so it has to see the key rather than the
//!     value.
//!
//! THE DELIBERATE DECISION ON UNKNOWN KEYS: they are PRESERVED. A migration is
//! the one operation in this app that runs against a file it did not write, so
//! it is the one place that must assume the file knows more than the code does
//! — a user who tries a newer build and steps back to this one would otherwise
//! have the newer build's settings deleted by the step back, silently, by the
//! very code that exists to protect their configuration. Dropping a key is a
//! decision that needs to know what the key means, and this module never does.
//! Note the limit of that promise, which is honest rather than comfortable:
//! every ordinary write in the app is `projects::load()` then
//! `projects::save()`, so toggling a panel drops unknown keys anyway.
//! Preservation is a property of THIS step, and
//! `a_key_from_a_newer_build_survives_this_migration_and_not_a_plain_save`
//! asserts both halves of that sentence rather than leaving the second one as
//! an assumption.
//!
//! WHERE THE FILE LIVES IS NOT KNOWN HERE. Every entry point takes a path.
//! projects.rs owns the location (`config_path`, projects.rs:97-99) and a
//! second copy of `~/.efficlaude/studio.json` is the exact accident Task 119
//! exists to prevent: two spellings that drift are how an upgrade reads an
//! empty config and the user loses every project they added. It also means no
//! test in this file can reach the user's own config — each one names a path in
//! the OS temp dir, and none of them sets `HOME`.

use crate::agents::CLAUDE_CODE_ID;
use crate::projects::StudioConfig;
use crate::tabs::{Tab, TabType};
use serde_json::{Map, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// The `StudioConfig` field a legacy document is recognised by its ABSENCE of.
/// A const rather than a literal at three call sites, and
/// `the_keys_this_module_names_are_the_keys_the_struct_serialises` proves it
/// still matches the struct.
const TABS_KEY: &str = "tabs";

/// The field holding the rows a tab is backfilled for.
const PROJECTS_KEY: &str = "projects";

/// Mixed into a backfilled tab's id so it cannot collide with one `tabs.rs`
/// derived from the clock, and so the id says which pass produced it.
const MIGRATION_SEED: &str = "migrated-legacy-terminal";

/// What a migration did. Returned rather than logged so a caller can write only
/// when something changed, and so the tests can assert on the decisions instead
/// of only on the bytes.
#[derive(Debug, Default, PartialEq, Eq)]
pub struct Report {
    /// Keys added because this build knows a field the file did not carry.
    /// Sorted, so a caller printing it gets a stable line.
    pub defaults_added: Vec<String>,
    /// Project ids given their one backfilled tab.
    pub tabs_backfilled: Vec<String>,
    /// Keys left exactly as they were because nothing here knows what they
    /// mean. Reported, never removed — see the module header.
    pub unknown_keys_kept: Vec<String>,
}

impl Report {
    /// Whether anything needs writing. `unknown_keys_kept` is deliberately NOT
    /// part of this: carrying a key forward unchanged is not a change, and
    /// counting it as one would rewrite the user's file on every launch to
    /// produce identical content.
    pub fn changed(&self) -> bool {
        !self.defaults_added.is_empty() || !self.tabs_backfilled.is_empty()
    }
}

/// The three outcomes of migrating one document, kept apart because a caller
/// must treat them differently and a `Result<Option<_>>` would let two of them
/// be handled by one arm.
pub enum Migration {
    /// Not a JSON object. `load()` degrades this to `StudioConfig::default()`
    /// (projects.rs:101-108), and a migration must NOT turn that degrade into a
    /// write: overwriting a hand-corrupted file with a defaulted one is how the
    /// user loses the project list they were about to repair by hand.
    Unreadable,
    /// Already current. Nothing to write.
    UpToDate(Report),
    /// The text to write, and what changed.
    Migrated { text: String, report: Report },
}

/// Parses the text of a studio.json into its document.
///
/// `None` for anything that is not a JSON OBJECT — including a valid JSON array
/// or string, which would deserialise into no config at all.
pub fn parse(text: &str) -> Option<Map<String, Value>> {
    match serde_json::from_str::<Value>(text) {
        Ok(Value::Object(map)) => Some(map),
        _ => None,
    }
}

/// Every key `StudioConfig` has, with its default value — derived from the
/// struct itself rather than listed here, so a field added to `StudioConfig`
/// tomorrow is defaulted by this function without anyone editing it. A
/// hand-kept list is how the next field ends up being the one that is missed,
/// and a missed field is a project list the user never gets back.
fn default_document() -> Map<String, Value> {
    match serde_json::to_value(StudioConfig::default()) {
        Ok(Value::Object(map)) => map,
        // `StudioConfig` is a plain struct of serialisable fields, so this
        // cannot happen; an empty map keeps it from being an `unwrap`, and the
        // test above names the four newer keys directly so an empty map here
        // would still fail the suite rather than pass it vacuously.
        _ => Map::new(),
    }
}

/// The project ids a document lists, in the order it lists them.
///
/// A row without a string `id` is skipped rather than repaired: the id is
/// derived from the path by `projects::project_id` (projects.rs:119-126), which
/// is private and off limits to this task, and inventing a different derivation
/// here would hand the same folder two different ids.
fn project_ids(doc: &Map<String, Value>) -> Vec<String> {
    doc.get(PROJECTS_KEY)
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter_map(|row| row.get("id").and_then(Value::as_str))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

/// Deterministic, unlike `tabs::fresh_id`, which seeds on the clock.
///
/// A migration that produced a different id each time it ran could not be
/// compared against its own previous output, and the identity of a backfilled
/// tab is a fact about the project it came from rather than about when the user
/// happened to upgrade. Derived the way `project_id` and `tab_id` are — a
/// `DefaultHasher` digest, so no uuid dependency is added — and
/// collision-checked against the ids this pass has already handed out.
fn migrated_tab_id(project_id: &str, taken: &HashSet<String>) -> String {
    use std::hash::{Hash, Hasher};
    let mut salt: u64 = 0;
    loop {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        project_id.hash(&mut h);
        MIGRATION_SEED.hash(&mut h);
        salt.hash(&mut h);
        let id = format!("{:016x}", h.finish());
        if !taken.contains(&id) {
            return id;
        }
        salt = salt.wrapping_add(1);
    }
}

/// One legacy terminal as one tab row.
///
/// Built from `tabs::Tab` and serialised, rather than hand-written as an
/// object, so the keys and the `type` spelling cannot drift from the struct the
/// app reads back. `None` only if that serialisation fails, in which case the
/// caller skips the row — a `Value::Null` pushed into `open` would fail to
/// deserialise as a `Tab` and take the whole config down to default with it.
fn legacy_tab(id: &str, project_id: &str) -> Option<Value> {
    let tab = Tab {
        id: id.to_string(),
        project_id: project_id.to_string(),
        kind: TabType::Agent,
        // The label `TabType::Agent` carries in tabs.rs. Copied rather than
        // called because `TabType::label` is private to that module, and a
        // migration is not a reason to widen it.
        title: "Agent".to_string(),
        // The familiar single terminal was a Claude session, and this is the
        // id the provider registry answers to (agents.rs:6).
        provider_id: Some(CLAUDE_CODE_ID.to_string()),
        // The whole of "never two PTYs from one source". The row describes a
        // tab and claims no process: `kill_all_sessions` ends every PTY on
        // quit, so a restored tab has nothing left to claim (tabs.rs:52-60),
        // and this migration starts nothing.
        session_id: None,
    };
    let mut value = serde_json::to_value(&tab).ok()?;
    // `session_id` is `#[serde(skip_deserializing)]` and not
    // `skip_serializing`, so `to_value` writes `"sessionId": null`. Dropped
    // outright instead: nothing this migration puts on disk carries a field
    // whose only honest value is "no process". Both encodings read back as
    // `None` — the absent key says so without a reader having to check a value.
    if let Value::Object(map) = &mut value {
        map.remove("sessionId");
    }
    Some(value)
}

/// Task 120. A config written before tabs existed describes a single terminal
/// per project; it becomes exactly ONE Claude agent tab per project, with no
/// session id and no process. Returns the project ids that were given one.
///
/// IDEMPOTENCE, twice over, because one tab becoming two is the failure this
/// task names:
///
///   * ACROSS runs — the gate is the absence of the `tabs` key. The first pass
///     writes that key, so no later pass can fire. Keying on an empty tab LIST
///     instead would hand a tab back to a user who closed their last one, on
///     every launch, forever;
///   * WITHIN a run — one tab per project id, so a document that somehow lists
///     the same project twice still yields one tab for it.
fn backfill_tabs(doc: &mut Map<String, Value>) -> Vec<String> {
    // Already a workbench-era document. An empty `open` here is a choice, not
    // an absence.
    if doc.contains_key(TABS_KEY) {
        return Vec::new();
    }
    let mut taken: HashSet<String> = HashSet::new();
    let mut backfilled: Vec<String> = Vec::new();
    let mut open: Vec<Value> = Vec::new();
    for project_id in project_ids(doc) {
        if backfilled.contains(&project_id) {
            continue;
        }
        let id = migrated_tab_id(&project_id, &taken);
        let Some(row) = legacy_tab(&id, &project_id) else {
            continue;
        };
        taken.insert(id);
        open.push(row);
        backfilled.push(project_id);
    }
    if backfilled.is_empty() {
        // Nothing to backfill. The key is left missing so the defaults pass
        // inserts `WorkbenchTabs::default()` for it, which is the same value by
        // a route that reports itself as a default rather than as a backfill.
        return Vec::new();
    }
    doc.insert(
        TABS_KEY.to_string(),
        Value::Object(Map::from_iter([("open".to_string(), Value::Array(open))])),
    );
    backfilled
}

/// Tasks 119 and 120 on one document, in place.
pub fn migrate_document(doc: &mut Map<String, Value>) -> Report {
    let defaults = default_document();

    // Task 120 runs FIRST, and before the `tabs` default is inserted: the
    // signal a legacy file gives is the absence of that key, and defaulting it
    // would destroy the signal a line before it was read.
    let tabs_backfilled = backfill_tabs(doc);

    // Collected before the inserts below, so an added default cannot be
    // mistaken for a key this build does not know.
    let mut unknown_keys_kept: Vec<String> = doc
        .keys()
        .filter(|k| !defaults.contains_key(k.as_str()))
        .cloned()
        .collect();
    unknown_keys_kept.sort();

    let mut defaults_added: Vec<String> = Vec::new();
    for (key, value) in defaults {
        if !doc.contains_key(&key) {
            doc.insert(key.clone(), value);
            defaults_added.push(key);
        }
    }
    defaults_added.sort();

    Report {
        defaults_added,
        tabs_backfilled,
        unknown_keys_kept,
    }
}

/// The whole migration, text in and text out.
pub fn migrate_text(text: &str) -> Migration {
    let Some(mut doc) = parse(text) else {
        return Migration::Unreadable;
    };
    let report = migrate_document(&mut doc);
    if !report.changed() {
        return Migration::UpToDate(report);
    }
    match serde_json::to_string_pretty(&Value::Object(doc)) {
        // `to_string_pretty`, which is what `save()` writes with
        // (projects.rs:115), so a migrated file and an app-written one are
        // formatted the same way.
        Ok(text) => Migration::Migrated { text, report },
        Err(_) => Migration::Unreadable,
    }
}

/// Migrates the studio.json at `path` in place, and reports what it did.
///
/// The path is a parameter and this module holds no copy of
/// `~/.efficlaude/studio.json` — the reason is in the module header.
///
/// Written to a sibling and renamed over the target rather than written in
/// place. `save()` writes in place, which is right for a file the app itself
/// produced moments earlier; this one is the user's own configuration, possibly
/// the only record of the projects they have added, and a write interrupted
/// half way through leaves it truncated. A rename on one filesystem is atomic,
/// so the file is either entirely the old content or entirely the new.
pub fn migrate_file(path: &Path) -> Result<Report, String> {
    let Ok(text) = std::fs::read_to_string(path) else {
        // No file at all is not a failure: a first launch has nothing to
        // migrate, and `load()` answers a default config for it.
        return Ok(Report::default());
    };
    match migrate_text(&text) {
        Migration::Unreadable => Err(format!(
            "{} could not be read as a studio.json, so nothing has been changed — \
             it is exactly as it was",
            path.display()
        )),
        Migration::UpToDate(report) => Ok(report),
        Migration::Migrated { text, report } => {
            let mut scratch = path.as_os_str().to_os_string();
            scratch.push(".migrating");
            let scratch = PathBuf::from(scratch);
            if let Err(e) = std::fs::write(&scratch, &text) {
                // Nothing has touched `path` yet, so there is nothing to undo.
                let _ = std::fs::remove_file(&scratch);
                return Err(e.to_string());
            }
            if let Err(e) = std::fs::rename(&scratch, path) {
                // The original is still intact; the half-written sibling is
                // not left behind to be mistaken for a config.
                let _ = std::fs::remove_file(&scratch);
                return Err(e.to_string());
            }
            Ok(report)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A studio.json in the shape this app shipped with: three keys, and no
    /// `tabs`, `providers`, `experiences` or `connections` at all.
    ///
    /// The second project's folder does not exist, which is the edge case Task
    /// 125 names. It must survive every cycle below: `tabs::live_tabs` drops
    /// the tabs of removed PROJECTS and keys that on the project id
    /// (tabs.rs:122-130), while a project whose PATH has gone is still a
    /// configured project — the user may be about to restore the folder, or to
    /// remove the row themselves, and neither is this code's decision.
    const LEGACY: &str = r#"{
        "projects": [
            { "id": "a1b2c3", "name": "EffiClaude", "path": "/Users/me/dev/EffiClaude" },
            { "id": "d4e5f6", "name": "gone", "path": "/Users/me/dev/deleted-2026-10-29" },
            { "id": "070809", "name": "studio", "path": "/Users/me/dev/studio" }
        ],
        "claude_override": "/Users/me/.local/bin/claude",
        "panels": { "sidebarCollapsed": true, "historyCollapsed": true }
    }"#;

    /// A scratch path in the OS temp dir, named per test so two tests running
    /// in parallel cannot share one. NEVER `$HOME/.efficlaude/studio.json`: a
    /// test that read the user's own config would prove nothing and could
    /// rewrite it. Nothing in this file sets `HOME` either — that is process
    /// global, and the suite runs in threads.
    fn scratch(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("efficlaude-migrate-{name}.json"))
    }

    /// `load()`'s body with `config_path()` swapped for a scratch file
    /// (projects.rs:103-108), the convention projects.rs's own tests use. The
    /// real `load()` reads the user's config and no test may call it.
    fn load_from(path: &Path) -> StudioConfig {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    /// `save()`'s body, the same way (projects.rs:110-117). Returns the bytes
    /// it wrote, so a round trip can be compared as text and not only as
    /// fields.
    fn save_to(path: &Path, cfg: &StudioConfig) -> String {
        let json = serde_json::to_string_pretty(cfg).expect("a config serialises");
        std::fs::write(path, &json).expect("the scratch file is writable");
        json
    }

    fn migrated(text: &str) -> (Map<String, Value>, Report) {
        match migrate_text(text) {
            Migration::Migrated { text, report } => (
                parse(&text).expect("the migration writes an object"),
                report,
            ),
            Migration::UpToDate(_) => panic!("this document needed migrating"),
            Migration::Unreadable => panic!("this document is readable"),
        }
    }

    fn tab_rows(doc: &Map<String, Value>) -> Vec<Value> {
        doc[TABS_KEY]["open"]
            .as_array()
            .expect("open is a list")
            .clone()
    }

    // -----------------------------------------------------------------------
    // Task 119 — an older studio.json read unchanged
    // -----------------------------------------------------------------------

    /// Every field this build knows is present afterwards, and every value the
    /// file already had is still the value it had.
    #[test]
    fn an_older_three_field_config_gains_every_default_and_loses_nothing() {
        let (doc, report) = migrated(LEGACY);

        // Derived from the struct, so this keeps covering a field added to
        // `StudioConfig` after this test was written.
        for key in default_document().keys() {
            assert!(
                doc.contains_key(key),
                "the migrated document is missing `{key}`"
            );
        }
        // And named outright, so an empty `default_document()` could not make
        // the loop above pass vacuously.
        for key in [
            "projects",
            "claude_override",
            "panels",
            "experiences",
            TABS_KEY,
            "providers",
            "connections",
        ] {
            assert!(doc.contains_key(key), "`{key}` must be in every config");
        }

        // The keys the old file could not have had, defaulted. `tabs` is NOT
        // among them: it was backfilled, which is a different act and is
        // reported as one.
        for key in ["experiences", "providers", "connections"] {
            assert!(
                report.defaults_added.contains(&key.to_string()),
                "`{key}` should have been defaulted: {report:?}"
            );
        }
        assert!(
            !report.defaults_added.contains(&TABS_KEY.to_string()),
            "tabs was backfilled, not defaulted: {report:?}"
        );

        // Nothing already on disk moved.
        assert_eq!(doc["claude_override"], "/Users/me/.local/bin/claude");
        assert_eq!(doc["panels"]["sidebarCollapsed"], true);
        assert_eq!(doc["panels"]["historyCollapsed"], true);
        let projects = doc["projects"].as_array().expect("projects is a list");
        assert_eq!(projects.len(), 3);
        assert_eq!(projects[1]["path"], "/Users/me/dev/deleted-2026-10-29");

        // And the result is the live shape, read through serde as the app will
        // read it — the degrade-to-default branch cannot fire on it.
        let cfg: StudioConfig =
            serde_json::from_value(Value::Object(doc)).expect("the migrated document loads");
        assert_eq!(cfg.projects.len(), 3);
        assert_eq!(
            cfg.claude_override.as_deref(),
            Some("/Users/me/.local/bin/claude")
        );
        assert!(cfg.panels.sidebar_collapsed && cfg.panels.history_collapsed);
        assert!(!cfg.panels.properties_collapsed && !cfg.panels.flow_collapsed);
    }

    /// The deliberate decision on unknown keys, as a test rather than as a
    /// claim — and both halves of it.
    ///
    /// This migration PRESERVES a key it does not know, because a migration is
    /// the one operation that runs against a file it did not write. A plain
    /// `StudioConfig` load→save does NOT, which is the whole reason this module
    /// reads a document, and is also the honest limit on the promise: the
    /// app's ordinary write path still drops the key the next time the user
    /// toggles a panel.
    #[test]
    fn a_key_from_a_newer_build_survives_this_migration_and_not_a_plain_save() {
        let newer = r#"{
            "projects": [{ "id": "a1b2c3", "name": "EffiClaude", "path": "/Users/me/dev/e" }],
            "panels": { "sidebarCollapsed": true },
            "workspaces": { "pinned": ["a1b2c3"], "layout": "split" }
        }"#;

        let (doc, report) = migrated(newer);
        assert_eq!(
            report.unknown_keys_kept,
            vec!["workspaces".to_string()],
            "the key is reported, not removed"
        );
        // Fetched rather than indexed, so a migration that DROPPED the key
        // fails with the reason instead of with serde_json's "no entry found
        // for key" — the report above is computed before the keys are written,
        // so it alone would not catch a removal.
        let kept = doc.get("workspaces").unwrap_or_else(|| {
            panic!(
                "the migration deleted a key it does not understand; it may only \
                 carry such a key forward: {:?}",
                doc.keys().collect::<Vec<_>>()
            )
        });
        assert_eq!(kept["pinned"][0], "a1b2c3", "and its value is untouched");
        assert_eq!(kept["layout"], "split");

        // The other half: the typed path erases it, on the WRITE and not on
        // the read.
        let cfg: StudioConfig = serde_json::from_str(newer).expect("serde ignores the unknown key");
        assert_eq!(cfg.projects.len(), 1, "the read itself loses nothing");
        let written = serde_json::to_string_pretty(&cfg).unwrap();
        assert!(
            !written.contains("workspaces"),
            "a load→save through StudioConfig is expected to drop it — that is \
             why this module reads a document: {written}"
        );
    }

    /// Migrating a document the migration already produced changes nothing, so
    /// a startup that ran it twice would not rewrite the file.
    #[test]
    fn a_document_this_migration_produced_is_already_up_to_date() {
        let (doc, _) = migrated(LEGACY);
        let once = serde_json::to_string_pretty(&Value::Object(doc)).unwrap();
        match migrate_text(&once) {
            Migration::UpToDate(report) => {
                assert!(!report.changed());
                assert!(report.defaults_added.is_empty());
                assert!(report.tabs_backfilled.is_empty());
            }
            _ => panic!("a migrated document must not need migrating again"),
        }
    }

    /// The consts this module names are the names the struct actually
    /// serialises. If `StudioConfig::tabs` were ever renamed, the backfill gate
    /// would stop recognising a legacy file in silence; this fails instead.
    #[test]
    fn the_keys_this_module_names_are_the_keys_the_struct_serialises() {
        let defaults = default_document();
        assert!(defaults.contains_key(TABS_KEY), "{:?}", defaults.keys());
        assert!(defaults.contains_key(PROJECTS_KEY), "{:?}", defaults.keys());
    }

    /// Not an object, so there is nothing to migrate and — the point — nothing
    /// is written. Overwriting a hand-corrupted file with a defaulted one is
    /// how the user loses the list they were about to repair.
    #[test]
    fn a_corrupt_config_is_reported_and_left_exactly_as_it_was() {
        let corrupt = r#"{ "projects": [ { "id": "a1b2c3", "#;
        assert!(matches!(migrate_text(corrupt), Migration::Unreadable));
        assert!(matches!(migrate_text("[]"), Migration::Unreadable));
        assert!(matches!(migrate_text(""), Migration::Unreadable));

        let path = scratch("corrupt");
        std::fs::write(&path, corrupt).unwrap();
        let err = migrate_file(&path).expect_err("a corrupt file must be reported");
        let after = std::fs::read_to_string(&path).unwrap();
        let _ = std::fs::remove_file(&path);

        assert_eq!(after, corrupt, "the file must be byte-identical");
        assert!(err.contains("nothing has been changed"), "{err}");
    }

    /// A path with no file is a first launch, not a fault.
    #[test]
    fn a_config_that_does_not_exist_yet_is_not_a_failure() {
        let path = scratch("absent");
        let _ = std::fs::remove_file(&path);
        let report = migrate_file(&path).expect("a missing config is not an error");
        assert_eq!(report, Report::default());
        assert!(!path.exists(), "nothing may be created by reading nothing");
    }

    // -----------------------------------------------------------------------
    // Task 120 — one legacy terminal, one Claude tab
    // -----------------------------------------------------------------------

    /// One tab per project, of the Claude provider, claiming no process.
    #[test]
    fn one_legacy_terminal_becomes_exactly_one_claude_tab_per_project() {
        let (doc, report) = migrated(LEGACY);
        let rows = tab_rows(&doc);

        assert_eq!(rows.len(), 3, "one tab per project and never two");
        assert_eq!(
            report.tabs_backfilled,
            vec![
                "a1b2c3".to_string(),
                "d4e5f6".to_string(),
                "070809".to_string()
            ],
            "in the order the projects are listed"
        );

        for (row, project) in rows.iter().zip(["a1b2c3", "d4e5f6", "070809"]) {
            assert_eq!(row["projectId"], project);
            assert_eq!(row["type"], "agent");
            assert_eq!(row["providerId"], CLAUDE_CODE_ID);
            assert_eq!(row["title"], "Agent");
            // Not `null` — absent. Nothing this migration writes carries a
            // field whose only honest value is "no process".
            assert!(
                row.get("sessionId").is_none(),
                "a backfilled tab must not write a session id at all: {row}"
            );
        }

        // Distinct as a set, so two projects cannot address one terminal.
        let ids: HashSet<&str> = rows.iter().filter_map(|r| r["id"].as_str()).collect();
        assert_eq!(ids.len(), 3, "two backfilled tabs share an id");

        // And read back through the live shape, the tabs claim nothing. The
        // project whose folder is gone has its tab like any other: a dead PATH
        // is not a removed project.
        let cfg: StudioConfig = serde_json::from_value(Value::Object(doc)).unwrap();
        assert_eq!(cfg.tabs.open.len(), 3);
        assert!(
            cfg.tabs.open.iter().all(|t| t.session_id.is_none()),
            "a restored tab must never claim a process"
        );
        assert!(cfg.tabs.open.iter().all(|t| t.kind == TabType::Agent));
        assert_eq!(
            cfg.tabs.open[1].project_id, "d4e5f6",
            "the project whose folder is gone keeps its tab"
        );
        assert!(!std::path::Path::new(&cfg.projects[1].path).exists());
    }

    /// Idempotence, which is the half of Task 120 that matters most: running
    /// the backfill twice must not produce a second tab.
    #[test]
    fn running_the_backfill_twice_does_not_produce_a_second_tab() {
        let (first, report) = migrated(LEGACY);
        assert_eq!(report.tabs_backfilled.len(), 3);
        let once = serde_json::to_string_pretty(&Value::Object(first.clone())).unwrap();

        // Through the document entry point…
        let mut again = parse(&once).unwrap();
        let second = migrate_document(&mut again);
        assert!(
            second.tabs_backfilled.is_empty(),
            "the second pass backfilled again: {second:?}"
        );
        assert_eq!(tab_rows(&again).len(), 3, "three tabs, not six");
        assert_eq!(tab_rows(&again), tab_rows(&first), "and the same three");

        // …and through the file entry point, twice over, which is what a
        // relaunch does.
        let path = scratch("twice");
        std::fs::write(&path, LEGACY).unwrap();
        let one = migrate_file(&path).expect("the first run migrates");
        let after_one = std::fs::read_to_string(&path).unwrap();
        let two = migrate_file(&path).expect("the second run is a no-op");
        let after_two = std::fs::read_to_string(&path).unwrap();
        let _ = std::fs::remove_file(&path);

        assert_eq!(one.tabs_backfilled.len(), 3);
        assert!(two.tabs_backfilled.is_empty(), "{two:?}");
        assert!(!two.changed(), "the second run must write nothing: {two:?}");
        assert_eq!(after_one, after_two, "the file must be byte-identical");
        let cfg: StudioConfig = serde_json::from_str(&after_two).unwrap();
        assert_eq!(cfg.tabs.open.len(), 3);
    }

    /// The distinction `#[serde(default)]` cannot express, and the reason this
    /// module reads a document: an empty tab list is a user who closed their
    /// last tab, not a file from before tabs existed. Keying the backfill on
    /// the empty LIST would hand that user a tab back on every launch.
    #[test]
    fn a_user_who_closed_their_last_tab_is_not_given_one_back() {
        let closed = r#"{
            "projects": [{ "id": "a1b2c3", "name": "EffiClaude", "path": "/Users/me/dev/e" }],
            "claude_override": null,
            "panels": {},
            "tabs": { "open": [] }
        }"#;
        let (doc, report) = migrated(closed);
        assert!(
            report.tabs_backfilled.is_empty(),
            "an empty tab list is a choice: {report:?}"
        );
        assert!(tab_rows(&doc).is_empty(), "no tab may be invented");
        // The newer keys were still defaulted — this file needed that much.
        assert!(doc.contains_key("connections"));
    }

    /// A workbench-era document is left exactly as its user arranged it: the
    /// order, the titles and the providers are untouched, and no fourth tab
    /// appears beside them.
    #[test]
    fn tabs_a_user_already_arranged_are_not_touched() {
        let arranged = r#"{
            "projects": [{ "id": "a1b2c3", "name": "EffiClaude", "path": "/Users/me/dev/e" }],
            "panels": {},
            "tabs": { "open": [
                { "id": "t2", "projectId": "a1b2c3", "type": "shell", "title": "Shell", "providerId": null },
                { "id": "t1", "projectId": "a1b2c3", "type": "agent", "title": "My agent", "providerId": "codex" }
            ] }
        }"#;
        let (doc, report) = migrated(arranged);
        assert!(report.tabs_backfilled.is_empty());

        let rows = tab_rows(&doc);
        assert_eq!(rows.len(), 2, "no tab added beside the user's own");
        assert_eq!(rows[0]["id"], "t2", "the order the user arranged");
        assert_eq!(rows[1]["id"], "t1");
        assert_eq!(rows[1]["title"], "My agent");
        assert_eq!(rows[1]["providerId"], "codex");
    }

    /// Never two PTYs from one source, taken literally: a document that lists
    /// the same project twice still gets one tab for it.
    #[test]
    fn one_project_listed_twice_still_gets_one_tab() {
        let doubled = r#"{
            "projects": [
                { "id": "a1b2c3", "name": "EffiClaude", "path": "/Users/me/dev/e" },
                { "id": "a1b2c3", "name": "EffiClaude", "path": "/Users/me/dev/e" }
            ],
            "panels": {}
        }"#;
        let (doc, report) = migrated(doubled);
        assert_eq!(report.tabs_backfilled, vec!["a1b2c3".to_string()]);
        assert_eq!(tab_rows(&doc).len(), 1, "one source, one tab");
    }

    /// Nothing to backfill, so `tabs` arrives by the defaults pass instead and
    /// says so.
    #[test]
    fn a_config_with_no_projects_gets_the_tabs_default_and_no_tab() {
        let empty = r#"{ "projects": [], "claude_override": null, "panels": {} }"#;
        let (doc, report) = migrated(empty);
        assert!(report.tabs_backfilled.is_empty());
        assert!(
            report.defaults_added.contains(&TABS_KEY.to_string()),
            "{report:?}"
        );
        assert!(tab_rows(&doc).is_empty());
    }

    // -----------------------------------------------------------------------
    // Task 125 — the round trip
    // -----------------------------------------------------------------------

    /// Task 125, and the one cycle projects.rs's three compatibility tests do
    /// not perform.
    ///
    /// `config_from_before_the_newer_keys_keeps_its_projects`,
    /// `an_old_file_does_not_degrade_to_default` and
    /// `a_full_config_written_before_connections_existed_keeps_everything` all
    /// stop at a successful LOAD, and a load is where nothing can be lost:
    /// serde ignores what it does not know, so the read always succeeds and
    /// always looks right. The loss happens on the WRITE, and becomes visible
    /// only on the read after it. This test performs load → save → reload, and
    /// then a second save, so what it asserts is a FIXED POINT: the bytes the
    /// app writes for this config are the bytes it writes for it next time too.
    ///
    /// It adds, over those three: the write and the second read; the byte
    /// comparison of two successive saves; the same cycle through the
    /// migration as well as through the typed path; and the edge case none of
    /// them covers — a project whose FOLDER no longer exists. `live_tabs`
    /// drops the tabs of removed PROJECTS, keyed on the project id
    /// (tabs.rs:122-130); a path that has gone is a different thing, and the
    /// row must survive.
    ///
    /// The scratch file is in the OS temp dir and `load()`/`save()` are
    /// reproduced from their own bodies, because the real ones read and write
    /// `$HOME/.efficlaude/studio.json` and no test may touch the user's config.
    #[test]
    fn legacy_studio_json_round_trips() {
        let path = scratch("round-trip");
        std::fs::write(&path, LEGACY).expect("the scratch file is writable");

        // --- load → save → reload, through the production expressions. ---
        let first = load_from(&path);
        let written_once = save_to(&path, &first);
        let reloaded = load_from(&path);
        let written_twice = save_to(&path, &reloaded);

        let gone = Path::new("/Users/me/dev/deleted-2026-10-29");
        assert!(
            !gone.exists(),
            "this test is only meaningful while that folder does not exist"
        );

        // The project list, and ITS ORDER.
        let ids: Vec<&str> = reloaded.projects.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(
            ids,
            ["a1b2c3", "d4e5f6", "070809"],
            "the project list and its order must survive a save"
        );
        let names: Vec<&str> = reloaded.projects.iter().map(|p| p.name.as_str()).collect();
        assert_eq!(names, ["EffiClaude", "gone", "studio"]);
        assert_eq!(reloaded.projects[0].path, "/Users/me/dev/EffiClaude");
        assert_eq!(
            reloaded.projects[1].path, "/Users/me/dev/deleted-2026-10-29",
            "a project whose folder no longer exists must still round-trip"
        );
        assert_eq!(reloaded.projects[2].path, "/Users/me/dev/studio");

        // The panel preferences — the two that were set and the three that
        // were not, so a default could not pass for a stored `true`.
        assert!(reloaded.panels.sidebar_collapsed);
        assert!(reloaded.panels.history_collapsed);
        assert!(!reloaded.panels.properties_collapsed);
        assert!(!reloaded.panels.tasks_collapsed);
        assert!(!reloaded.panels.flow_collapsed);

        // The Claude override.
        assert_eq!(
            reloaded.claude_override.as_deref(),
            Some("/Users/me/.local/bin/claude"),
            "the override path must survive a save"
        );

        // A fixed point: the second save is byte-identical to the first, so
        // nothing is being quietly shed one cycle at a time.
        assert_eq!(
            written_once, written_twice,
            "load→save is not a fixed point, so something is lost per cycle"
        );

        // --- and the same cycle through the migration. ---
        std::fs::write(&path, LEGACY).unwrap();
        migrate_file(&path).expect("the legacy file migrates");
        let after_migration = std::fs::read_to_string(&path).unwrap();
        let migrated_cfg = load_from(&path);
        let written_after = save_to(&path, &migrated_cfg);
        let final_cfg = load_from(&path);

        let _ = std::fs::remove_file(&path);
        assert!(
            !path.with_extension("json.migrating").exists(),
            "the scratch sibling must not be left behind"
        );

        assert!(
            after_migration.contains("\"a1b2c3\""),
            "the migration wrote a config that still names the projects"
        );
        let ids: Vec<&str> = final_cfg.projects.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(
            ids,
            ["a1b2c3", "d4e5f6", "070809"],
            "order must survive the migration and the save after it"
        );
        assert_eq!(
            final_cfg.claude_override.as_deref(),
            Some("/Users/me/.local/bin/claude"),
            "the override must survive the migration and the save after it"
        );
        // This is Task 125's acceptance in one line: a regression that RESETS
        // an upgrading user's configuration fails here. Both of these were set
        // in the legacy file, so a default standing in for either is a reset.
        assert!(
            final_cfg.panels.sidebar_collapsed && final_cfg.panels.history_collapsed,
            "the panel preferences were reset by the upgrade: sidebar={} history={}",
            final_cfg.panels.sidebar_collapsed,
            final_cfg.panels.history_collapsed
        );
        assert!(
            !final_cfg.panels.tasks_collapsed,
            "a preference the user never set must not arrive set"
        );
        // The backfilled tabs came through the save too, still claiming nothing.
        assert_eq!(
            final_cfg.tabs.open.len(),
            3,
            "the migration must have landed on disk and survived the save"
        );
        assert!(final_cfg.tabs.open.iter().all(|t| t.session_id.is_none()));
        assert!(
            written_after.contains("\"sessionId\": null"),
            "save() writes the field as null; what matters is that it reads \
             back as None, which the assertion above checks"
        );
    }
}

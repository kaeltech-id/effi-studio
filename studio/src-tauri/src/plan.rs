use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone)]
pub struct Task {
    pub done: bool,
    pub text: String,
}

/// `- [X]` with a capital X is deliberately NOT matched: the Stop-hook driver is
/// this strict too, and the two must never disagree about progress.
pub fn parse_tasks(md: &str) -> Vec<Task> {
    md.lines()
        .filter_map(|l| {
            let t = l.trim_start();
            t.strip_prefix("- [x] ")
                .map(|r| (true, r))
                .or_else(|| t.strip_prefix("- [ ] ").map(|r| (false, r)))
                .map(|(done, text)| Task { done, text: text.to_string() })
        })
        .collect()
}

/// Same `k=v` grammar the driver writes in hooks/session_stop.py.
pub fn parse_autoflow(txt: &str) -> HashMap<String, String> {
    txt.lines()
        .filter_map(|l| l.split_once('=').map(|(k, v)| (k.trim().to_string(), v.trim().to_string())))
        .collect()
}

const AUTOFLOW_MAX_AGE: u64 = 7200;

#[derive(Serialize, Clone, Copy, PartialEq)]
pub enum Stage {
    Idle,
    Brainstorm,
    Plan,
    Refine,
    Execute,
    Review,
}

fn stage_from_name(name: &str) -> Option<Stage> {
    match name {
        "brainstorm" => Some(Stage::Brainstorm),
        "plan" => Some(Stage::Plan),
        "refine" => Some(Stage::Refine),
        "execute" => Some(Stage::Execute),
        "review" => Some(Stage::Review),
        _ => None,
    }
}

/// A stale or foreign-branch sentinel reads as absent. It is never deleted here —
/// removing it is the driver's job, and doing it from the app would corrupt a
/// chain that is still running.
fn stage_from_sentinel(root: &Path, branch: &str) -> Option<Stage> {
    let txt = std::fs::read_to_string(root.join(".claude/.autoflow")).ok()?;
    let fields = parse_autoflow(&txt);

    if fields.get("branch").map(String::as_str) != Some(branch) {
        return None;
    }
    let created: u64 = fields.get("created")?.parse().ok()?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs();
    if now.saturating_sub(created) > AUTOFLOW_MAX_AGE {
        return None;
    }
    stage_from_name(fields.get("stage")?)
}

/// Precedence, highest first — existence and content checks only, no writes.
fn derive_stage(root: &Path, branch: &str, plan: Option<&str>, has_decision: bool) -> Stage {
    if root.join(format!(".claude/.review-done-{branch}")).exists() {
        return Stage::Review;
    }
    if let Some(md) = plan {
        let tasks = parse_tasks(md);
        if tasks.iter().any(|t| !t.done) {
            // Mirrors the driver in hooks/session_stop.py: an unaudited plan is
            // waiting on /ec-refine, not on execution. The panel and the chain
            // must never disagree about which stage a project is in.
            return if root.join(format!(".claude/.refined-{branch}")).exists() {
                Stage::Execute
            } else {
                Stage::Refine
            };
        }
        if !tasks.is_empty() {
            return Stage::Review;
        }
    }
    if has_decision {
        return Stage::Plan;
    }
    Stage::Idle
}

#[derive(Serialize, Clone)]
pub struct HistoryEntry {
    pub file: String,
    pub branch: String,
    pub date: String,
    pub time: String,
    pub slug: String,
    pub title: Option<String>,
}

fn is_year(part: &str) -> bool {
    part.len() == 4 && part.chars().all(|c| c.is_ascii_digit())
}

/// `{branch}-{YYYY-MM-DD}-{HHMM}-{slug}.md`. The branch may itself contain `-`
/// (feat-x), so the year is the anchor rather than a fixed field index.
fn parse_archive_name(stem: &str) -> Option<(String, String, String, String)> {
    let parts: Vec<&str> = stem.split('-').collect();
    // The year needs three fields after it (month, day, time) plus a slug.
    let year_at = (0..parts.len()).find(|&i| i > 0 && is_year(parts[i]) && parts.len() > i + 4)?;
    let branch = parts[..year_at].join("-");
    let date = parts[year_at..year_at + 3].join("-");
    let time = parts[year_at + 3].to_string();
    let slug = parts[year_at + 4..].join("-");
    Some((branch, date, time, slug))
}

fn feature_title(md: &str) -> Option<String> {
    md.lines()
        .find_map(|l| l.trim_start().strip_prefix("## Feature:"))
        .map(|t| t.trim().to_string())
}

/// Files that do not match the grammar are skipped in silence, never surfaced
/// as errors — the archive is not this app's to validate.
pub fn read_history(root: &Path) -> Vec<HistoryEntry> {
    let dir = root.join(".claude/plans/archive");
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };

    let mut out: Vec<HistoryEntry> = entries
        .filter_map(Result::ok)
        .filter_map(|e| {
            let path = e.path();
            if path.extension().and_then(|s| s.to_str()) != Some("md") {
                return None;
            }
            let stem = path.file_stem()?.to_str()?.to_string();
            let (branch, date, time, slug) = parse_archive_name(&stem)?;
            let title = std::fs::read_to_string(&path).ok().and_then(|md| feature_title(&md));
            Some(HistoryEntry {
                file: path.file_name()?.to_string_lossy().into_owned(),
                branch,
                date,
                time,
                slug,
                title,
            })
        })
        .collect();

    out.sort_by(|a, b| (&b.date, &b.time).cmp(&(&a.date, &a.time)));
    out
}

/// `.git/HEAD` is read directly: shelling out to `git` from a GUI app would
/// depend on a PATH this process does not have at hand.
fn current_branch(root: &Path) -> String {
    std::fs::read_to_string(root.join(".git/HEAD"))
        .ok()
        .and_then(|head| {
            head.trim()
                .strip_prefix("ref: refs/heads/")
                .map(str::to_string)
        })
        .unwrap_or_else(|| "default".to_string())
}

#[derive(Serialize, Clone)]
/// camelCase on the wire: the TS side is camelCase throughout, and a silent
/// mismatch would surface as `undefined` in a panel rather than a type error.
#[serde(rename_all = "camelCase")]
pub struct ProjectState {
    pub branch: String,
    pub stage: Stage,
    pub tasks: Vec<Task>,
    pub done: usize,
    pub total: usize,
    pub feature_title: Option<String>,
    pub raw_plan: Option<String>,
    pub history: Vec<HistoryEntry>,
    pub has_decision: bool,
    /// `derive_stage` returns `Stage::Review` both for a plan awaiting review
    /// and for one whose review is finished (plan.rs:78 vs :94). Only this
    /// field separates them, and the UI needs the difference to name git as the
    /// next step rather than offering review a second time.
    pub review_done: bool,
}

/// Returns a value in every case and never `Err` — a failure here would blank
/// the panel for a folder that is merely not an EffiClaude project.
#[tauri::command]
pub fn read_project_state(path: String) -> ProjectState {
    let root = PathBuf::from(&path);
    let branch = current_branch(&root);

    let plan = std::fs::read_to_string(root.join(format!(".claude/plans/{branch}.md"))).ok();
    let has_decision = root.join(format!(".claude/decisions/{branch}.md")).exists();

    let tasks = plan.as_deref().map(parse_tasks).unwrap_or_default();
    let done = tasks.iter().filter(|t| t.done).count();
    let total = tasks.len();

    let review_done = root.join(format!(".claude/.review-done-{branch}")).exists();

    let stage = stage_from_sentinel(&root, &branch)
        .unwrap_or_else(|| derive_stage(&root, &branch, plan.as_deref(), has_decision));

    ProjectState {
        branch,
        stage,
        tasks,
        done,
        total,
        feature_title: plan.as_deref().and_then(feature_title),
        raw_plan: plan,
        history: read_history(&root),
        has_decision,
        review_done,
    }
}

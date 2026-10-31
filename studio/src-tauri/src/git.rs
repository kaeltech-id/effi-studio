use crate::shell_env;
use serde::Serialize;
use std::path::Path;
use std::process::Command;

/// Capped and the remainder reported as a count, the same contract
/// history-panel.tsx uses for archived runs. A repository with hundreds of
/// branches must cost a bounded render.
const MAX_BRANCHES: usize = 50;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub current: bool,
}

/// `detached` is carried explicitly rather than inferred from an absent branch
/// name: plan.rs falls back to the literal string "default" when `.git/HEAD`
/// holds no ref, which would otherwise read as a branch actually named
/// "default".
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub available: bool,
    pub branch: Option<String>,
    pub detached: bool,
    pub branches: Vec<BranchInfo>,
    pub hidden: usize,
    /// Why git state could not be read — a missing binary, or a path that is
    /// not a work tree. Rendered as a disabled state, never as a crash.
    pub error: Option<String>,
}

/// One helper for every git call: the resolved BINARY with an explicit `-C`,
/// never a shell. A login shell would hit the etok function wrapper and pipe
/// `branch` output through the token optimiser.
fn run(root: &Path, args: &[&str]) -> Result<String, String> {
    let git = shell_env::resolve_git()?;
    let out = Command::new(git)
        .arg("-C")
        .arg(root)
        .args(args)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        // stderr verbatim: git already writes the right message, and the user
        // fixes it themselves. Never reworded, never truncated.
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

/// Never `Err` — a folder without git is a report, not a failure.
#[tauri::command]
pub fn git_info(path: String) -> GitInfo {
    let root = Path::new(&path);
    let unavailable = |error: String| GitInfo {
        available: false,
        branch: None,
        detached: false,
        branches: Vec::new(),
        hidden: 0,
        error: Some(error),
    };

    // Exits non-zero outside a work tree, which is the cheapest probe.
    if let Err(e) = run(root, &["rev-parse", "--is-inside-work-tree"]) {
        return unavailable(e);
    }

    // symbolic-ref fails on a detached HEAD, which is exactly how it is detected.
    let branch = match run(root, &["symbolic-ref", "--short", "HEAD"]) {
        Ok(name) => Some(name.trim().to_string()),
        Err(_) => None,
    };
    let detached = branch.is_none();

    // `branch --format` covers loose AND packed refs; reading .git/refs/heads/
    // would silently omit every packed branch, and .git/packed-refs is common.
    let listed = run(root, &["branch", "--format=%(refname:short)"]).unwrap_or_default();
    let all: Vec<&str> = listed
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .collect();
    let hidden = all.len().saturating_sub(MAX_BRANCHES);
    let branches = all
        .into_iter()
        .take(MAX_BRANCHES)
        .map(|name| BranchInfo {
            current: Some(name) == branch.as_deref(),
            name: name.to_string(),
        })
        .collect();

    GitInfo {
        available: true,
        branch,
        detached,
        branches,
        hidden,
        error: None,
    }
}

/// `available` and `error` are carried alongside the counts because a clean
/// tree and an unreadable one are different facts: zeros alone would render
/// "0 files changed" for a missing git binary.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffStat {
    pub available: bool,
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub error: Option<String>,
}

/// Never `Err` — the same contract as `git_info`.
#[tauri::command]
pub fn git_diff_stat(path: String) -> DiffStat {
    let root = Path::new(&path);
    let empty = |error: Option<String>| DiffStat {
        available: error.is_none(),
        files_changed: 0,
        insertions: 0,
        deletions: 0,
        error,
    };

    let out = match run(root, &["diff", "--numstat", "HEAD"]) {
        Ok(out) => out,
        Err(e) => return empty(Some(e)),
    };

    let mut stat = empty(None);
    for line in out.lines().filter(|l| !l.trim().is_empty()) {
        let mut cols = line.split('\t');
        let added = cols.next().unwrap_or("-");
        let removed = cols.next().unwrap_or("-");
        stat.files_changed += 1;
        // A binary file reports "-" for both columns; count the file, not a
        // line total that does not exist.
        stat.insertions += added.parse::<usize>().unwrap_or(0);
        stat.deletions += removed.parse::<usize>().unwrap_or(0);
    }
    stat
}

/// Returns `Err` with git's own stderr on refusal, most often uncommitted
/// changes that would be overwritten. Deliberately no force flag and no
/// autostash: the user fixes the tree themselves, which is what keeps /ec-git
/// the only thing that writes history.
#[tauri::command]
pub fn git_checkout(path: String, branch: String) -> Result<GitInfo, String> {
    run(Path::new(&path), &["checkout", &branch])?;
    Ok(git_info(path))
}

/// `checkout -b`, which creates from the current HEAD and switches in one step.
/// A duplicate name is refused by git, so no name validation happens here.
#[tauri::command]
pub fn git_create_branch(path: String, name: String) -> Result<GitInfo, String> {
    run(Path::new(&path), &["checkout", "-b", &name])?;
    Ok(git_info(path))
}

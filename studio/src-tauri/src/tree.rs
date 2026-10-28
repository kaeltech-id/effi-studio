use serde::Serialize;
use std::path::{Path, PathBuf};

/// Three states, not a boolean: a folder inside a repository is neither a
/// repository nor unrelated to one, and collapsing the two would mislabel
/// every subdirectory of every project.
#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum GitMark {
    /// This directory holds `.git` itself.
    Repo,
    /// An ancestor holds `.git`; this directory is tracked but is not the root.
    InRepo,
    /// Neither this directory nor any ancestor within range holds `.git`.
    Plain,
}

/// Build and dependency directories are skipped by name. Expanding a project
/// root must not offer `node_modules` as something to browse, and a user who
/// opens one has no workflow to run inside it.
const SKIP_DIRS: [&str; 6] = ["node_modules", "target", "dist", "build", ".next", "venv"];

/// One level of a directory is capped and the remainder reported as a count,
/// the same contract `history-panel.tsx` uses for archived runs. A folder with
/// thousands of entries must cost a bounded render, not a proportional one.
const MAX_CHILDREN: usize = 50;

/// `.git` is tested with `exists()`, not `is_dir()`: in a linked worktree or a
/// submodule it is a FILE containing a gitdir pointer, and treating that as
/// "not a repository" would mislabel exactly the layouts most likely to appear.
fn is_repo(dir: &Path) -> bool {
    dir.join(".git").exists()
}

/// `stop_at` bounds the walk — the parent of the folder the user added. Walking
/// to `/` would let an unrelated repository far up the filesystem mark every
/// folder on the machine as tracked.
pub fn git_mark(dir: &Path, stop_at: Option<&Path>) -> GitMark {
    if is_repo(dir) {
        return GitMark::Repo;
    }
    let mut cur = dir.parent();
    while let Some(p) = cur {
        if is_repo(p) {
            return GitMark::InRepo;
        }
        if Some(p) == stop_at {
            break;
        }
        cur = p.parent();
    }
    GitMark::Plain
}

/// One directory entry as the sidebar renders it. `has_children` is a cheap
/// probe, not a listing: the chevron must be hidden on a leaf, and finding
/// that out must not cost a full recursive read.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TreeChild {
    pub name: String,
    pub path: String,
    pub git_mark: GitMark,
    pub has_children: bool,
}

/// The children of one level plus how many the cap held back, so the sidebar
/// can render a truthful "+N more" instead of silently losing rows.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TreeLevel {
    pub children: Vec<TreeChild>,
    pub hidden: usize,
}

/// `spawn_blocking`, not a bare async fn: `read_dir` is blocking, and running it
/// on a tokio worker would stall every other command while a slow or networked
/// directory is enumerated.
#[tauri::command]
pub async fn list_children(path: String, stop_at: Option<String>) -> TreeLevel {
    tokio::task::spawn_blocking(move || {
        let root = PathBuf::from(&path);
        let stop = stop_at.map(PathBuf::from);
        let Ok(entries) = std::fs::read_dir(&root) else {
            return TreeLevel { children: Vec::new(), hidden: 0 };
        };

        let mut dirs: Vec<PathBuf> = entries
            .filter_map(Result::ok)
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .filter(|p| {
                let Some(name) = p.file_name().and_then(|n| n.to_str()) else {
                    return false;
                };
                // Hidden entries and build directories are both excluded, for
                // different reasons: `.git` and `.claude` are machinery, and
                // SKIP_DIRS holds nothing the workflow ever runs in.
                !name.starts_with('.') && !SKIP_DIRS.contains(&name)
            })
            .collect();
        dirs.sort();

        let hidden = dirs.len().saturating_sub(MAX_CHILDREN);
        let children = dirs
            .into_iter()
            .take(MAX_CHILDREN)
            .map(|p| TreeChild {
                name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                path: p.to_string_lossy().into_owned(),
                git_mark: git_mark(&p, stop.as_deref()),
                has_children: has_listable_child(&p),
            })
            .collect();
        TreeLevel { children, hidden }
    })
    .await
    .unwrap_or(TreeLevel { children: Vec::new(), hidden: 0 })
}

/// Stops at the first qualifying entry — the chevron needs a yes or no, never
/// a count, so this must not become a second full listing.
fn has_listable_child(dir: &Path) -> bool {
    std::fs::read_dir(dir)
        .map(|mut it| {
            it.any(|e| {
                e.ok()
                    .filter(|e| e.path().is_dir())
                    .and_then(|e| e.file_name().to_str().map(|n| {
                        !n.starts_with('.') && !SKIP_DIRS.contains(&n)
                    }))
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

use std::process::Command;
use std::sync::OnceLock;

static PROBED_PATH: OnceLock<String> = OnceLock::new();

/// A GUI process launched from Finder does not inherit the user's shell PATH,
/// so the only reliable way to find their tools is to ask the login shell itself.
pub fn login_shell_path() -> &'static str {
    PROBED_PATH.get_or_init(|| {
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into());
        probe(&shell).unwrap_or_else(|| std::env::var("PATH").unwrap_or_default())
    })
}

fn probe(shell: &str) -> Option<String> {
    let output = Command::new(shell)
        .args(["-ilc", "echo $PATH"])
        .output()
        .ok()
        .filter(|o| o.status.success())?;

    // An rc file that prints a banner pollutes stdout, so the PATH is the last
    // non-empty line rather than the whole capture.
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .next_back()
        .map(str::to_string)
}

use std::path::PathBuf;

const FALLBACKS: [&str; 3] = [".local/bin/claude", ".claude/local/claude", "bin/claude"];

/// Absolute fallbacks, not $HOME-relative like FALLBACKS: git is a system or
/// package-manager binary, never a per-user install.
const GIT_FALLBACKS: [&str; 3] = ["/usr/bin/git", "/opt/homebrew/bin/git", "/usr/local/bin/git"];

pub fn resolve_claude(override_path: Option<&str>) -> Result<PathBuf, String> {
    if let Some(p) = override_path.filter(|p| !p.is_empty()) {
        let candidate = PathBuf::from(p);
        return if candidate.is_file() {
            Ok(candidate)
        } else {
            Err(format!("override not found: {p}"))
        };
    }

    for dir in login_shell_path().split(':').filter(|d| !d.is_empty()) {
        let candidate = PathBuf::from(dir).join("claude");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    let home = std::env::var("HOME").unwrap_or_default();
    for fallback in FALLBACKS {
        let candidate = PathBuf::from(&home).join(fallback);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }

    Err("claude binary not found — set it manually in Settings".into())
}

/// The BINARY, resolved to an absolute path on purpose. `git` is commonly a
/// shell function here — the etok wrapper install.sh appends to .zshrc — which
/// pipes `branch` and other subcommands through $ETOK. Running git through a
/// login shell would therefore return an optimised summary instead of a real
/// branch list, so every caller must exec this path directly.
pub fn resolve_git() -> Result<PathBuf, String> {
    for dir in login_shell_path().split(':').filter(|d| !d.is_empty()) {
        let candidate = PathBuf::from(dir).join("git");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    for fallback in GIT_FALLBACKS {
        let candidate = PathBuf::from(fallback);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err("git binary not found on PATH".into())
}

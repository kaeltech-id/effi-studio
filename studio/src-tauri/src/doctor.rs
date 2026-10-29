use crate::shell_env;
use serde::Serialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

/// The 8 commands install.sh:14 installs, and the directory it installs them
/// into (install.sh:8). Both are copied from there rather than invented here —
/// a list that drifts would call a complete install incomplete.
const COMMANDS: [&str; 8] = [
    "ec-setup",
    "ec-brainstorm",
    "ec-plan",
    "ec-refine",
    "ec-execute",
    "ec-review",
    "ec-git",
    "ec-selfhealing",
];

/// The 32 agents install.sh:15 installs, copied from there for the same reason.
/// Checked but never blocking: a missing agent degrades /ec-execute to a
/// warning, it does not stop work, so this must not gate the shell.
const AGENTS: [&str; 32] = [
    "ec-react",
    "ec-vue",
    "ec-nextjs",
    "ec-typescript",
    "ec-tailwind",
    "ec-react-native",
    "ec-flutter",
    "ec-ios",
    "ec-android",
    "ec-mobile-perf",
    "ec-python",
    "ec-nodejs",
    "ec-golang",
    "ec-java",
    "ec-php",
    "ec-sql",
    "ec-nosql",
    "ec-migration",
    "ec-unit-test",
    "ec-e2e",
    "ec-api-test",
    "ec-docker",
    "ec-cicd",
    "ec-cloud",
    "ec-security",
    "ec-performance",
    "ec-refactor",
    "ec-reviewer",
    "ec-api-design",
    "ec-architect",
    "ec-llm",
    "ec-antislop",
];

fn commands_dir() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".claude/commands")
}

fn agents_dir() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".claude/agents")
}

/// A short timeout on purpose: a dead port must not stall the first screen.
const PROBE_TIMEOUT: Duration = Duration::from_secs(1);

/// Hand-rolled GET rather than an HTTP crate — one request against one known
/// loopback endpoint does not justify a dependency.
fn worker_ok() -> bool {
    let Ok(addr) = "127.0.0.1:37777".parse::<SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, PROBE_TIMEOUT) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(PROBE_TIMEOUT));
    let _ = stream.set_write_timeout(Some(PROBE_TIMEOUT));
    if stream
        .write_all(b"GET /health HTTP/1.0\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut body = String::new();
    // read_to_string on a Connection: close response ends at EOF.
    if stream.read_to_string(&mut body).is_err() {
        return false;
    }
    body.contains("\"status\": \"ok\"") || body.contains("\"status\":\"ok\"")
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Doctor {
    pub claude: Option<String>,
    pub commands_found: usize,
    pub commands_expected: usize,
    pub agents_found: usize,
    pub agents_expected: usize,
    pub worker_ok: bool,
}

/// Never `Err`: a failed probe is a report, not an error. The worker being
/// offline is a warning only — memory is optional and the app stays usable.
#[tauri::command]
pub fn run_doctor(override_path: Option<String>) -> Doctor {
    let dir = commands_dir();
    let commands_found = COMMANDS
        .iter()
        .filter(|c| dir.join(format!("{c}.md")).is_file())
        .count();

    let adir = agents_dir();
    let agents_found = AGENTS
        .iter()
        .filter(|a| adir.join(format!("{a}.md")).is_file())
        .count();

    Doctor {
        claude: shell_env::resolve_claude(override_path.as_deref())
            .ok()
            .map(|p| p.to_string_lossy().into_owned()),
        commands_found,
        commands_expected: COMMANDS.len(),
        agents_found,
        agents_expected: AGENTS.len(),
        worker_ok: worker_ok(),
    }
}

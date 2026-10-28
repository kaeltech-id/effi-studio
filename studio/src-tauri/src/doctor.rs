use crate::shell_env;
use serde::Serialize;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::time::Duration;

/// The 11 commands install.sh:14 installs, and the directory it installs them
/// into (install.sh:8). Both are copied from there rather than invented here —
/// a list that drifts would call a complete install incomplete.
const COMMANDS: [&str; 11] = [
    "ec-setup",
    "ec-feature",
    "ec-brainstorm",
    "ec-execute",
    "ec-review",
    "ec-git",
    "ec-export",
    "ec-import",
    "ec-mode",
    "ec-next",
    "ec-selfhealing",
];

fn commands_dir() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default()).join(".claude/commands")
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

    Doctor {
        claude: shell_env::resolve_claude(override_path.as_deref())
            .ok()
            .map(|p| p.to_string_lossy().into_owned()),
        commands_found,
        commands_expected: COMMANDS.len(),
        worker_ok: worker_ok(),
    }
}

use base64::{engine::general_purpose::STANDARD, Engine as _};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
}

/// argv stays a list from the agent definition all the way to CommandBuilder.
/// Joining it into one command string would re-split a provider installed at
/// `/Users/me/My Tools/codex` on the space and try to exec `/Users/me/My`.
pub fn spawn(cwd: &str, program: &str, args: &[String], path: &str) -> Result<PtySession, String> {
    let pair = native_pty_system()
        .openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(program);
    cmd.args(args);
    cmd.cwd(cwd);
    cmd.env("PATH", path);
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    // The slave must be dropped or the master never sees EOF when the child exits.
    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    Ok(PtySession { master: pair.master, child, writer })
}

impl PtySession {
    pub fn reader(&self) -> Result<Box<dyn Read + Send>, String> {
        self.master.try_clone_reader().map_err(|e| e.to_string())
    }
}

use tauri::{AppHandle, Emitter};

pub fn start_reader(app: AppHandle, id: String, mut reader: Box<dyn Read + Send>) {
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => {
                    let _ = app.emit("pty://exit", &id);
                    break;
                }
                Ok(n) => {
                    // base64, not a lossy String: an 8KB read can split a multi-byte
                    // sequence, and decoding each chunk alone turns box-drawing glyphs
                    // into replacement chars. xterm joins the bytes itself.
                    let chunk = STANDARD.encode(&buf[..n]);
                    let _ = app.emit("pty://output", (&id, chunk));
                }
            }
        }
    });
}

impl PtySession {
    pub fn write(&mut self, data: &str) -> Result<(), String> {
        self.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        // Without the flush, keystrokes sit in the buffer and the TUI looks frozen.
        self.writer.flush().map_err(|e| e.to_string())
    }

    pub fn resize(&self, rows: u16, cols: u16) -> Result<(), String> {
        self.master
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())
    }

    pub fn kill(&mut self) {
        let _ = self.child.kill();
        // wait() reaps the child; without it the killed process becomes a zombie.
        let _ = self.child.wait();
    }

    /// Whether the process this session was spawned for has already terminated,
    /// asked without blocking.
    ///
    /// Deliberately NOT the `pty://exit` event above. That event fires when the
    /// master sees EOF, which says the slave side has no writer left — it is an
    /// exit signal for the pane and nothing more. This answers the narrower
    /// question a session-reuse guard has to ask: is there still a live process
    /// occupying this slot. Neither one says the work the process was doing
    /// finished, and neither is readiness: a shell script's children can outlive
    /// the shell, so only a diagnostic can say that.
    ///
    /// A probe error is reported as "not exited", the conservative answer: an
    /// unanswerable `try_wait` must never be read as permission to reuse the
    /// slot. `try_wait` reaps a terminated child, so a `true` here also means
    /// the session can be dropped without leaving a zombie.
    pub fn has_exited(&mut self) -> bool {
        matches!(self.child.try_wait(), Ok(Some(_)))
    }
}

use std::collections::HashMap;
use std::sync::Mutex;

/// One PTY per session, keyed on a session id generated per open, so one
/// project holds as many simultaneous sessions as it has tabs — a Claude Code
/// session, a Codex session and a shell, each with its own process. Keyed on a
/// project id instead, a second tab would either be refused or inherit the
/// first tab's process and receive its keystrokes.
///
/// The lock is held only for map operations, never across a blocking read —
/// the reader lives on its own thread with a cloned handle.
#[derive(Default)]
pub struct SessionRegistry(pub Mutex<HashMap<String, PtySession>>);

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex as StdMutex};
    use std::time::{Duration, Instant};

    /// Task 123, the half that belongs here rather than in `tabs.rs`.
    ///
    /// `tabs.rs` says three times that it never reaches the session registry,
    /// and `open_tab` writes to the user's real studio.json, so the key-identity
    /// half of Task 123 lives there as
    /// `two_sessions_in_one_project_do_not_share_a_key` and the IO half lives
    /// here, where `SessionRegistry` does. Importing `pty` into `tabs.rs` to
    /// hold a registry beside the tab list would have built the coupling those
    /// comments exist to prevent.
    ///
    /// `/bin/cat` rather than a provider CLI, as the task requires: it echoes
    /// its input back through the pty, which is exactly enough to tell whose
    /// bytes arrived where. Nothing here spawns `claude` or `codex`.
    #[test]
    fn two_sessions_never_receive_each_others_bytes() {
        let path = std::env::var("PATH").unwrap_or_else(|_| "/usr/bin:/bin".to_string());
        let reg = SessionRegistry::default();

        // Two sessions for ONE project, which is the case the registry exists
        // to keep apart: before it was keyed, a second tab could reach the
        // first tab's process and receive its keystrokes.
        for id in ["sess-alpha", "sess-bravo"] {
            let session = match spawn("/tmp", "/bin/cat", &[], &path) {
                Ok(s) => s,
                // A sandbox that forbids a pty is a fact about the environment,
                // not a defect in the registry. Reported rather than silently
                // passing, so this never reads as a green that proved nothing.
                Err(e) => {
                    eprintln!("SKIPPED: no pty available in this environment: {e}");
                    return;
                }
            };
            reg.0.lock().unwrap().insert(id.to_string(), session);
        }

        // Readers are taken before anything is written, the same ordering the
        // app uses: subscribe, then start.
        let mut sinks = Vec::new();
        for id in ["sess-alpha", "sess-bravo"] {
            let mut reader = reg.0.lock().unwrap().get(id).unwrap().reader().unwrap();
            let buf = Arc::new(StdMutex::new(Vec::<u8>::new()));
            let sink = Arc::clone(&buf);
            std::thread::spawn(move || {
                let mut chunk = [0u8; 1024];
                while let Ok(n) = reader.read(&mut chunk) {
                    if n == 0 {
                        break;
                    }
                    sink.lock().unwrap().extend_from_slice(&chunk[..n]);
                }
            });
            sinks.push((id, buf));
        }

        let markers = [
            ("sess-alpha", "MARKER-ALPHA"),
            ("sess-bravo", "MARKER-BRAVO"),
        ];
        for (id, marker) in markers {
            reg.0
                .lock()
                .unwrap()
                .get_mut(id)
                .unwrap()
                .write(&format!("{marker}\n"))
                .unwrap();
        }

        // Bounded wait rather than a sleep: it returns as soon as both markers
        // have landed, and gives up on a deadline instead of hanging. No
        // assertion here depends on how long it took -- a duration assertion is
        // the flake class this suite has already had to fix once.
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            let seen = sinks.iter().all(|(id, buf)| {
                let mine = markers.iter().find(|(m, _)| m == id).unwrap().1;
                String::from_utf8_lossy(&buf.lock().unwrap()).contains(mine)
            });
            if seen || Instant::now() > deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }

        // The assertion that matters: each session saw its own marker and never
        // the other's.
        for (id, buf) in &sinks {
            let got = String::from_utf8_lossy(&buf.lock().unwrap()).to_string();
            let mine = markers.iter().find(|(m, _)| m == id).unwrap().1;
            let theirs = markers.iter().find(|(m, _)| m != id).unwrap().1;
            assert!(
                got.contains(mine),
                "{id} never received its own marker; got {got:?}"
            );
            assert!(
                !got.contains(theirs),
                "{id} received another session's bytes ({theirs}); got {got:?}"
            );
        }

        // Keys stayed distinct, and nothing merged the two entries.
        assert_eq!(reg.0.lock().unwrap().len(), 2);

        for (id, _) in &sinks {
            reg.0.lock().unwrap().get_mut(*id).unwrap().kill();
        }
        // Reaped, so the test leaves no stray /bin/cat behind.
        for (id, _) in &sinks {
            let mut map = reg.0.lock().unwrap();
            let s = map.get_mut(*id).unwrap();
            let deadline = Instant::now() + Duration::from_secs(5);
            while !s.has_exited() && Instant::now() < deadline {
                std::thread::sleep(Duration::from_millis(20));
            }
            assert!(s.has_exited(), "{id} was not reaped after kill()");
        }
        reg.0.lock().unwrap().clear();
    }
}

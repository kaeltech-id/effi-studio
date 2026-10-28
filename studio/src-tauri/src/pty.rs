use base64::{engine::general_purpose::STANDARD, Engine as _};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};

pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    writer: Box<dyn Write + Send>,
}

pub fn spawn(cwd: &str, program: &str, path: &str) -> Result<PtySession, String> {
    let pair = native_pty_system()
        .openpty(PtySize { rows: 40, cols: 120, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new(program);
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
}

use std::collections::HashMap;
use std::sync::Mutex;

/// One PTY per project. The lock is held only for map operations, never across
/// a blocking read — the reader lives on its own thread with a cloned handle.
#[derive(Default)]
pub struct SessionRegistry(pub Mutex<HashMap<String, PtySession>>);

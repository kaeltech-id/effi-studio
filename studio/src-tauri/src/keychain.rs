// ---------------------------------------------------------------------------
// The secret store connections.rs was shaped around.
//
// connections.rs:35-49 states what is expected of this module in as many words:
// "a store keyed by exactly the `(service, account)` pair held here, offering
// put / get / delete and nothing that enumerates values." This is that store,
// and the three deviations from that sentence are stated below rather than left
// to be discovered.
//
// THE INVARIANT. A secret lives in the OS keychain and nowhere else. Not in
// ~/.efficlaude/studio.json, not in project metadata, not in a log, not in a
// test fixture, not in a screenshot, not in a config preview. The types in
// connections.rs make most of that structural — `CredentialRef` is three
// coordinates with nowhere to put a value — and this file is the one place a
// value exists at all. It exists here as a function PARAMETER and never as a
// field: there is no struct in this file with a `secret`, so there is nothing to
// derive `Serialize` on, nothing to put in a `ConnectionRecord`, and nothing for
// `projects::save` to write out.
//
// THE READ: LENT, NEVER RETURNED. This module used to offer `contains` and
// nothing else, on the stated grounds that a value-returning `get` would have
// exactly one possible caller — a `ConsumerAdapter` at check time — and that
// `installed_adapters()` was empty, so shipping one added a leak path and
// bought nothing. THAT CALLER NOW EXISTS: `jira::JiraReader` is registered, and
// it must send an Atlassian API token in a request header.
//
// So the read has landed, and it is `with_secret` rather than `get`. The
// difference is the whole point. A `get -> Result<String, _>` hands the caller
// an owned token whose lifetime it chooses, and the first thing an owned token
// does is end up in a struct; `with_secret` LENDS it to a `&mut dyn FnMut(&str)`
// for the length of one call and drops the `String` before returning. That is
// what keeps the sentence below literally true after this change: the secret is
// still a function parameter and still never a field, there is still no struct
// in this crate with a place to put one, and the set of code that can observe a
// value is exactly the bodies of the closures passed to this one function.
//
// `contains` keeps its own form — `find-generic-password` with neither `-w` nor
// `-g`, so it answers existence without the value entering this process — and
// it stays the call used wherever existence is the question. The `-w` form is
// reached only through `with_secret`, where the stdout it produces is captured
// into a local, handed to the closure, and never written to a pipe, a log, an
// error string or a window. `a_read_only_asks_for_the_password_on_the_lending_
// path` asserts that split.
//
// MEMORY. For the duration of one `put` the secret is a `&str` in this process,
// a `String` moved into one worker thread, and bytes in a pipe to
// /usr/bin/security. That is as small as this build can make it: with no
// `zeroize` crate vendored (checked — see the dependency note below) the
// allocation cannot be reliably wiped, so the honest statement is that the
// window exists, is bounded by the write, and never touches disk, argv or a log.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Why the `security` binary and not a crate
//
// Cargo.toml declares `tauri` with `features = []` and this crate has no HTTP
// client; Cargo.lock holds no `keyring` and no `security-framework` (only
// `core-foundation`, pulled in transitively, which exposes no keychain API).
// Adding one would mean fetching from crates.io, which is not something this
// task may assume.
//
// So the store is /usr/bin/security, invoked the way the rest of this crate
// invokes tools: through `doctor::probe_command` under `doctor::PROBE_TIMEOUT`,
// after `doctor::warm_login_shell_path()` — the last for the reason
// doctor.rs:288-310 records, that a cold `$SHELL -ilc` costs ~450-820 ms and
// `probe_command` reads the login PATH from INSIDE the thread whose answer is
// already being timed, so an unwarmed call spends most of its one-second budget
// before the child is even spawned.
//
// THE SECRET IS NEVER IN AN ARGV. argv is world-readable through `ps`, so
// `security add-generic-password -w <token>` — the form every tutorial shows —
// publishes the token to every process on the machine for as long as the child
// lives. `-w` with no value prompts on a tty instead, which a GUI app does not
// have and must not depend on.
//
// The form used here is `security -q -i`, documented in security(1) as
// interactive mode: "security will enter interactive mode and allow the user to
// enter multiple commands on stdin". The whole `add-generic-password` line,
// token included, is written to that stdin pipe and the argv of the child is
// exactly `["-q", "-i"]` — a constant, asserted as one in the tests below, so
// nothing derived from a secret can reach it even by accident.
//
// Verified against the real binary before this code was written, on a throwaway
// keychain under /tmp which was then deleted:
//   * a password containing a space, a double quote, a backslash, a single
//     quote, a `$` and a backtick round-trips byte-for-byte through the
//     escaping in `quote` below;
//   * the add costs ~50 ms, which sits inside the 1 s budget with room to spare;
//   * `find-generic-password` without `-w` prints attributes only, no password;
//   * a delete of an item that is not there exits non-zero (44,
//     errSecItemNotFound), which is why absence is confirmed by a second read
//     rather than inferred from the failure;
//   * AND THE ONE THAT SHAPES `put`: interactive mode exits 0 even when the
//     command it ran FAILED (a write to a nonexistent keychain exits 0 through
//     `-i` and 45 run directly). The success of a write therefore cannot be
//     taken from the exit status, so `put` reads the item back before it
//     reports success. A keychain that silently writes nowhere is worse than
//     one that says it cannot write, and that exit code is exactly how the
//     silent version happens.
// ---------------------------------------------------------------------------

use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;

use crate::connections::{CredentialKind, CredentialRef};
use crate::doctor::{probe_command, warm_login_shell_path, PROBE_TIMEOUT};
use crate::shell_env;

/// Absolute, not `"security"`, and not resolved through the login PATH. The
/// program that holds this app's secrets is not something a `PATH` entry gets to
/// choose: a writable directory earlier in a user's PATH would otherwise be a
/// complete credential-theft primitive. Every other tool in this crate is a
/// user-installed CLI that MUST be found on PATH; this one ships with macOS and
/// has exactly one location.
const SECURITY: &str = "/usr/bin/security";

/// The entire argv of the writing child. A constant, so the write path has no
/// expression that could place a secret in an argument.
const WRITE_ARGV: [&str; 2] = ["-q", "-i"];

/// What happened to a keychain item that was asked to go away.
///
/// Three answers rather than a `bool`, because "I deleted it", "there was
/// nothing to delete" and "it is still there" are three different facts about
/// the one thing the caller cares about: whether a secret is still sitting in
/// the keychain with no connection pointing at it. The first two mean no orphan
/// exists; only the third is a problem, and it carries the reason so the caller
/// can state it instead of guessing.
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Removal {
    Deleted,
    /// Nothing was stored under those coordinates. Not an error: a connection
    /// may have been configured with a reference whose secret was never saved.
    Absent,
    /// Still there, and why. The caller must not report the credential as gone.
    Failed(String),
}

/// Put, read-back-existence, delete — and deliberately nothing that lists or
/// enumerates. There is no method here that returns a secret value, and no
/// method that answers "what else is in there": a store that could enumerate
/// would be a store whose output has to be audited everywhere it is printed.
///
/// A trait rather than three free functions so the callers in lib.rs can be
/// tested against an in-memory fake. No test in this crate writes to the user's
/// real login keychain.
pub trait SecretStore {
    /// Stores or replaces the secret at these coordinates. `Ok` means the item
    /// was read back afterwards and is there.
    fn put(&self, r: &CredentialRef, secret: &str) -> Result<(), String>;

    /// Whether an item exists at these coordinates. Never its value.
    fn contains(&self, r: &CredentialRef) -> Result<bool, String>;

    /// LENDS the stored secret to `use_it` for the length of one call.
    ///
    /// Does not return it, and that is deliberate rather than awkward: there is
    /// no value in the return type, so a caller cannot keep the secret, store
    /// it in a field, or hold it past the call. The only code that can observe
    /// a value is the closure body, which is a short and auditable list.
    ///
    /// Not generic, so the trait stays usable as `&dyn SecretStore` (lib.rs
    /// passes one). A closure that needs to produce something writes it into a
    /// captured local, which is what `jira::JiraReader::check_site` does.
    ///
    /// `Err` when there is no item at those coordinates, or when the store
    /// could not be read. The error names the coordinates and never the value —
    /// there is nothing in an `Err` path that has seen one.
    fn with_secret(&self, r: &CredentialRef, use_it: &mut dyn FnMut(&str)) -> Result<(), String>;

    /// Deletes the item, and says which of the three things happened.
    fn forget(&self, r: &CredentialRef) -> Removal;
}

/// The one kind of secret this app can name, as the keychain item's own `kind`
/// descriptor. Written so an item found in Keychain Access says what it is and
/// who put it there; matched on by nothing, because the lookup key is the
/// `(service, account)` pair connections.rs:285-295 defines and adding a third
/// coordinate here would make an item stored by one version of this app
/// invisible to the next.
fn kind_descriptor(kind: CredentialKind) -> &'static str {
    match kind {
        CredentialKind::ApiToken => "EffiClaude API token",
    }
}

/// Rejects coordinates and secrets this module cannot put on one line of
/// `security`'s stdin without changing their meaning.
///
/// A control character is the only thing that is genuinely unrepresentable: a
/// newline ends the command, so a secret containing one would be stored
/// truncated and the rest of it would be read as a second command. Truncating
/// silently is the worst available outcome — the user would be told their token
/// was saved — so this refuses and says what it refused. API tokens do not
/// contain newlines; a passphrase someone pasted with a trailing one is the real
/// case, and the caller is told to trim it rather than having it quietly altered.
fn check_line_safe(what: &str, value: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!("the {what} is empty"));
    }
    if value.chars().any(char::is_control) {
        return Err(format!(
            "the {what} contains a line break or other control character, which cannot be stored \
             without changing it — remove it and try again"
        ));
    }
    Ok(())
}

/// One token of `security`'s interactive command line.
///
/// Interactive mode tokenises each line itself: a double-quoted run is one
/// token, and inside it a backslash escapes the next character. Those two rules
/// are all the escaping needs, and the round trip was verified against the real
/// binary with a value containing a space, a double quote, a backslash, a single
/// quote, a `$` and a backtick — none of which is special here, because this is
/// not a shell and no shell is involved: `Command` spawns /usr/bin/security
/// directly, so there is no word splitting, no globbing and no substitution to
/// escape against.
fn quote(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for c in value.chars() {
        if c == '\\' || c == '"' {
            out.push('\\');
        }
        out.push(c);
    }
    out.push('"');
    out
}

/// The line written to `security -q -i`'s stdin, and the only place in this
/// crate where a secret is formatted into anything.
///
/// `-U` updates the item if it already exists, so a rotated token replaces the
/// old one instead of adding a second item under the same coordinates — the
/// "retry tidak menggandakan konfigurasi" rule (DESIGN-SPEC.md:147) that
/// `configure` keeps for the record itself.
///
/// `-w` is not the last option on purpose: security(1) says a `-w` at the end of
/// a command with no value prompts for one, and that prompt would read from this
/// very pipe. With `-U` after it, a `-w` can never be the final token.
fn add_line(r: &CredentialRef, secret: &str) -> Result<String, String> {
    check_line_safe("credential service", &r.service)?;
    check_line_safe("credential account", &r.account)?;
    check_line_safe("secret", secret)?;
    Ok(format!(
        "add-generic-password -D {} -s {} -a {} -w {} -U\n",
        quote(kind_descriptor(r.kind)),
        quote(&r.service),
        quote(&r.account),
        quote(secret),
    ))
}

/// The argv of a read. No `-w` and no `-g`: both print the stored password, and
/// this app has nothing to do with the value. Attributes go to stdout and are
/// discarded unread.
fn find_argv(r: &CredentialRef) -> Vec<String> {
    vec![
        "find-generic-password".into(),
        "-s".into(),
        r.service.clone(),
        "-a".into(),
        r.account.clone(),
    ]
}

/// The argv of the one read that asks for the value.
///
/// `-w` prints the password to stdout, which is the only way /usr/bin/security
/// will give it up — there is no form of `find-generic-password` that returns a
/// value without it. What makes that acceptable here and nowhere else is the
/// handling: `read_secret` below pipes this child's stdout into a local
/// `String`, hands it to one closure and drops it, with stderr nulled, nothing
/// echoed and nothing of it in any `Err`. `find_argv` above remains the form
/// used for every existence question, so the `-w` form is reached from exactly
/// one function.
///
/// The coordinates are arguments; the secret is not, and cannot be — it travels
/// in the opposite direction, out of the child on stdout.
fn reveal_argv(r: &CredentialRef) -> Vec<String> {
    vec![
        "find-generic-password".into(),
        "-w".into(),
        "-s".into(),
        r.service.clone(),
        "-a".into(),
        r.account.clone(),
    ]
}

/// The argv of a delete. Keyed on the same two coordinates as the read, so the
/// item that `contains` reports is the item `forget` removes.
fn delete_argv(r: &CredentialRef) -> Vec<String> {
    vec![
        "delete-generic-password".into(),
        "-s".into(),
        r.service.clone(),
        "-a".into(),
        r.account.clone(),
    ]
}

/// Runs `security` with a prepared stdin and answers only whether it exited
/// cleanly.
///
/// A sibling of `doctor::probe_command` rather than a call to it: that helper
/// nulls stdin (deliberately — "so a probe that decides to prompt fails instead
/// of waiting"), and the whole point here is to hand the child a stdin. It
/// shares the parts that matter: the same `PROBE_TIMEOUT`, the same worker
/// thread plus channel because `std::process` has no timed wait, the same
/// login-shell PATH, and the same refusal to let one tool stall the app.
///
/// stdout and stderr are both discarded, and stderr for a reason beyond
/// tidiness: it is the output of a command whose stdin held a secret, and this
/// app will not carry that text into an error string, a log line or a window.
/// What is lost is detail about a failed write, and that is covered — `put`
/// reads the item back, which is a stronger answer than anything stderr says.
fn run_with_stdin(input: &str) -> Result<bool, String> {
    let (tx, rx) = mpsc::channel();
    let owned = input.to_string();

    thread::spawn(move || {
        let result = (|| -> std::io::Result<bool> {
            let mut child = Command::new(SECURITY)
                .args(WRITE_ARGV)
                .env("PATH", shell_env::login_shell_path())
                .stdin(Stdio::piped())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()?;
            {
                // Taken and dropped inside this scope, which closes the pipe.
                // security's interactive mode runs until EOF, so a stdin left
                // open is a child that never exits and a `wait` that never
                // returns.
                let mut stdin = child
                    .stdin
                    .take()
                    .ok_or_else(|| std::io::Error::other("security stdin was not piped"))?;
                stdin.write_all(owned.as_bytes())?;
                stdin.flush()?;
            }
            Ok(child.wait()?.success())
        })();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(PROBE_TIMEOUT) {
        Ok(Ok(ok)) => Ok(ok),
        Ok(Err(e)) => Err(format!("could not run {SECURITY}: {e}")),
        Err(_) => Err(format!(
            "{SECURITY} did not answer within {PROBE_TIMEOUT:?}"
        )),
    }
}

/// `security`'s exit code for "no such item" (errSecItemNotFound), which it
/// returns for both a missing item and a missing keychain. Named because the
/// difference between "there is no token stored" and "the store broke" is the
/// difference between asking the user for a token and telling them something is
/// wrong.
const ITEM_NOT_FOUND: i32 = 44;

/// Reads the stored value into a local `String`.
///
/// The second documented sibling of `doctor::probe_command` in this file, and
/// the reason is the same shape as `run_with_stdin`'s: that helper returns its
/// child's stdout to any caller as a plain `Probe.stdout`, and this child's
/// stdout IS the secret. Routing a password through a shared, general-purpose
/// helper would put a token in a value that the rest of this crate treats as
/// loggable text. So the pipe is read here, by one function, whose output has
/// exactly one consumer.
///
/// `Ok(None)` is "there is no item", which is not an error. Neither the returned
/// `Err` nor anything else this function produces contains the stdout it read:
/// stderr is nulled, and the only thing reported about a failure is the exit
/// code.
fn read_secret(r: &CredentialRef) -> Result<Option<String>, String> {
    let (tx, rx) = mpsc::channel();
    let argv = reveal_argv(r);

    thread::spawn(move || {
        let result = Command::new(SECURITY)
            .args(&argv)
            .env("PATH", shell_env::login_shell_path())
            // Null stdin so a prompt fails instead of waiting, and null stderr
            // for the reason `run_with_stdin` nulls it: it is the diagnostic
            // output of a command that handled a secret.
            .stdin(Stdio::null())
            .stderr(Stdio::null())
            .output();
        let _ = tx.send(result);
    });

    let out = match rx.recv_timeout(PROBE_TIMEOUT) {
        Ok(Ok(out)) => out,
        Ok(Err(e)) => return Err(format!("could not run {SECURITY}: {e}")),
        Err(_) => {
            return Err(format!(
                "{SECURITY} did not answer within {PROBE_TIMEOUT:?}"
            ));
        }
    };

    if !out.status.success() {
        return match out.status.code() {
            Some(ITEM_NOT_FOUND) => Ok(None),
            Some(code) => Err(format!(
                "the keychain would not release the credential for {} ({}): {SECURITY} exited {code}",
                r.account, r.service
            )),
            None => Err(format!(
                "the keychain read for {} ({}) was interrupted",
                r.account, r.service
            )),
        };
    }

    // `-w` prints the password followed by a newline, and exactly one: the
    // value itself cannot contain one, because `add_line` refuses a control
    // character rather than storing a truncated secret. `from_utf8_lossy` and
    // not `from_utf8`: a replacement character in a token produces a rejected
    // check, which is a sayable outcome, where an error here would report the
    // store as broken.
    let mut value = String::from_utf8_lossy(&out.stdout).into_owned();
    if value.ends_with('\n') {
        value.pop();
        if value.ends_with('\r') {
            value.pop();
        }
    }
    Ok(Some(value))
}

/// The macOS login keychain, through /usr/bin/security.
///
/// No keychain file is named on any of the three commands, so every item goes to
/// the user's default keychain — the one Keychain Access shows them, which is
/// where a credential they can find and revoke themselves belongs. A private
/// keychain file of this app's own would need its own unlock password, and the
/// only place to keep that would be a file next to it.
pub struct MacKeychain;

impl SecretStore for MacKeychain {
    fn put(&self, r: &CredentialRef, secret: &str) -> Result<(), String> {
        let line = add_line(r, secret)?;
        warm_login_shell_path();
        // The exit status is read but cannot be trusted alone: interactive mode
        // reports 0 for a command that failed (see the header). A non-zero here
        // means something went wrong enough that even `-i` admitted it.
        let exited_cleanly = run_with_stdin(&line)?;
        match self.contains(r) {
            Ok(true) => Ok(()),
            Ok(false) => Err(format!(
                "the keychain did not store a credential for {} ({}): nothing is there when it is \
                 read back{}",
                r.account,
                r.service,
                if exited_cleanly {
                    ""
                } else {
                    " and the keychain tool reported a failure"
                }
            )),
            // The one case where this app genuinely does not know. Saying so is
            // the only honest answer: reporting success would claim a write it
            // did not see, and reporting failure would tell the user to redo a
            // write that may well have landed.
            Err(e) => Err(format!(
                "the credential for {} ({}) was handed to the keychain, but the write could not be \
                 confirmed: {e}",
                r.account, r.service
            )),
        }
    }

    fn contains(&self, r: &CredentialRef) -> Result<bool, String> {
        warm_login_shell_path();
        let argv = find_argv(r);
        let args: Vec<&str> = argv.iter().map(String::as_str).collect();
        // `probe_command` answers `ok` plus stdout; the stdout is attributes
        // (verified: no password without `-w`/`-g`) and is dropped here unread
        // rather than carried anywhere.
        probe_command(SECURITY, &args).map(|probe| probe.ok)
    }

    fn with_secret(&self, r: &CredentialRef, use_it: &mut dyn FnMut(&str)) -> Result<(), String> {
        warm_login_shell_path();
        match read_secret(r)? {
            // Borrowed for the body of the closure and dropped at the end of
            // this scope. Nothing leaves this function but `Ok(())`.
            Some(secret) => {
                use_it(&secret);
                Ok(())
            }
            None => Err(format!(
                "the keychain holds no credential for {} ({})",
                r.account, r.service
            )),
        }
    }

    fn forget(&self, r: &CredentialRef) -> Removal {
        warm_login_shell_path();
        let argv = delete_argv(r);
        let args: Vec<&str> = argv.iter().map(String::as_str).collect();
        match probe_command(SECURITY, &args) {
            Ok(probe) if probe.ok => Removal::Deleted,
            // A failed delete is ambiguous through this interface: `security`
            // exits 44 both for "no such item" and, in principle, for other
            // refusals, and `probe_command` reports success or failure rather
            // than the code. So the question is asked a second way — is the item
            // there? — and the answer to THAT is what gets reported. An item
            // that cannot be found is not an orphan, whatever the delete said.
            Ok(_) | Err(_) => match self.contains(r) {
                Ok(false) => Removal::Absent,
                Ok(true) => Removal::Failed(format!(
                    "the keychain still holds a credential for {} ({}) and would not delete it",
                    r.account, r.service
                )),
                Err(e) => Removal::Failed(e),
            },
        }
    }
}

#[cfg(test)]
pub(crate) mod fake {
    use super::*;
    use std::cell::RefCell;

    /// The seam. Holds its "secrets" in a `RefCell<Vec<_>>` that dies with the
    /// test, so every rule the callers in lib.rs keep is proved without
    /// /usr/bin/security being run and without the user's login keychain being
    /// opened, read or written.
    ///
    /// The stored value is kept so a test can assert that a delete actually
    /// removed it; the strings the tests put in are placeholders that are not
    /// credentials to anything.
    pub(crate) struct MemoryStore {
        items: RefCell<Vec<(String, String, String)>>,
        /// Set to make every `forget` refuse, which is the branch where a
        /// removal must abort rather than orphan an item.
        pub(crate) refuse_deletes: bool,
    }

    impl MemoryStore {
        pub(crate) fn new() -> Self {
            MemoryStore {
                items: RefCell::new(Vec::new()),
                refuse_deletes: false,
            }
        }

        pub(crate) fn refusing() -> Self {
            MemoryStore {
                items: RefCell::new(Vec::new()),
                refuse_deletes: true,
            }
        }

        pub(crate) fn len(&self) -> usize {
            self.items.borrow().len()
        }

        fn position(&self, r: &CredentialRef) -> Option<usize> {
            self.items
                .borrow()
                .iter()
                .position(|(s, a, _)| *s == r.service && *a == r.account)
        }
    }

    impl SecretStore for MemoryStore {
        fn put(&self, r: &CredentialRef, secret: &str) -> Result<(), String> {
            add_line(r, secret)?;
            match self.position(r) {
                Some(i) => self.items.borrow_mut()[i].2 = secret.to_string(),
                None => self.items.borrow_mut().push((
                    r.service.clone(),
                    r.account.clone(),
                    secret.to_string(),
                )),
            }
            Ok(())
        }

        fn contains(&self, r: &CredentialRef) -> Result<bool, String> {
            Ok(self.position(r).is_some())
        }

        /// The same lend over the same seam, with the same error wording as
        /// `MacKeychain`, so an adapter tested against this fake is tested
        /// against the message a user would really see.
        fn with_secret(
            &self,
            r: &CredentialRef,
            use_it: &mut dyn FnMut(&str),
        ) -> Result<(), String> {
            match self.position(r) {
                Some(i) => {
                    // Cloned out of the RefCell before the closure runs: the
                    // closure may call back into this store, and a borrow held
                    // across it would panic.
                    let secret = self.items.borrow()[i].2.clone();
                    use_it(&secret);
                    Ok(())
                }
                None => Err(format!(
                    "the keychain holds no credential for {} ({})",
                    r.account, r.service
                )),
            }
        }

        fn forget(&self, r: &CredentialRef) -> Removal {
            if self.refuse_deletes {
                return Removal::Failed(format!(
                    "the keychain still holds a credential for {} ({}) and would not delete it",
                    r.account, r.service
                ));
            }
            match self.position(r) {
                Some(i) => {
                    self.items.borrow_mut().remove(i);
                    Removal::Deleted
                }
                None => Removal::Absent,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::fake::MemoryStore;
    use super::*;

    /// Not a credential to anything. Named so that a grep for a leak in this
    /// repo finds a string that says what it is.
    const PLACEHOLDER: &str = "placeholder-not-a-real-token";

    fn reference() -> CredentialRef {
        CredentialRef::new(
            "efficlaude.jira",
            "me@acme.test",
            CredentialKind::ApiToken,
        )
    }

    /// The whole security argument of this module: argv is world-readable via
    /// `ps`, so no argument of any `security` invocation may contain the secret.
    /// The write path has no computed argv AT ALL — it is a constant — and the
    /// read and delete paths are built from the coordinates only.
    #[test]
    fn no_security_invocation_can_carry_a_secret_in_its_argv() {
        assert_eq!(WRITE_ARGV, ["-q", "-i"], "the write argv is a constant");
        let r = reference();
        for argv in [find_argv(&r), delete_argv(&r)] {
            for arg in &argv {
                assert!(
                    !arg.contains(PLACEHOLDER),
                    "a secret reached an argv: {arg}"
                );
            }
        }
        // And the secret IS in the stdin line, which is the point: that is the
        // channel it travels on, and it is not visible to another process.
        assert!(add_line(&r, PLACEHOLDER).unwrap().contains(PLACEHOLDER));
    }

    /// The existence check and the delete may not ask for the value. `-w` and
    /// `-g` both print the stored password, and a password on a pipe is a
    /// password in this process — so neither of the two commands that answer a
    /// question OTHER than "what is it" carries either flag.
    #[test]
    fn a_read_only_asks_for_the_password_on_the_lending_path() {
        let r = reference();
        for argv in [find_argv(&r), delete_argv(&r)] {
            assert!(!argv.iter().any(|a| a == "-w"), "{argv:?}");
            assert!(!argv.iter().any(|a| a == "-g"), "{argv:?}");
        }
        // And exactly one argv does ask, because there is no other way to get
        // a value out of /usr/bin/security. It is reached only from
        // `with_secret`, whose stdout has one consumer and is never returned.
        let reveal = reveal_argv(&r);
        assert!(reveal.iter().any(|a| a == "-w"), "{reveal:?}");
        assert!(
            !reveal.iter().any(|a| a == "-g"),
            "-g prints more than the password: {reveal:?}"
        );
        // The coordinates are the only arguments; nothing secret is in there.
        assert_eq!(
            reveal,
            [
                "find-generic-password",
                "-w",
                "-s",
                "efficlaude.jira",
                "-a",
                "me@acme.test"
            ]
        );
    }

    /// The read is a LEND: the value reaches a closure and is not in the return
    /// type, so a caller has nowhere to keep it. Asserted over the seam, which
    /// is the only place in this crate a stored value exists at all.
    #[test]
    fn the_stored_secret_is_lent_to_a_closure_and_never_returned() {
        let store = MemoryStore::new();
        let r = reference();

        // Nothing stored: an error that names the coordinates and not a value.
        let mut seen: Vec<String> = Vec::new();
        let err = store
            .with_secret(&r, &mut |s| seen.push(s.to_string()))
            .expect_err("nothing is stored yet");
        assert!(
            err.contains("me@acme.test") && err.contains("efficlaude.jira"),
            "{err}"
        );
        assert!(seen.is_empty(), "the closure must not run without a value");

        store.put(&r, PLACEHOLDER).unwrap();
        store
            .with_secret(&r, &mut |s| seen.push(s.to_string()))
            .unwrap();
        assert_eq!(seen, [PLACEHOLDER], "the closure receives the stored value");

        // A rotation is what the closure sees next; there is no cache in
        // between that could hand out the old one.
        store.put(&r, "placeholder-rotated-token").unwrap();
        let mut latest = String::new();
        store
            .with_secret(&r, &mut |s| latest = s.to_string())
            .unwrap();
        assert_eq!(latest, "placeholder-rotated-token");

        // And a forgotten item is a refusal again, not a stale value.
        assert_eq!(store.forget(&r), Removal::Deleted);
        assert!(store.with_secret(&r, &mut |_| {}).is_err());
    }

    /// The exit code that means "nothing stored" is distinguished from a store
    /// that broke, because the two have different repairs: one asks the user
    /// for a token, the other does not.
    #[test]
    fn the_absent_item_code_is_its_own_answer() {
        assert_eq!(
            ITEM_NOT_FOUND, 44,
            "errSecItemNotFound, verified against the binary"
        );
    }

    /// The exact line, so a change to it is a change a reviewer sees. `-U` is
    /// last: a trailing `-w` with no value would make security prompt, and the
    /// prompt would read this same pipe.
    #[test]
    fn the_write_line_is_an_update_and_never_ends_in_a_bare_w() {
        let line = add_line(&reference(), PLACEHOLDER).unwrap();
        assert_eq!(
            line,
            "add-generic-password -D \"EffiClaude API token\" -s \"efficlaude.jira\" \
             -a \"me@acme.test\" -w \"placeholder-not-a-real-token\" -U\n"
        );
        assert!(line.trim_end().ends_with("-U"));
        assert_eq!(line.matches('\n').count(), 1, "exactly one command");
    }

    /// The escaping, against the values that would otherwise end the quoted
    /// token early. Verified byte-for-byte against the real binary on a
    /// throwaway keychain before this was written; this test pins the form that
    /// was verified.
    #[test]
    fn quoting_survives_the_characters_that_would_end_a_token() {
        assert_eq!(quote("plain"), "\"plain\"");
        assert_eq!(quote("two words"), "\"two words\"");
        assert_eq!(quote("a\"b"), "\"a\\\"b\"");
        assert_eq!(quote("a\\b"), "\"a\\\\b\"");
        // A shell's metacharacters are not special here — no shell is involved.
        assert_eq!(quote("$(id)`id`;rm -rf /"), "\"$(id)`id`;rm -rf /\"");
        // The whole nasty value in one piece, as it was verified.
        assert_eq!(quote("a b\"c\\d'e$f`g"), "\"a b\\\"c\\\\d'e$f`g\"");
    }

    /// A newline would be stored as a truncated secret and the remainder read
    /// as a second command. Refused with words, never silently altered.
    #[test]
    fn a_secret_with_a_line_break_is_refused_rather_than_truncated() {
        let r = reference();
        for bad in ["token\nmore", "token\r", "tok\ten", "tok\0en"] {
            let err = add_line(&r, bad).unwrap_err();
            assert!(err.contains("control character"), "{err}");
            assert!(
                !err.contains("tok"),
                "the refusal must not quote the secret back: {err}"
            );
        }
        assert!(add_line(&r, "").unwrap_err().contains("empty"));
    }

    /// Coordinates are checked too: `configure` already rejects an empty
    /// service or account (connections.rs:695-697), and this is the second
    /// fence rather than a reliance on the first.
    #[test]
    fn coordinates_must_also_be_storable() {
        let mut r = reference();
        r.service = String::new();
        assert!(add_line(&r, PLACEHOLDER).unwrap_err().contains("service"));
        let mut r = reference();
        r.account = "me@acme.test\n".into();
        assert!(add_line(&r, PLACEHOLDER).unwrap_err().contains("account"));
    }

    /// The error strings a user is shown name the coordinates and never the
    /// value — "error relevan tanpa credential" (DESIGN-SPEC.md:147).
    #[test]
    fn a_refusal_names_the_coordinates_and_not_the_secret() {
        let store = MemoryStore::refusing();
        let r = reference();
        match store.forget(&r) {
            Removal::Failed(why) => {
                assert!(why.contains("me@acme.test") && why.contains("efficlaude.jira"), "{why}");
                assert!(!why.contains(PLACEHOLDER), "{why}");
            }
            other => panic!("expected a refusal, got {other:?}"),
        }
    }

    /// put / contains / forget over the seam: stored once, replaced rather than
    /// duplicated on a rotation, gone after a delete, and `Absent` for a
    /// delete of something that was never there.
    #[test]
    fn the_store_replaces_rather_than_duplicates_and_deletes_completely() {
        let store = MemoryStore::new();
        let r = reference();
        assert!(!store.contains(&r).unwrap());
        assert_eq!(store.forget(&r), Removal::Absent, "nothing to delete yet");

        store.put(&r, PLACEHOLDER).unwrap();
        assert!(store.contains(&r).unwrap());
        assert_eq!(store.len(), 1);

        store.put(&r, "placeholder-rotated-token").unwrap();
        assert_eq!(store.len(), 1, "a rotation replaces one item");

        assert_eq!(store.forget(&r), Removal::Deleted);
        assert!(!store.contains(&r).unwrap());
        assert_eq!(store.len(), 0);
    }

    /// Two connections to the same service with different accounts are two
    /// items, because the key is the pair — the same pair `CredentialRef`
    /// carries (connections.rs:285-295).
    #[test]
    fn the_key_is_the_service_and_account_pair() {
        let store = MemoryStore::new();
        let mine = reference();
        let theirs = CredentialRef::new(
            "efficlaude.jira",
            "someone.else@acme.test",
            CredentialKind::ApiToken,
        );
        store.put(&mine, PLACEHOLDER).unwrap();
        store.put(&theirs, PLACEHOLDER).unwrap();
        assert_eq!(store.len(), 2);

        store.forget(&mine);
        assert!(!store.contains(&mine).unwrap());
        assert!(
            store.contains(&theirs).unwrap(),
            "deleting one account's item must not take the other's"
        );
    }

    /// There is no type in this module that could be written to disk with a
    /// secret in it: the value is only ever a parameter. Asserted the only way
    /// a test can — the store itself holds no `Serialize` shape, and the
    /// reference that IS serialised has three fields and no fourth.
    #[test]
    fn nothing_in_this_module_can_be_serialised_with_a_value() {
        let r = reference();
        let json = serde_json::to_string(&r).unwrap();
        assert_eq!(
            json,
            "{\"service\":\"efficlaude.jira\",\"account\":\"me@acme.test\",\"kind\":\"apiToken\"}"
        );
        assert!(!json.contains(PLACEHOLDER));
        // The descriptor stored alongside the item is a label, not a key.
        assert_eq!(kind_descriptor(CredentialKind::ApiToken), "EffiClaude API token");
    }
}

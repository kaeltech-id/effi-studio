// ---------------------------------------------------------------------------
// The first real `ConsumerAdapter`: Jira, for Effi, read-only.
//
// connections.rs:29-32 promises that THAT file performs no I/O and holds no
// network client, and connections.rs:460-477 says an adapter lands by being
// returned from `installed_adapters`. This is that adapter, in its own file so
// both statements stay true: the rules live there, the asking lives here.
//
// WHAT IT IS ALLOWED TO DO, AND WHY IT IS ONLY THIS
//
// DESIGN-SPEC.md:131 scopes the first phase to read-only issue browsing: no
// issue creation, no commenting, no status transitions. `JiraAccess` has one
// variant for that reason, and the enforcement here is not a comment or a flag
// — it is `read_path` below, which is a `match` on `JiraAccess` returning the
// ONE path this code can name. There is no string literal in this file holding
// any other Jira path, no function that takes a method, and nothing that writes
// a request body. A mutation is not switched off; it is unsayable.
//
// The request this adapter makes is `GET /rest/api/3/myself`, which Atlassian
// documents as returning the current user. It is the canonical "am I
// authenticated" call: it reads one record, the caller's own, and has no side
// effect at the far end.
//
// AUTHENTICATION — DOCUMENTED, AND NOTHING ELSE
//
// HTTP Basic with the Atlassian account email as the username and an Atlassian
// API token as the password, which is the mechanism Atlassian documents for
// Jira Cloud REST (`Authorization: Basic base64(email:api_token)`). That is
// also exactly the pair `CredentialRef` already holds: `account` is documented
// at connections.rs:296-299 as "an Atlassian account email", and the token
// lives in the keychain under `(service, account)`.
//
// Nothing here reverse-engineers a session cookie, drives a web login or
// synthesises a token. `CredentialKind` has one variant and `OAuth` is not it,
// for the reason recorded at connections.rs:276-282: no OAuth app registration
// exists for this product, so offering the flow would be a promise.
//
// WHY /usr/bin/curl AND NOT AN HTTP CRATE
//
// Checked rather than assumed, and the finding is the opposite of what the
// module comments in this crate previously recorded: this environment CAN fetch
// from crates.io — `cargo add ureq` resolves and the result compiles — so an
// HTTP crate is available in principle. It is not used, for three reasons that
// are about this request rather than about availability:
//
//   1. Nothing of the response may enter this process. `output = "/dev/null"`
//      plus `write-out = "%{http_code}"` means the ONLY thing this code ever
//      reads back from Jira is three digits. A client library hands you the
//      body, and a body in a `String` is a body that can end up in a log, an
//      error message or a window. The strongest read-only guarantee available
//      here is to never hold the data at all.
//   2. The secret must never reach an argv, and the whole argv of the child is
//      the constant `CHECK_ARGV`. Everything else — the URL, the headers, the
//      method, the timeouts — is written to the child's stdin, which is not
//      visible to other processes the way `ps` output is. This is the same
//      shape, for the same reason, as `keychain::WRITE_ARGV`.
//   3. It is this crate's established idiom. doctor.rs runs tools under
//      `PROBE_TIMEOUT` on a worker thread; keychain.rs:269-306 wrote a
//      documented sibling of that helper precisely so a secret could travel on
//      stdin. Thirty-six new packages for one GET, against a budget measured in
//      seconds, buys none of that back.
//
// `/usr/bin/curl` is absolute and never resolved through PATH, for the reason
// `keychain::SECURITY` records: a writable directory early in a user's PATH
// would otherwise be handed this app's Jira token on every check.
//
// VERIFIED BEFORE THIS CODE WAS WRITTEN, against a throwaway HTTP server on
// 127.0.0.1 which was then stopped — never against a real Jira site:
//   * `curl --config -` reads every option from stdin; the child's argv stays
//     exactly `["--config", "-"]`;
//   * a quoted config value takes `\"` and `\\` escapes, and a `"` inside one
//     does not end the line;
//   * `request = "GET"` pins the method, so no option on that stdin can make
//     this a POST;
//   * `output = "/dev/null"` with `write-out = "%{http_code}"` puts three
//     digits and nothing else on stdout;
//   * an unreachable host yields the code `000` and exit 7 inside `max-time`,
//     which is why `000` is classified as unreachable rather than as a
//     rejection;
//   * AND THE ONE THAT MATTERS: a boolean option given a value (`show-error =
//     false`) makes curl reject the whole config, so every boolean here is
//     written bare.
// ---------------------------------------------------------------------------

use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use base64::{Engine as _, engine::general_purpose::STANDARD};

use crate::connections::{
    CheckOutcome, CheckReport, ConnectionRecord, Connector, Consumer, ConsumerAdapter,
    CredentialRef, JIRA_ACCESS, JiraAccess,
};
use crate::keychain::SecretStore;

/// Absolute, never a PATH lookup — see the header.
const CURL: &str = "/usr/bin/curl";

/// The entire argv of the child. A constant, so no expression in this file can
/// place a URL, a header or a secret in an argument.
const CHECK_ARGV: [&str; 2] = ["--config", "-"];

/// NOT `doctor::PROBE_TIMEOUT`, and the difference is deliberate.
///
/// That constant is one second because it bounds the FIRST PAINT: nine local
/// tool probes fire at once and none of them may hold the first screen
/// (doctor.rs:78). This is a cross-internet TLS handshake plus a request,
/// started by a user pressing Connect and watching a spinner. One second would
/// not be a safety budget here, it would be a source of false `failed` cells on
/// working connections — and reporting a working Jira as broken is exactly the
/// dishonesty the rest of this feature is built to avoid.
///
/// curl is given its own `connect-timeout` and `max-time` inside this, so the
/// child bounds itself first and the channel below is only the backstop for a
/// child that does not exit at all.
const JIRA_TIMEOUT: Duration = Duration::from_secs(12);
const CONNECT_TIMEOUT_SECS: u64 = 5;
const MAX_TIME_SECS: u64 = 10;

/// The only Jira path this code can name, as a function of the only access
/// level it has a word for.
///
/// This is the read-only rule, made structural. Adding a write would mean
/// adding a `JiraAccess` variant, and `the_credential_and_jira_vocabularies_
/// admit_nothing_unverified` in connections.rs asserts that `"readWrite"` does
/// not deserialise — so a mutation cannot be reached from a stored config, from
/// the wire, or from this file.
fn read_path(access: JiraAccess) -> &'static str {
    match access {
        JiraAccess::ReadOnly => "/rest/api/3/myself",
    }
}

/// Identifies this app in Jira's access logs, so a site admin seeing the
/// request can tell what made it.
const USER_AGENT: &str = "EffiClaude-Studio";

/// The site address, validated and never corrected.
///
/// `https` is REQUIRED rather than preferred: this request carries an API token
/// in an `Authorization` header, and over `http` that token is handed to every
/// hop in between. A plain-http endpoint is refused with that reason rather
/// than silently upgraded, because an upgrade is this app deciding where the
/// request goes.
///
/// The one adjustment made is dropping trailing slashes, which cannot change
/// which host or path is reached and only prevents `…net//rest/api/3/myself`.
fn site_url(endpoint: &str) -> Result<String, String> {
    let site = endpoint.trim_end_matches('/');
    if site.trim().is_empty() {
        return Err("this connection has no Jira site address yet".into());
    }
    if site != endpoint.trim_end_matches('/').trim() || site.chars().any(char::is_whitespace) {
        return Err(
            "the Jira site address contains a space, so it cannot be used as written".into(),
        );
    }
    if site.chars().any(char::is_control) {
        return Err("the Jira site address contains a control character".into());
    }
    let Some(rest) = site.strip_prefix("https://") else {
        return Err(
            "the Jira site address must start with https://. It is not upgraded for you: this \
             check sends an API token in a request header, and over plain http that token is \
             readable by everything between here and the server."
                .into(),
        );
    };
    let authority = rest.split(['/', '?', '#']).next().unwrap_or(rest);
    if authority.is_empty() {
        return Err("the Jira site address has no server name after https://".into());
    }
    // Refused rather than stripped, the same call browser.rs:174's
    // `normalize_url` makes: credentials in an address are credentials in
    // something displayed and persisted, and removing them silently sends the
    // request somewhere else.
    if authority.contains('@') {
        return Err(
            "the Jira site address carries a username or password. Remove it — the API token \
             belongs in this connection's credential, which goes to the keychain."
                .into(),
        );
    }
    Ok(site.to_string())
}

/// `Authorization: Basic base64(email:token)`, the mechanism Atlassian
/// documents for Jira Cloud REST.
///
/// The returned `String` holds the encoded secret. It is a local value passed
/// as a parameter to one transport call and dropped at the end of the check;
/// there is no struct in this crate with a field it could be stored in, which
/// is the invariant keychain.rs:10-18 states and this function does not break.
/// base64 is an encoding and not a protection — the point of it is that
/// Atlassian's documented header format requires it.
fn authorization(account: &str, secret: &str) -> String {
    format!("Basic {}", STANDARD.encode(format!("{account}:{secret}")))
}

/// One token of a curl config line.
///
/// curl's config parser treats a double-quoted run as one value and honours
/// `\\` and `\"` inside it — the same two rules `keychain::quote` relies on for
/// `security`'s interactive mode, and verified against the real binary the same
/// way. No shell is involved on this path: `Command` spawns /usr/bin/curl
/// directly, so there is no word splitting, globbing or substitution to escape
/// against.
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

/// The complete stdin of the child, and the only place in this file where the
/// authorization value is formatted into anything.
///
/// Every boolean option is written bare: curl rejects an entire config when a
/// boolean is given a value (verified — see the header), which would turn a
/// working check into "could not run curl".
fn config(url: &str, authorization_header: &str) -> Result<String, String> {
    if url.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("the Jira site address cannot be used as written".into());
    }
    if authorization_header.chars().any(char::is_control) {
        // Unreachable through `authorization` above, whose output is `Basic `
        // plus base64 — neither of which can contain a control character. Kept
        // as the second fence: a newline here would end the option line and the
        // remainder would be read as another option.
        return Err("the stored credential cannot be sent in a request header".into());
    }
    Ok(format!(
        "url = {}\n\
         request = \"GET\"\n\
         header = {}\n\
         header = \"Accept: application/json\"\n\
         user-agent = {}\n\
         silent\n\
         show-error\n\
         output = \"/dev/null\"\n\
         write-out = \"%{{http_code}}\"\n\
         connect-timeout = {CONNECT_TIMEOUT_SECS}\n\
         max-time = {MAX_TIME_SECS}\n",
        quote(url),
        quote(&format!("Authorization: {authorization_header}")),
        quote(USER_AGENT),
    ))
}

/// What performs the request. A trait so the adapter's decisions are provable
/// without a network: `fake::Recorder` in the tests below answers with a canned
/// status code and records what it was asked for, which is how the read-only
/// and no-secret-in-the-URL rules are asserted rather than asserted about.
///
/// The signature is the read-only contract in types: there is no method
/// parameter, no body parameter and no return of any content — only a status
/// code. A caller of this trait cannot express a mutation.
pub(crate) trait Transport {
    fn status(&self, url: &str, authorization_header: &str) -> Result<u16, String>;
}

/// `/usr/bin/curl`, with everything but `--config -` on stdin.
pub(crate) struct Curl;

impl Transport for Curl {
    fn status(&self, url: &str, authorization_header: &str) -> Result<u16, String> {
        let stdin_text = config(url, authorization_header)?;
        crate::doctor::warm_login_shell_path();
        let code = run(&stdin_text)?;
        // "000" is curl's own placeholder for "no response was received", which
        // it reports for a DNS failure, a refused connection and a timeout
        // alike. It is not an HTTP status and must not be classified as one.
        let parsed: u16 = code
            .trim()
            .parse()
            .map_err(|_| "the request produced no HTTP status".to_string())?;
        Ok(parsed)
    }
}

/// Spawns curl, writes the config to its stdin, and reads back the status code.
///
/// A sibling of `doctor::probe_command` rather than a call to it, for the two
/// reasons keychain.rs:254-268 gives for its own sibling: that helper nulls
/// stdin, and this child's whole input arrives there. It shares what matters —
/// a worker thread plus a channel because `std::process` has no timed wait, and
/// a hard refusal to let one tool stall the app.
///
/// stderr is discarded. It is the error output of a command whose stdin held a
/// credential, and this app will not carry that text into a message, a log or a
/// window. What is lost is curl's own wording for a failure; what is kept is
/// the status code, which is the only thing the caller classifies.
fn run(stdin_text: &str) -> Result<String, String> {
    let (tx, rx) = mpsc::channel();
    let owned = stdin_text.to_string();

    thread::spawn(move || {
        let result = (|| -> std::io::Result<String> {
            let mut child = Command::new(CURL)
                .args(CHECK_ARGV)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()?;
            {
                // Dropped inside this scope, which closes the pipe: curl reads
                // its config until EOF, so a stdin left open is a child that
                // never starts the request.
                let mut stdin = child
                    .stdin
                    .take()
                    .ok_or_else(|| std::io::Error::other("curl stdin was not piped"))?;
                stdin.write_all(owned.as_bytes())?;
                stdin.flush()?;
            }
            let out = child.wait_with_output()?;
            Ok(String::from_utf8_lossy(&out.stdout).into_owned())
        })();
        let _ = tx.send(result);
    });

    match rx.recv_timeout(JIRA_TIMEOUT) {
        Ok(Ok(code)) => Ok(code),
        Ok(Err(e)) => Err(format!("could not run {CURL}: {e}")),
        Err(_) => Err(format!("{CURL} did not answer within {JIRA_TIMEOUT:?}")),
    }
}

/// An HTTP status, as one of the three things an adapter may report.
///
/// `needsAuthentication` is its own answer and not a flavour of `failed`
/// (connections.rs:117-120): the repair for a 401 is a new token and the repair
/// for a 500 is waiting, so they are not the same cell and do not get the same
/// sentence.
fn classify(status: u16, site: &str) -> CheckReport {
    let (outcome, detail) = match status {
        200 => (CheckOutcome::Passed, None),
        401 => (
            CheckOutcome::NeedsAuthentication,
            Some(format!(
                "{site} rejected the API token. Atlassian tokens can be revoked or expire — \
                 create a new one and store it again."
            )),
        ),
        403 => (
            CheckOutcome::NeedsAuthentication,
            Some(format!(
                "{site} accepted the token but refused the request. The Atlassian account it \
                 belongs to may not have access to this site."
            )),
        ),
        404 => (
            CheckOutcome::Failed,
            Some(format!(
                "{site} answered, but there is no Jira REST API at that address. Check the site \
                 address — it should be the Jira site itself, such as \
                 https://your-team.atlassian.net."
            )),
        ),
        429 => (
            CheckOutcome::Failed,
            Some(format!(
                "{site} is rate-limiting this check. Try again shortly."
            )),
        ),
        s if s >= 500 => (
            CheckOutcome::Failed,
            Some(format!(
                "{site} returned a server error ({s}). Nothing is wrong with the stored \
                 credential; the site could not answer."
            )),
        ),
        s => (
            CheckOutcome::Failed,
            Some(format!(
                "{site} answered with HTTP {s}, which this check cannot interpret."
            )),
        ),
    };
    CheckReport { outcome, detail }
}

/// Jira, for Effi, read-only.
///
/// Holds its own secret store and its own transport, because
/// `installed_adapters()` takes no arguments and `ConsumerAdapter::check` takes
/// only the record — a deliberate shape: an adapter that received the keychain
/// from its caller would let the caller choose which store it read.
pub struct JiraReader {
    store: Box<dyn SecretStore>,
    transport: Box<dyn Transport>,
}

impl JiraReader {
    /// The shipped adapter: the real keychain, and curl.
    pub fn new() -> Self {
        JiraReader {
            store: Box::new(crate::keychain::MacKeychain),
            transport: Box::new(Curl),
        }
    }

    #[cfg(test)]
    fn with(store: Box<dyn SecretStore>, transport: Box<dyn Transport>) -> Self {
        JiraReader { store, transport }
    }

    /// Split out from `check` so the decisions are testable over the two seams
    /// without a `ConnectionRecord` being built for each case.
    fn check_site(
        &self,
        endpoint: Option<&str>,
        credential: Option<&CredentialRef>,
    ) -> CheckReport {
        let site = match endpoint.map(site_url) {
            Some(Ok(site)) => site,
            Some(Err(why)) => return failed(why),
            None => return failed("this connection has no Jira site address yet".into()),
        };
        // Reachable only if something called `run_check` past
        // `consumer_status`, which already answers `notConfigured` for this.
        // Answered rather than panicked on, and answered as the step that is
        // missing rather than as a failure.
        let Some(cred) = credential else {
            return CheckReport {
                outcome: CheckOutcome::NeedsAuthentication,
                detail: Some(
                    "no credential is configured for this connection yet — add the Atlassian \
                     account email and store an API token for it."
                        .into(),
                ),
            };
        };

        let url = format!("{site}{}", read_path(JIRA_ACCESS));

        // `with_secret` lends the value for the length of one closure and never
        // returns it (keychain.rs). Everything the closure produces is a
        // report, which by construction cannot contain a credential.
        let mut report: Option<CheckReport> = None;
        let lent = self.store.with_secret(cred, &mut |secret| {
            let header = authorization(&cred.account, secret);
            report = Some(match self.transport.status(&url, &header) {
                Ok(status) => classify(status, &site),
                Err(why) => failed(why),
            });
        });

        match lent {
            // A missing or unreadable keychain item is `needsAuthentication`
            // and not `failed`: the repair is storing the token, which is an
            // action the user has, and calling it a failure would offer them a
            // retry that cannot work.
            Err(why) => CheckReport {
                outcome: CheckOutcome::NeedsAuthentication,
                detail: Some(format!(
                    "{why}. Store the API token for {} again.",
                    cred.account
                )),
            },
            Ok(()) => report.unwrap_or_else(|| {
                failed("the credential was read but the check produced no answer".into())
            }),
        }
    }
}

impl Default for JiraReader {
    fn default() -> Self {
        Self::new()
    }
}

fn failed(detail: String) -> CheckReport {
    CheckReport {
        outcome: CheckOutcome::Failed,
        detail: Some(detail),
    }
}

impl ConsumerAdapter for JiraReader {
    fn consumer(&self) -> Consumer {
        Consumer::Effi
    }

    fn connector(&self) -> Connector {
        Connector::Jira
    }

    fn check(&self, conn: &ConnectionRecord) -> CheckReport {
        self.check_site(conn.endpoint.as_deref(), conn.credential.as_ref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::connections::CredentialKind;
    use crate::keychain::fake::MemoryStore;
    use std::cell::RefCell;
    use std::rc::Rc;

    /// Not a credential to anything.
    const PLACEHOLDER: &str = "placeholder-not-a-real-token";
    const SITE: &str = "https://acme.atlassian.net";

    fn reference() -> CredentialRef {
        CredentialRef::new("efficlaude.jira", "me@acme.test", CredentialKind::ApiToken)
    }

    /// The seam. Records what it was asked for and answers with a canned
    /// status, so every rule below is proved without a request leaving this
    /// machine and without a real Jira site existing.
    struct Recorder {
        status: Result<u16, String>,
        seen: RefCell<Vec<(String, String)>>,
    }

    impl Recorder {
        /// `Rc` because `Box<dyn Transport>` is `'static`: the test keeps one
        /// handle to read the recording back and the adapter owns another.
        fn answering(status: u16) -> Rc<Self> {
            Rc::new(Recorder {
                status: Ok(status),
                seen: RefCell::new(Vec::new()),
            })
        }
        fn broken() -> Rc<Self> {
            Rc::new(Recorder {
                status: Err("the request produced no HTTP status".into()),
                seen: RefCell::new(Vec::new()),
            })
        }
    }

    impl Transport for Rc<Recorder> {
        fn status(&self, url: &str, authorization_header: &str) -> Result<u16, String> {
            self.seen
                .borrow_mut()
                .push((url.to_string(), authorization_header.to_string()));
            self.status.clone()
        }
    }

    fn stocked() -> MemoryStore {
        let store = MemoryStore::new();
        store.put(&reference(), PLACEHOLDER).unwrap();
        store
    }

    /// The read-only rule, asserted as an inventory rather than as a promise:
    /// the one path this code can name comes from a `match` on the one access
    /// variant, and the request the transport is handed is that path on that
    /// site and nothing else.
    #[test]
    fn the_only_request_this_adapter_can_make_is_one_documented_read() {
        assert_eq!(read_path(JIRA_ACCESS), "/rest/api/3/myself");
        assert_eq!(read_path(JiraAccess::ReadOnly), "/rest/api/3/myself");

        let seen = Recorder::answering(200);
        let adapter = JiraReader::with(Box::new(stocked()), Box::new(Rc::clone(&seen)));
        assert_eq!(
            adapter.check_site(Some(SITE), Some(&reference())).outcome,
            CheckOutcome::Passed
        );

        let calls = seen.seen.borrow();
        assert_eq!(calls.len(), 1, "one check is one request");
        assert_eq!(calls[0].0, "https://acme.atlassian.net/rest/api/3/myself");
        // The method is pinned in the config and there is no parameter for it,
        // so there is no call shape in which this could be a write.
        let cfg = config(&calls[0].0, &calls[0].1).unwrap();
        assert!(cfg.contains("request = \"GET\""), "{cfg}");
        assert_eq!(cfg.matches("request = ").count(), 1);
    }

    /// No part of the credential may reach the URL. A token in a query string
    /// is a token in a server log at the other end, in a proxy's log in
    /// between, and in this app's own address field.
    #[test]
    fn the_credential_never_reaches_the_url() {
        let seen = Recorder::answering(200);
        let adapter = JiraReader::with(Box::new(stocked()), Box::new(Rc::clone(&seen)));
        adapter.check_site(Some(SITE), Some(&reference()));

        let calls = seen.seen.borrow();
        let (url, header) = &calls[0];
        assert!(!url.contains(PLACEHOLDER), "{url}");
        assert!(!url.contains("me@acme.test"), "{url}");
        assert!(!url.contains('?'), "this read takes no query at all: {url}");
        // It travels in the header, which is the documented place for it.
        assert_eq!(
            header,
            &format!(
                "Basic {}",
                STANDARD.encode(format!("me@acme.test:{PLACEHOLDER}"))
            )
        );
    }

    /// The argv of the child is a constant, so nothing derived from a secret
    /// can be read out of `ps` — the rule `keychain::WRITE_ARGV` exists for,
    /// kept on this path too.
    #[test]
    fn no_curl_invocation_can_carry_a_credential_in_its_argv() {
        assert_eq!(CHECK_ARGV, ["--config", "-"]);
        for arg in CHECK_ARGV {
            assert!(!arg.contains(PLACEHOLDER));
            assert!(!arg.contains("Authorization"));
        }
        // And the credential IS on stdin, which is the channel it travels on.
        let header = authorization("me@acme.test", PLACEHOLDER);
        let cfg = config("https://acme.atlassian.net/rest/api/3/myself", &header).unwrap();
        assert!(cfg.contains(&header));
        assert_eq!(CURL, "/usr/bin/curl", "absolute, never a PATH lookup");
    }

    /// Nothing of the response body may enter this process, which is what makes
    /// "read-only" true of the data as well as of the method.
    #[test]
    fn the_config_asks_for_a_status_code_and_discards_the_body() {
        let cfg = config("https://acme.atlassian.net/rest/api/3/myself", "Basic eA==").unwrap();
        assert!(cfg.contains("output = \"/dev/null\""), "{cfg}");
        assert!(cfg.contains("write-out = \"%{http_code}\""), "{cfg}");
        // Every boolean is bare: curl rejects the whole config if one is given
        // a value, which would read as "could not run curl" on a working site.
        for line in cfg.lines() {
            if line == "silent" || line == "show-error" {
                continue;
            }
            assert!(
                line.contains(" = "),
                "an option is either a bare boolean or a `name = value`: {line}"
            );
        }
        // Bounded by curl itself, inside the channel's own backstop.
        assert!(cfg.contains(&format!("max-time = {MAX_TIME_SECS}")));
        assert!(cfg.contains(&format!("connect-timeout = {CONNECT_TIMEOUT_SECS}")));
        assert!(MAX_TIME_SECS < JIRA_TIMEOUT.as_secs());
    }

    /// base64 means the two interpolated values in the config line are a
    /// validated URL and an alphabet that contains no quote, backslash or
    /// newline — so a hostile account or token cannot inject an option.
    #[test]
    fn a_hostile_credential_cannot_inject_a_curl_option() {
        let nasty = "a\"b\\c`d$e";
        let header = authorization("me@acme.test", nasty);
        assert!(!header.contains('"') && !header.contains('\\'));
        let cfg = config("https://acme.atlassian.net/rest/api/3/myself", &header).unwrap();
        assert_eq!(
            cfg.lines().count(),
            11,
            "no value may add a line to the config: {cfg}"
        );
        assert!(!cfg.contains(nasty));
        // And the escaping is still applied, so a future non-base64 value
        // cannot end a quoted token early.
        assert_eq!(quote("a\"b"), "\"a\\\"b\"");
        assert_eq!(quote("a\\b"), "\"a\\\\b\"");
        assert_eq!(quote("$(id)`id`;rm -rf /"), "\"$(id)`id`;rm -rf /\"");
    }

    /// `https` is required rather than preferred, and the address is refused
    /// rather than upgraded: an upgrade is this app deciding where a request
    /// carrying a token goes.
    #[test]
    fn a_site_address_is_refused_rather_than_upgraded_or_cleaned() {
        assert_eq!(site_url(SITE).unwrap(), SITE);
        assert_eq!(site_url("https://acme.atlassian.net/").unwrap(), SITE);
        assert_eq!(
            site_url("https://jira.acme.test/jira").unwrap(),
            "https://jira.acme.test/jira",
            "a self-hosted site may live under a path"
        );

        let err = site_url("http://acme.atlassian.net").unwrap_err();
        assert!(err.contains("not upgraded for you"), "{err}");
        assert!(
            site_url("acme.atlassian.net").is_err(),
            "no scheme is assumed"
        );
        let err = site_url("https://me:placeholder@acme.atlassian.net").unwrap_err();
        assert!(err.contains("Remove it"), "{err}");
        assert!(!err.contains("placeholder"), "{err}");
        for bad in ["", "   ", "https://", "https:// acme.test", "https://a\nb"] {
            assert!(site_url(bad).is_err(), "{bad:?} must not be accepted");
        }
    }

    /// A 401 is not a 500. The repair for one is a new token and for the other
    /// is waiting, so they are different cells with different sentences — and
    /// neither sentence may carry the credential.
    #[test]
    fn each_status_maps_to_the_answer_whose_repair_is_the_right_one() {
        let cases = [
            (200, CheckOutcome::Passed),
            (401, CheckOutcome::NeedsAuthentication),
            (403, CheckOutcome::NeedsAuthentication),
            (404, CheckOutcome::Failed),
            (429, CheckOutcome::Failed),
            (500, CheckOutcome::Failed),
            (503, CheckOutcome::Failed),
            (301, CheckOutcome::Failed),
        ];
        for (status, expected) in cases {
            let report = classify(status, SITE);
            assert_eq!(report.outcome, expected, "HTTP {status}");
            if let Some(detail) = &report.detail {
                assert!(!detail.contains(PLACEHOLDER), "{detail}");
                assert!(detail.contains(SITE), "the site is named: {detail}");
            }
        }
        assert!(
            classify(200, SITE).detail.is_none(),
            "a pass needs no explanation"
        );
    }

    /// The whole adapter over both seams, for the three answers a user will
    /// actually see.
    #[test]
    fn the_adapter_reports_a_pass_a_rejection_and_an_unreachable_site_differently() {
        let pass = Recorder::answering(200);
        assert_eq!(
            JiraReader::with(Box::new(stocked()), Box::new(Rc::clone(&pass)))
                .check_site(Some(SITE), Some(&reference()))
                .outcome,
            CheckOutcome::Passed
        );

        let rejected = Recorder::answering(401);
        let report = JiraReader::with(Box::new(stocked()), Box::new(Rc::clone(&rejected)))
            .check_site(Some(SITE), Some(&reference()));
        assert_eq!(report.outcome, CheckOutcome::NeedsAuthentication);
        assert!(report.detail.unwrap().contains("create a new one"));

        // curl could not produce a status at all — the `000` case.
        let dead = Recorder::broken();
        let report = JiraReader::with(Box::new(stocked()), Box::new(Rc::clone(&dead)))
            .check_site(Some(SITE), Some(&reference()));
        assert_eq!(report.outcome, CheckOutcome::Failed);
        assert!(report.detail.unwrap().contains("no HTTP status"));
    }

    /// No token stored is `needsAuthentication` and not `failed`: there is an
    /// action the user can take, and offering a retry instead would be wrong.
    /// Note that the transport is never reached — nothing is sent when there is
    /// nothing to send it with.
    #[test]
    fn a_missing_keychain_item_asks_for_the_token_without_sending_a_request() {
        let seen = Recorder::answering(200);
        let adapter = JiraReader::with(Box::new(MemoryStore::new()), Box::new(Rc::clone(&seen)));
        let report = adapter.check_site(Some(SITE), Some(&reference()));

        assert_eq!(report.outcome, CheckOutcome::NeedsAuthentication);
        let detail = report.detail.unwrap();
        assert!(detail.contains("me@acme.test"), "{detail}");
        assert!(!detail.contains(PLACEHOLDER), "{detail}");
        assert!(
            seen.seen.borrow().is_empty(),
            "no request may be made without a credential"
        );
    }

    /// A connection with no site address, and one with no credential
    /// coordinates. Both are answered as the step that is missing, and neither
    /// reaches the transport.
    #[test]
    fn an_unconfigured_connection_is_answered_rather_than_asked_about() {
        let seen = Recorder::answering(200);
        let adapter = JiraReader::with(Box::new(stocked()), Box::new(Rc::clone(&seen)));

        let no_site = adapter.check_site(None, Some(&reference()));
        assert_eq!(no_site.outcome, CheckOutcome::Failed);
        assert!(no_site.detail.unwrap().contains("no Jira site address"));

        let no_cred = adapter.check_site(Some(SITE), None);
        assert_eq!(no_cred.outcome, CheckOutcome::NeedsAuthentication);
        assert!(
            no_cred
                .detail
                .unwrap()
                .contains("no credential is configured")
        );

        assert!(seen.seen.borrow().is_empty());
    }

    /// The pair this adapter answers for, which is half its identity
    /// (connections.rs:451-453). Claude and Codex are NOT this adapter's
    /// business: binding them means writing their config files, which is the
    /// reviewed-Apply task.
    #[test]
    fn this_adapter_answers_for_exactly_jira_and_effi() {
        let adapter = JiraReader::with(
            Box::new(MemoryStore::new()),
            Box::new(Recorder::answering(200)),
        );
        assert_eq!(adapter.connector(), Connector::Jira);
        assert_eq!(adapter.consumer(), Consumer::Effi);
    }

    /// No detail this adapter can produce carries a credential, over every
    /// status it classifies and every refusal it makes. The reports are what
    /// reach a window and a log, so this is the leak test for the whole file.
    #[test]
    fn no_report_this_adapter_can_produce_contains_a_credential() {
        let mut details: Vec<String> = Vec::new();
        for status in [200u16, 401, 403, 404, 429, 500, 301] {
            let seen = Recorder::answering(status);
            let adapter = JiraReader::with(Box::new(stocked()), Box::new(Rc::clone(&seen)));
            if let Some(d) = adapter.check_site(Some(SITE), Some(&reference())).detail {
                details.push(d);
            }
        }
        let empty = JiraReader::with(
            Box::new(MemoryStore::new()),
            Box::new(Recorder::answering(200)),
        );
        details.extend(
            [
                empty.check_site(Some(SITE), Some(&reference())).detail,
                empty
                    .check_site(Some("http://acme.test"), Some(&reference()))
                    .detail,
                empty.check_site(None, None).detail,
            ]
            .into_iter()
            .flatten(),
        );

        assert!(!details.is_empty());
        for detail in details {
            assert!(!detail.contains(PLACEHOLDER), "{detail}");
            assert!(
                !detail.contains("Basic "),
                "an encoded credential is still a credential: {detail}"
            );
        }
    }
}

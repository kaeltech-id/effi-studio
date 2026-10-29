use crate::doctor::probe_command;
use crate::shell_env;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};

// ---------------------------------------------------------------------------
// What is being reported here
//
// Having the SDK is not having a device. DESIGN-SPEC.md:112-114 says it
// outright — "Jangan menganggap hanya ada SDK berarti emulator ready" — and it
// asks for unsupported-platform, missing-prerequisite and
// missing-runtime-or-device to be three different states with three different
// repairs. One boolean per platform cannot carry that, and a single status enum
// can only carry it by encoding the distinction in prose, which is what
// `deviceReadiness` in choose-tools.tsx:124 currently has to decode out of
// doctor.rs's error sentences with a regular expression.
//
// So each platform reports four facts that are gathered independently and
// published independently: is the platform supported at all, are the tools
// installed, is a runtime installed, does a device exist. The summary readiness
// is derived from them and never replaces them — a caller that needs to know
// WHICH piece is missing reads the fact, not the summary.
//
// DISCOVERY probes nothing into existence. No probe in the discovery half of
// this file may change the state of the machine it is asking about, so a user
// opening the device screen to look cannot start a 4 GB download by looking.
//
// The second half of the file does act — launch and stop — and it is kept
// behind an explicit ownership record for the reason DESIGN-SPEC.md:117 gives:
// "simulator yang sudah dibuka pengguna di luar app tidak dianggap dimiliki
// app. Stop hanya device/proses yang benar dan eksplisit." Launching claims the
// device for the tab that asked; stop acts only on a claim. Nothing here
// downloads a runtime, accepts a licence, or removes, re-creates or clears a
// device: there is no such path in this module, not behind a flag and not as a
// fallback when a launch fails.
//
// REUSE NOTE: `probe_command` above is doctor.rs:252 — the one-second,
// stdin/stderr-nulled, worker-thread-plus-channel probe that exists because
// std::process has no timed wait. It is module-private there today, and this
// task may not edit doctor.rs, so registering this module requires making it
// reachable: in doctor.rs, `fn probe_command` becomes `pub(crate) fn`, and
// `struct Probe` becomes `pub(crate) struct` with `pub ok` and `pub stdout`.
// Four visibility keywords, no logic. The alternative — a second copy of that
// helper here — would mean two places to fix the next PATH or timeout surprise,
// which is the one thing this module must not add.
// ---------------------------------------------------------------------------

/// A native simulator cannot be drawn into the webview that renders this app,
/// and until a backend integration proves otherwise the honest answer is no
/// (DESIGN-SPEC.md:116). Published as a fact rather than assumed by the UI, so
/// the device tab can offer "Opens in a separate window" without a second
/// opinion about it living in the frontend.
const EMBEDDED_PREVIEW_SUPPORTED: bool = false;

/// Mirrors the two device platforms the design package scopes
/// (DESIGN-SPEC.md:112). camelCase on the wire, for the reason recorded at
/// projects.rs:54-58.
/// `Eq + Hash` because the ownership registry below keys on (platform, id):
/// an AVD named `Pixel_8` and a simulator UDID share no namespace, and a key
/// that was only the id would let one platform's stop address the other's.
/// `Deserialize` because launch and stop take it from the frontend.
#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Hash, Debug)]
#[serde(rename_all = "camelCase")]
pub enum DevicePlatform {
    Ios,
    Android,
}

/// Three answers, because "we looked and it is not there" and "we never looked"
/// are different claims and lead to different screens. A machine with no Xcode
/// has no iOS runtime fact to report: claiming `Absent` there would state a
/// finding no probe produced, and would also let the UI print a
/// download-a-runtime repair at a user whose actual next step is an App Store
/// install.
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum FactState {
    Present,
    Absent,
    Unknown,
}

/// One fact, with its own evidence and its own repair. The repair belongs to
/// the fact and not to the platform for the same reason the facts are separate:
/// the fix for a missing device is not the fix for missing tools, and a single
/// per-platform message is how the two get confused.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFact {
    pub state: FactState,
    /// What the probe actually found — a path, a count, a list. Present so the
    /// UI can name the Xcode it is talking about instead of saying "found".
    pub evidence: Option<String>,
    /// What went wrong, in the probe's own words, including the words of a
    /// timeout. Never a credential: nothing here reads one.
    pub problem: Option<String>,
    /// The next step for THIS fact alone.
    pub fix: Option<String>,
}

impl DeviceFact {
    fn present(evidence: impl Into<String>) -> Self {
        DeviceFact {
            state: FactState::Present,
            evidence: Some(evidence.into()),
            problem: None,
            fix: None,
        }
    }

    fn absent(problem: impl Into<String>, fix: impl Into<String>) -> Self {
        DeviceFact {
            state: FactState::Absent,
            evidence: None,
            problem: Some(problem.into()),
            fix: Some(fix.into()),
        }
    }

    /// For an absence observed against something that was found: an SDK with no
    /// system image has to name the SDK, or the user cannot tell which of their
    /// two SDK directories the report is about.
    fn absent_at(
        evidence: impl Into<String>,
        problem: impl Into<String>,
        fix: impl Into<String>,
    ) -> Self {
        DeviceFact {
            state: FactState::Absent,
            evidence: Some(evidence.into()),
            problem: Some(problem.into()),
            fix: Some(fix.into()),
        }
    }

    /// A fact nobody established. `fix` stays empty on purpose — there is no
    /// honest repair for a question that was not asked, and filling one in is
    /// how a Linux machine ends up being told to install Xcode.
    fn unknown(problem: impl Into<String>) -> Self {
        DeviceFact {
            state: FactState::Unknown,
            evidence: None,
            problem: Some(problem.into()),
            fix: None,
        }
    }

    fn is_present(&self) -> bool {
        self.state == FactState::Present
    }
}

/// The same four words the frontend already uses (choose-tools.tsx:112-116), so
/// the wire needs no translation layer and no regular expression over error
/// prose to recover what the backend already knew.
///
/// An unsupported platform is `NotEnabled` rather than `DependencyMissing`:
/// there is no dependency to install on a machine that cannot run the thing at
/// all. What separates it from a user who simply has not set iOS up is the
/// `platform_supported` fact, which is exactly why that fact is published
/// beside the summary instead of being folded into it.
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum DeviceReadiness {
    NotEnabled,
    DependencyMissing,
    RuntimeOrDeviceMissing,
    Available,
}

/// One device that exists, named so a device selector (DESIGN-SPEC.md:114) can
/// offer it. `run_state` is whatever the tool said and is deliberately a free
/// string: simctl's vocabulary is its own, and normalising it here would mean
/// inventing a state for every word Apple adds.
///
/// Listing a device is not claiming this app owns it. A simulator the user
/// booted themselves is not the app's to stop (DESIGN-SPEC.md:118), and nothing
/// in this struct asserts ownership.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceEntry {
    /// A UDID for iOS, the AVD name for Android — whatever a later launch would
    /// have to pass back to address this exact device.
    pub id: String,
    pub name: String,
    pub run_state: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceReport {
    pub platform: DevicePlatform,
    /// Fact 1. iOS simulators exist only on macOS; the Android emulator ships
    /// for all three desktops.
    pub platform_supported: bool,
    /// Fact 2: the vendor toolchain, which this app neither owns nor installs.
    pub tools: DeviceFact,
    /// Fact 3: a runtime or system image to run a device against. A fresh
    /// toolchain has none.
    pub runtime: DeviceFact,
    /// Fact 4: a device actually created. A downloaded runtime has none.
    pub devices: DeviceFact,
    /// Derived from the four facts above and never a substitute for them.
    pub readiness: DeviceReadiness,
    /// Empty whenever `devices` is not `Present`, including when it is
    /// `Unknown`: a list that filled in from a failed probe would be the
    /// optimistic default this module exists to refuse.
    pub found: Vec<DeviceEntry>,
    pub embedded_preview: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DeviceDiscovery {
    pub platforms: Vec<DeviceReport>,
}

/// Tools first, because the later facts are only meaningful under it, and
/// `Unknown` beats `Absent` in both directions: an unprobed runtime cannot make
/// a platform ready, and it cannot send the user to fix it either.
fn readiness_of(
    platform_supported: bool,
    tools: &DeviceFact,
    runtime: &DeviceFact,
    devices: &DeviceFact,
) -> DeviceReadiness {
    if !platform_supported {
        return DeviceReadiness::NotEnabled;
    }
    if !tools.is_present() {
        return DeviceReadiness::DependencyMissing;
    }
    if runtime.is_present() && devices.is_present() {
        return DeviceReadiness::Available;
    }
    // Tools are established, so the dependency reading is already contradicted
    // by a fact — even for a runtime probe that timed out and told us nothing.
    DeviceReadiness::RuntimeOrDeviceMissing
}

fn report(
    platform: DevicePlatform,
    platform_supported: bool,
    tools: DeviceFact,
    runtime: DeviceFact,
    devices: DeviceFact,
    found: Vec<DeviceEntry>,
) -> DeviceReport {
    let readiness = readiness_of(platform_supported, &tools, &runtime, &devices);
    let devices_present = devices.is_present();
    DeviceReport {
        platform,
        platform_supported,
        tools,
        runtime,
        devices,
        readiness,
        found: if devices_present { found } else { Vec::new() },
        embedded_preview: EMBEDDED_PREVIEW_SUPPORTED,
    }
}

/// Every fact after the one that failed, said in the words of the failure that
/// stopped us. Three identical `unknown` arms at each early return would say the
/// same thing three times and drift apart on the first edit.
fn blocked(
    platform: DevicePlatform,
    platform_supported: bool,
    tools: DeviceFact,
    reason: impl Into<String>,
) -> DeviceReport {
    let reason = reason.into();
    report(
        platform,
        platform_supported,
        tools,
        DeviceFact::unknown(format!("not probed: {reason}")),
        DeviceFact::unknown(format!("not probed: {reason}")),
        Vec::new(),
    )
}

// ---------------------------------------------------------------------------
// iOS
// ---------------------------------------------------------------------------

/// `simctl list runtimes available` names each runtime by platform, so watchOS
/// and tvOS lines are excluded by the same prefix that selects iOS ones. Read
/// from the text form rather than the JSON one to keep this to one cheap exec,
/// as doctor.rs:434-440 does.
fn ios_runtime_names(listing: &str) -> Vec<String> {
    listing
        .lines()
        .map(str::trim)
        .filter(|l| l.starts_with("iOS "))
        // "iOS 26.4 (26.4 - 23E5205i) - com.apple.CoreSimulator.SimRuntime..."
        // — only the identifier is dropped. The build stays, because this
        // machine really does carry two 26.4 runtimes and a list printing the
        // same name twice reads as a parsing fault rather than as a fact.
        .map(|l| {
            l.split(" - com.apple")
                .next()
                .unwrap_or(l)
                .trim()
                .to_string()
        })
        .collect()
}

/// `simctl list devices available` groups devices under `-- <platform> --`
/// headers and prints watchOS and tvOS devices in the same output, so the
/// section header has to be tracked (doctor.rs:442-445): a paired Apple Watch
/// is not an iPhone simulator and must not make iOS report ready.
fn ios_device_entries(listing: &str) -> Vec<DeviceEntry> {
    let mut in_ios = false;
    let mut found = Vec::new();

    for line in listing.lines() {
        let trimmed = line.trim();
        if trimmed.starts_with("--") {
            in_ios = trimmed.contains("iOS");
            continue;
        }
        if !in_ios {
            continue;
        }
        // A device line ends with its power state and carries its UDID in the
        // group before it. Parsed from the right because a device name may
        // itself contain parentheses, and matched on the UDID's shape so that
        // banners, blank lines and the trailing "(unavailable, ...)" note on a
        // stale entry cannot be read as a device.
        let Some((head, state)) = trimmed.rsplit_once(" (") else {
            continue;
        };
        let Some((name, udid)) = head.rsplit_once(" (") else {
            continue;
        };
        let udid = udid.trim_end_matches(')');
        let is_udid = udid.len() >= 36 && udid.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
        if !is_udid || name.is_empty() {
            continue;
        }
        found.push(DeviceEntry {
            id: udid.to_string(),
            name: name.to_string(),
            run_state: Some(state.trim_end_matches(')').to_string()),
        });
    }
    found
}

/// `probe_command` reads `login_shell_path()` from inside the child-spawning
/// thread, so the very first probe of a session pays for a `zsh -ilc` out of its
/// own one-second budget. Measured on this machine that is enough to time out a
/// probe whose command answers in 0.13s, which would report a present Xcode as
/// unknown. Resolving the cache here puts that cost outside every budget, and
/// the `OnceLock` makes later calls free. Called from both entry points so a
/// caller that wants one platform gets the same guarantee.
fn warm_login_shell_path() {
    let _ = shell_env::login_shell_path();
}

/// Four outcomes, because the design package asks for them separately
/// (DESIGN-SPEC.md:112) and because each one has its own next step: this is not
/// a Mac, no developer directory is selected, only the Command Line Tools are
/// installed, or Xcode is there and the runtime or the device is not.
pub fn discover_ios() -> DeviceReport {
    let platform = DevicePlatform::Ios;
    warm_login_shell_path();

    if !cfg!(target_os = "macos") {
        // No tools fact either: nothing was probed, because nothing could be.
        return blocked(
            platform,
            false,
            DeviceFact::unknown("not probed: iOS simulators exist only on macOS"),
            "iOS simulators exist only on macOS",
        );
    }

    let developer_dir = match probe_command("xcode-select", &["-p"]) {
        Ok(p) if p.ok => p.stdout.trim().to_string(),
        Ok(_) => {
            return blocked(
                platform,
                true,
                DeviceFact::absent(
                    "no developer directory is selected",
                    "install Xcode, then run xcode-select --switch",
                ),
                "no developer directory is selected",
            );
        }
        // Not found, not executable, or out of time — probe_command's `Err`
        // covers all three and says which. Unknown rather than absent: a
        // xcode-select that did not answer is not evidence that Xcode is gone,
        // and the readiness summary already sends an unestablished toolchain to
        // the earlier, cheaper fix without this fact having to claim anything.
        Err(e) => return blocked(platform, true, DeviceFact::unknown(e.clone()), e),
    };

    // The Command Line Tools satisfy xcode-select and ship no simulators at
    // all, so this is the missing-tools fact and not the missing-runtime one:
    // the step is an App Store install, not a download inside Xcode. Reported
    // as its own case because the two repairs are hours apart in cost.
    if developer_dir.contains("CommandLineTools") {
        return blocked(
            platform,
            true,
            DeviceFact::absent_at(
                developer_dir,
                "only the Command Line Tools are installed; iOS simulators need full Xcode",
                "install Xcode from the App Store, then run xcode-select --switch",
            ),
            "full Xcode is not installed",
        );
    }

    let tools = DeviceFact::present(developer_dir.clone());

    let runtime = match probe_command("xcrun", &["simctl", "list", "runtimes", "available"]) {
        Ok(p) if p.ok => {
            let names = ios_runtime_names(&p.stdout);
            if names.is_empty() {
                DeviceFact::absent_at(
                    developer_dir.clone(),
                    "Xcode is installed but no iOS runtime is",
                    "download one in Xcode > Settings > Components",
                )
            } else {
                DeviceFact::present(names.join(", "))
            }
        }
        Ok(_) => DeviceFact::unknown("simctl would not list its runtimes"),
        Err(e) => DeviceFact::unknown(e),
    };

    // Probed whatever the runtime fact said. The two are independent questions
    // and a zero-runtime machine with a leftover device is worth seeing as
    // exactly that, rather than as a device fact nobody checked.
    let (devices, found) = match probe_command("xcrun", &["simctl", "list", "devices", "available"])
    {
        Ok(p) if p.ok => {
            let entries = ios_device_entries(&p.stdout);
            if entries.is_empty() {
                (
                    DeviceFact::absent_at(
                        developer_dir.clone(),
                        "no iOS simulator device exists",
                        "create one in Xcode > Window > Devices and Simulators",
                    ),
                    Vec::new(),
                )
            } else {
                (
                    DeviceFact::present(format!("{} simulator(s)", entries.len())),
                    entries,
                )
            }
        }
        Ok(_) => (
            DeviceFact::unknown("simctl would not list its devices"),
            Vec::new(),
        ),
        Err(e) => (DeviceFact::unknown(e), Vec::new()),
    };

    report(platform, true, tools, runtime, devices, found)
}

// ---------------------------------------------------------------------------
// Android
// ---------------------------------------------------------------------------

/// ANDROID_HOME first, then the deprecated ANDROID_SDK_ROOT older installs still
/// export, then the per-platform default Android Studio writes. Each candidate
/// is checked for existing rather than for being set, because a stale
/// ANDROID_HOME left in a shell profile is not an SDK (doctor.rs:545-551).
///
/// The default path carries the weight: a GUI process inherits no shell exports
/// at all, and `login_shell_path` recovers PATH and nothing else.
fn android_sdk_dir() -> Option<PathBuf> {
    let from_env = ["ANDROID_HOME", "ANDROID_SDK_ROOT"]
        .into_iter()
        .filter_map(|k| std::env::var(k).ok())
        .filter(|v| !v.is_empty())
        .map(PathBuf::from);

    let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
    let default = if cfg!(target_os = "macos") {
        home.join("Library/Android/sdk")
    } else if cfg!(target_os = "windows") {
        PathBuf::from(std::env::var("LOCALAPPDATA").unwrap_or_default()).join("Android/Sdk")
    } else {
        home.join("Android/Sdk")
    };

    from_env
        .chain(std::iter::once(default))
        .find(|p| p.is_dir())
}

/// The emulator ships as its own SDK package, so it is addressed at its path
/// inside the SDK rather than on PATH: a user with the SDK but without that
/// package has to be told which piece is missing, and on most machines the
/// emulator never reaches PATH either way (doctor.rs:587-589).
///
/// One function because discovery and launch must mean the same binary. Two
/// copies of this join would be two chances for the launch to run something the
/// readiness report never looked at.
fn android_emulator_in(sdk: &Path) -> PathBuf {
    sdk.join("emulator").join(if cfg!(target_os = "windows") {
        "emulator.exe"
    } else {
        "emulator"
    })
}

/// Android's runtime fact. System images live three levels under
/// `system-images` as api/tag/abi, and they are what an AVD actually runs
/// against — which is why this is read off the filesystem and not inferred from
/// the AVD list: an AVD whose image was removed still appears in
/// `-list-avds`, and reporting it as a runtime would be the SDK-means-ready
/// assumption arriving by the back door.
///
/// Read-only directory walking, no exec: the SDK manager is the only thing that
/// may write here, and it is not this app.
fn android_system_images(sdk: &Path) -> Vec<String> {
    let root = sdk.join("system-images");
    let mut images = Vec::new();

    let Ok(apis) = std::fs::read_dir(&root) else {
        return images;
    };
    for api in apis.flatten().filter(|e| e.path().is_dir()) {
        let Ok(tags) = std::fs::read_dir(api.path()) else {
            continue;
        };
        for tag in tags.flatten().filter(|e| e.path().is_dir()) {
            let Ok(abis) = std::fs::read_dir(tag.path()) else {
                continue;
            };
            for abi in abis.flatten().filter(|e| e.path().is_dir()) {
                images.push(format!(
                    "{}/{}/{}",
                    api.file_name().to_string_lossy(),
                    tag.file_name().to_string_lossy(),
                    abi.file_name().to_string_lossy()
                ));
            }
        }
    }
    images
}

/// The emulator prefixes its own diagnostics with a level and a pipe
/// ("INFO    | ..."), and those lines are not AVD names: counted as devices
/// they would make an emulator with nothing configured look populated
/// (doctor.rs:609-612).
fn avd_names(listing: &str) -> Vec<String> {
    listing
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .filter(|l| !l.contains('|'))
        .map(str::to_string)
        .collect()
}

/// Android needs tools, a runtime and a device too, and the SDK is only the
/// first of the three (DESIGN-SPEC.md:112-114). The emulator package, the system
/// image and the AVD are three separate downloads or actions, so they are three
/// separate facts — and none of their repairs is "install the SDK".
pub fn discover_android() -> DeviceReport {
    let platform = DevicePlatform::Android;
    warm_login_shell_path();

    let Some(sdk) = android_sdk_dir() else {
        return blocked(
            platform,
            true,
            DeviceFact::absent(
                "Android SDK not found",
                "set ANDROID_HOME, or install the SDK through Android Studio",
            ),
            "Android SDK not found",
        );
    };
    let sdk_detail = sdk.display().to_string();

    let emulator = android_emulator_in(&sdk);
    if !emulator.is_file() {
        return blocked(
            platform,
            true,
            DeviceFact::absent_at(
                sdk_detail,
                "the SDK is installed but its emulator package is not",
                "add the Android Emulator package in the SDK Manager",
            ),
            "the emulator package is not installed",
        );
    }

    let tools = DeviceFact::present(format!("{sdk_detail} · {}", emulator.display()));

    let images = android_system_images(&sdk);
    let runtime = if images.is_empty() {
        DeviceFact::absent_at(
            sdk_detail.clone(),
            format!(
                "no system image found under {}",
                sdk.join("system-images").display()
            ),
            "add a system image in the SDK Manager",
        )
    } else {
        DeviceFact::present(images.join(", "))
    };

    let (devices, found) = match probe_command(&emulator.to_string_lossy(), &["-list-avds"]) {
        Ok(p) if p.ok => {
            let names = avd_names(&p.stdout);
            if names.is_empty() {
                (
                    DeviceFact::absent_at(
                        sdk_detail.clone(),
                        "the SDK and emulator are installed but no AVD is created",
                        "create one in Android Studio > Device Manager",
                    ),
                    Vec::new(),
                )
            } else {
                let entries = names
                    .into_iter()
                    .map(|name| DeviceEntry {
                        // An AVD is addressed by its name, and nothing in a
                        // read-only listing says whether it is running: that
                        // answer needs adb, which belongs to the module that
                        // launches devices. Left `None` rather than guessed.
                        id: name.clone(),
                        name,
                        run_state: None,
                    })
                    .collect::<Vec<_>>();
                (
                    DeviceFact::present(format!("{} AVD(s)", entries.len())),
                    entries,
                )
            }
        }
        Ok(_) => (
            DeviceFact::unknown("the emulator would not list AVDs"),
            Vec::new(),
        ),
        Err(e) => (DeviceFact::unknown(e), Vec::new()),
    };

    report(platform, true, tools, runtime, devices, found)
}

/// Both platforms, never `Err`: a failed probe is a fact, and an `Err` return
/// would take the other platform's report down with it — the same reasoning
/// doctor.rs:666-668 records for its nine components.
///
/// Run concurrently because the two share nothing, so the screen waits for the
/// slower platform rather than for the sum of both. Order is fixed by the
/// vector, so the UI draws the same two rows in the same places however the
/// probes finish.
#[tauri::command]
pub fn discover_devices() -> DeviceDiscovery {
    let jobs = [
        (DevicePlatform::Ios, thread::spawn(discover_ios)),
        (DevicePlatform::Android, thread::spawn(discover_android)),
    ];

    DeviceDiscovery {
        platforms: jobs
            .into_iter()
            .map(|(platform, handle)| {
                handle.join().unwrap_or_else(|_| {
                    // A panicking probe is one platform's bad news. Unwrapping
                    // would make it both platforms'.
                    blocked(
                        platform,
                        true,
                        DeviceFact::unknown("the check for this platform panicked"),
                        "the check for this platform panicked",
                    )
                })
            })
            .collect(),
    }
}

// ---------------------------------------------------------------------------
// Ownership
//
// DESIGN-SPEC.md:117 asks for two things that pull in opposite directions: a
// device is tied to the project/tab that runs it, AND a simulator the user
// opened outside the app is not the app's. A boolean "is running" cannot carry
// both — `simctl list` reports a user's own simulator exactly like one this app
// booted, so a stop driven off the listing would shut down a device the app
// never started.
//
// So running-ness is not the authority here. A separate record is: launch
// writes one, and stop reads it and acts on nothing else. The record is the
// only thing that distinguishes the two identical-looking Booted simulators,
// and it exists only for devices this app itself started.
//
// It is deliberately in memory only. Nothing about ownership survives a quit:
// the records go, the devices stay up, and nothing is killed on the way out —
// which is the behaviour the spec asks for, because a user who booted an
// iPhone 16 through Effi and then closed Effi has not asked for their simulator
// to go down with it. Persisting the records to disk would resurrect claims
// over devices that are no longer running, and make the app's first action
// after a restart a stop it cannot justify.
// ---------------------------------------------------------------------------

/// The honest label for every launch this build can offer, since
/// `EMBEDDED_PREVIEW_SUPPORTED` is false: the device appears in its own native
/// window, not in the tab (DESIGN-SPEC.md:115). Published with each outcome so
/// the controller never has to decide for itself whether to promise a viewport.
const EXTERNAL_WINDOW_NOTE: &str = "Opens in a separate window";

/// Identity, not a name: a simulator is its UDID and an AVD is its name, and
/// the platform is part of the key so neither can address the other.
#[derive(PartialEq, Eq, Hash, Clone, Debug)]
struct DeviceKey {
    platform: DevicePlatform,
    device_id: String,
}

impl DeviceKey {
    fn new(platform: DevicePlatform, device_id: &str) -> Self {
        DeviceKey {
            platform,
            device_id: device_id.to_string(),
        }
    }
}

/// What this app is actually holding, which is not the same thing on the two
/// platforms and must not be flattened into one.
///
/// `xcrun simctl boot` exits as soon as the boot is under way; the simulator
/// belongs to CoreSimulator, not to us, so there is no process of ours to keep
/// and the thing we own is the UDID. The Android emulator is the opposite: it
/// IS the process, so we keep its `Child` and stop exactly that pid. Holding
/// the handle rather than looking a process up by name later is what makes stop
/// "benar dan eksplisit" — no pattern match over somebody else's emulators.
enum OwnedHandle {
    /// iOS. Shut down by UDID through simctl, because that is all that exists
    /// to address.
    BootedSimulator,
    /// Android. Stopped by killing the child this app spawned, never by
    /// searching the process table for an emulator that might be someone's.
    EmulatorProcess(Child),
}

impl OwnedHandle {
    fn stop_action(&self) -> &'static str {
        match self {
            OwnedHandle::BootedSimulator => "xcrun simctl shutdown <udid>",
            OwnedHandle::EmulatorProcess(_) => "terminate the emulator process this app spawned",
        }
    }
}

/// The wire-facing half of a claim. Everything a UI needs to decide whether to
/// offer Stop, and nothing it could use to stop something else.
#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OwnedDevice {
    pub platform: DevicePlatform,
    pub device_id: String,
    pub device_name: String,
    /// The tab that asked. Stop from another tab is refused: a claim with no
    /// owner would be a claim any surface could spend.
    pub tab_id: String,
    pub started_at_unix_ms: u64,
    /// Whether the start command confirmed. False is still owned — see
    /// `launch_with`.
    pub start_confirmed: bool,
    /// What the start or the stop attempt said, when it said anything. Never a
    /// credential: nothing here reads one.
    pub note: Option<String>,
    /// How stop will act on this exact claim, in words the UI can show before
    /// the user commits.
    pub stop_action: &'static str,
}

struct Ownership {
    record: OwnedDevice,
    handle: OwnedHandle,
}

/// Tauri state, registered once by the app. The lock is held only for map
/// operations — never across a boot, a kill or a probe — so a slow simulator
/// cannot block the list of what is owned.
#[derive(Default)]
pub struct DeviceOwnership(Mutex<HashMap<DeviceKey, Ownership>>);

impl DeviceOwnership {
    fn owner(&self, key: &DeviceKey) -> Option<OwnedDevice> {
        let map = self.0.lock().ok()?;
        map.get(key).map(|o| o.record.clone())
    }

    fn claim(&self, key: DeviceKey, record: OwnedDevice, handle: OwnedHandle) {
        if let Ok(mut map) = self.0.lock() {
            map.insert(key, Ownership { record, handle });
        }
    }

    /// Gives up the claim and hands back what was held, so a caller that wants
    /// the device stopped has to do that itself. Dropping an
    /// `OwnedHandle::EmulatorProcess` does NOT kill the child — `Child`'s drop
    /// is documented not to — which is exactly why release can be the quit path.
    fn take(&self, key: &DeviceKey) -> Option<Ownership> {
        self.0.lock().ok()?.remove(key)
    }

    /// What this app currently claims. The UI offers Stop for these and for
    /// nothing else, which is how a user's own simulator stays listed by
    /// discovery and un-stoppable here.
    pub fn owned(&self) -> Vec<OwnedDevice> {
        let Ok(map) = self.0.lock() else {
            return Vec::new();
        };
        let mut all: Vec<OwnedDevice> = map.values().map(|o| o.record.clone()).collect();
        // Stable order so a list that is redrawn does not reshuffle.
        all.sort_by(|a, b| a.device_id.cmp(&b.device_id));
        all
    }

    /// Ownership ends, the device keeps running. For a closing tab and for the
    /// app quitting: both are "we are no longer responsible for this", neither
    /// is "shut this down". A user who wants it down presses Stop.
    pub fn release(&self, tab_id: Option<&str>) -> Vec<OwnedDevice> {
        let Ok(mut map) = self.0.lock() else {
            return Vec::new();
        };
        let going: Vec<DeviceKey> = map
            .iter()
            .filter(|(_, o)| tab_id.is_none_or(|t| o.record.tab_id == t))
            .map(|(k, _)| k.clone())
            .collect();
        going
            .into_iter()
            // `remove` drops the handle without killing it; see `take`.
            .filter_map(|k| map.remove(&k).map(|o| o.record))
            .collect()
    }
}

/// Why a launch did or did not happen. Separate words rather than one bool and
/// a sentence, because the UI's next step differs for every one of them and
/// because `runningOutsideApp` is the case the spec names explicitly.
#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum LaunchStatus {
    /// This app started it and now owns it.
    Launched,
    /// This tab already owns it; nothing was started a second time.
    AlreadyOwnedHere,
    /// Another tab started it. Not this tab's to re-launch or to stop.
    OwnedByAnotherTab,
    /// Up already, and this app never started it — a simulator the user opened
    /// themselves. Listed, usable, never owned, and Stop is not offered
    /// (DESIGN-SPEC.md:117).
    RunningOutsideApp,
    /// An id discovery did not list. Refused rather than passed to a tool.
    NotADiscoveredDevice,
    /// The readiness facts already say no. Refused with the fact's own words
    /// instead of attempting a boot that would fail opaquely.
    PrerequisitesMissing,
    /// The start was issued and explicitly refused. No claim is left behind.
    CouldNotStart,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOutcome {
    pub status: LaunchStatus,
    /// The readiness the decision was taken against, so the UI shows the same
    /// four words the device row shows.
    pub readiness: DeviceReadiness,
    /// The claim, when one exists — including the pre-existing claim behind
    /// `alreadyOwnedHere` and `ownedByAnotherTab`. `None` for every refusal.
    pub owned: Option<OwnedDevice>,
    pub problem: Option<String>,
    pub fix: Option<String>,
    /// Still false. A later task writes the capability report; until a backend
    /// integration proves otherwise, a launch means a native window.
    pub embedded_preview: bool,
    pub window_note: &'static str,
}

/// What the decision was, before anything was started. Separated from the doing
/// so the refusals can be tested without a device existing, and so there is
/// exactly one place where "may we start this" is answered.
enum LaunchPlan {
    /// Clear to claim and start this exact discovered device.
    Start(DeviceEntry),
    /// Nothing to start. Report and touch nothing.
    Report {
        status: LaunchStatus,
        problem: Option<String>,
        fix: Option<String>,
    },
}

/// The one fact standing between this platform and `Available`, with its own
/// repair. Reused rather than re-worded: the readiness screen and the launch
/// refusal must not disagree about what is missing.
fn blocking_fact(report: &DeviceReport) -> &DeviceFact {
    if !report.tools.is_present() {
        &report.tools
    } else if !report.runtime.is_present() {
        &report.runtime
    } else {
        &report.devices
    }
}

/// simctl's own vocabulary, read conservatively: `Booted` and the transient
/// `Booting` both mean a device that is already coming up and must not be
/// started again.
///
/// Android has no equivalent — `emulator -list-avds` says nothing about which
/// AVDs are live, so `run_state` is `None` there and `RunningOutsideApp` can
/// only ever be reported for iOS. That asymmetry is real and is left visible
/// rather than papered over with a guess: an AVD lock file on disk survives a
/// crash, so reading one would refuse launches for emulators that are not
/// running. The claim registry remains the only ownership authority on Android,
/// and an AVD the user already started outside the app is caught by the
/// emulator itself, which refuses a second instance of the same AVD.
fn looks_already_running(run_state: Option<&str>) -> bool {
    run_state.is_some_and(|s| s.trim().to_ascii_lowercase().starts_with("boot"))
}

fn decide_launch(
    report: &DeviceReport,
    device_id: &str,
    tab_id: &str,
    owner: Option<&OwnedDevice>,
) -> LaunchPlan {
    if report.readiness != DeviceReadiness::Available {
        let fact = blocking_fact(report);
        return LaunchPlan::Report {
            status: LaunchStatus::PrerequisitesMissing,
            problem: fact
                .problem
                .clone()
                .or_else(|| Some("this platform is not ready to launch a device".to_string())),
            // Whatever the fact's repair is, including none: an `Unknown` fact
            // publishes no fix, and inventing one here is how a Linux machine
            // gets told to install Xcode.
            fix: fact.fix.clone(),
        };
    }

    // An id the readiness probe never listed is never handed to a tool. This is
    // both the honest answer (we cannot claim to have launched a device we have
    // no evidence for) and the reason no caller-supplied string reaches an
    // argument list.
    let Some(entry) = report.found.iter().find(|e| e.id == device_id) else {
        return LaunchPlan::Report {
            status: LaunchStatus::NotADiscoveredDevice,
            problem: Some(format!(
                "no device with id {device_id} was found on this machine"
            )),
            fix: Some("pick a device from the list this screen discovered".to_string()),
        };
    };

    // Ownership is settled BEFORE running-ness, because a device this app
    // booted also reads as `Booted`. The other order would call our own claim a
    // stranger's simulator and take Stop away from the tab that started it.
    if let Some(owner) = owner {
        return LaunchPlan::Report {
            status: if owner.tab_id == tab_id {
                LaunchStatus::AlreadyOwnedHere
            } else {
                LaunchStatus::OwnedByAnotherTab
            },
            problem: if owner.tab_id == tab_id {
                None
            } else {
                Some(format!(
                    "{} was launched by another tab and is owned there",
                    owner.device_name
                ))
            },
            fix: None,
        };
    }

    if looks_already_running(entry.run_state.as_deref()) {
        return LaunchPlan::Report {
            status: LaunchStatus::RunningOutsideApp,
            problem: Some(format!(
                "{} is already running and was not started by this app, so this app does not own it",
                entry.name
            )),
            fix: Some("use it as it is, or stop it where it was started".to_string()),
        };
    }

    LaunchPlan::Start(entry.clone())
}

/// A start that happened, in the words of the thing that started it.
struct StartResult {
    handle: OwnedHandle,
    /// Whether the start command actually confirmed. See `launch_with` for why
    /// an unconfirmed start is still owned.
    confirmed: bool,
    note: Option<String>,
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// The order here is the point: the claim is written BEFORE the start is
/// issued, and withdrawn only if the start is explicitly refused.
///
/// The other order loses devices. `simctl boot` answers in roughly the same
/// time as `probe_command`'s one-second budget, so a boot that is under way but
/// unconfirmed is an ordinary outcome, not an edge case — and a boot issued
/// against an unwritten claim would leave a simulator coming up that this app
/// has no record of and therefore may never stop. Claiming first makes that
/// impossible: the identity we claim is the exact id we are about to pass to
/// the tool, so stop stays explicit either way, and `start_confirmed: false`
/// keeps the uncertainty visible instead of asserting a boot nobody saw finish.
///
/// `start` is a parameter so the decision path and the bookkeeping can be
/// tested over a constructed registry without booting anything.
fn launch_with<F>(
    ownership: &DeviceOwnership,
    tab_id: &str,
    report: &DeviceReport,
    device_id: &str,
    start: F,
) -> LaunchOutcome
where
    F: FnOnce(&DeviceEntry) -> Result<StartResult, String>,
{
    let key = DeviceKey::new(report.platform, device_id);
    let existing = ownership.owner(&key);

    let entry = match decide_launch(report, device_id, tab_id, existing.as_ref()) {
        LaunchPlan::Start(entry) => entry,
        LaunchPlan::Report {
            status,
            problem,
            fix,
        } => {
            return LaunchOutcome {
                status,
                readiness: report.readiness,
                // A pre-existing claim is reported back even when this tab may
                // not use it: the UI has to be able to say who holds it.
                owned: existing,
                problem,
                fix,
                embedded_preview: EMBEDDED_PREVIEW_SUPPORTED,
                window_note: EXTERNAL_WINDOW_NOTE,
            };
        }
    };

    let mut record = OwnedDevice {
        platform: report.platform,
        device_id: entry.id.clone(),
        device_name: entry.name.clone(),
        tab_id: tab_id.to_string(),
        started_at_unix_ms: now_unix_ms(),
        start_confirmed: false,
        note: None,
        stop_action: OwnedHandle::BootedSimulator.stop_action(),
    };
    ownership.claim(
        key.clone(),
        record.clone(),
        OwnedHandle::BootedSimulator, // replaced below by whatever actually started
    );

    match start(&entry) {
        Ok(result) => {
            record.start_confirmed = result.confirmed;
            record.note = result.note.clone();
            record.stop_action = result.handle.stop_action();
            ownership.claim(key, record.clone(), result.handle);
            LaunchOutcome {
                status: LaunchStatus::Launched,
                readiness: report.readiness,
                owned: Some(record),
                problem: None,
                fix: None,
                embedded_preview: EMBEDDED_PREVIEW_SUPPORTED,
                window_note: EXTERNAL_WINDOW_NOTE,
            }
        }
        // Explicitly refused: the tool ran and said no, so nothing of ours is
        // running and the claim would be a false one. Withdrawn, not kept.
        Err(problem) => {
            ownership.take(&key);
            LaunchOutcome {
                status: LaunchStatus::CouldNotStart,
                readiness: report.readiness,
                owned: None,
                problem: Some(problem),
                fix: Some(
                    "open the device in Xcode or Android Studio to see what it says".to_string(),
                ),
                embedded_preview: EMBEDDED_PREVIEW_SUPPORTED,
                window_note: EXTERNAL_WINDOW_NOTE,
            }
        }
    }
}

/// iOS. One command, no flags beyond the UDID: boot an existing device, or say
/// why not. There is nothing here that downloads a runtime or agrees to a
/// licence, and a missing runtime was already refused by `decide_launch`.
///
/// `probe_command` because a `simctl` against a broken Xcode selection can sit
/// for a long time and no launch may hold the window. Its `Err` — out of time,
/// or could not run at all — is reported as an unconfirmed start rather than a
/// refusal: by this point discovery has already run `xcrun` successfully to
/// list this very device, so the realistic `Err` is the timeout, and a boot
/// that is probably under way must stay stoppable.
fn start_ios_simulator(entry: &DeviceEntry) -> Result<StartResult, String> {
    match probe_command("xcrun", &["simctl", "boot", &entry.id]) {
        Ok(p) if p.ok => Ok(StartResult {
            handle: OwnedHandle::BootedSimulator,
            confirmed: true,
            note: None,
        }),
        Ok(_) => Err(format!("simctl would not boot {}", entry.name)),
        Err(e) => Ok(StartResult {
            handle: OwnedHandle::BootedSimulator,
            confirmed: false,
            note: Some(format!("boot was issued but did not confirm: {e}")),
        }),
    }
}

/// Android. A detached spawn, NOT a `probe_command`.
///
/// The emulator is the long-running process — it does not exit until the device
/// does — so a timed probe would be wrong twice over: the one-second budget
/// would always expire, and `probe_command` answers the caller and leaves the
/// child to finish, which here means an emulator running with nobody holding
/// its handle. Unstoppable by definition, and precisely the orphan
/// DESIGN-SPEC.md:117 is written against.
///
/// So the child is spawned and KEPT. All three streams are null: null stdin so
/// an emulator that decides to ask something fails instead of waiting forever
/// on a GUI app's stdin, null stdout and stderr so its very chatty logging
/// cannot fill a pipe nobody is draining. PATH comes from the login shell for
/// the reason shell_env.rs:6-8 records.
///
/// `process_group(0)` puts it in its own group so a Ctrl-C or a hang-up aimed
/// at this app, launched from a terminal, is not delivered to the user's
/// emulator too. Quitting the app must not take the device down; that promise
/// has to hold for signals as well as for our own code.
///
/// The argument list is `-avd <name>` and nothing else. No flag that clears,
/// re-creates or re-provisions the AVD is passed, and none is available to pass
/// from here.
fn start_android_emulator(entry: &DeviceEntry) -> Result<StartResult, String> {
    let sdk = android_sdk_dir().ok_or_else(|| "Android SDK not found".to_string())?;
    let emulator = android_emulator_in(&sdk);
    if !emulator.is_file() {
        return Err(format!("no emulator binary at {}", emulator.display()));
    }

    let mut cmd = Command::new(&emulator);
    cmd.arg("-avd")
        .arg(&entry.id)
        .env("PATH", shell_env::login_shell_path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    detach(&mut cmd);

    let child = cmd
        .spawn()
        .map_err(|e| format!("could not start the emulator: {e}"))?;

    Ok(StartResult {
        handle: OwnedHandle::EmulatorProcess(child),
        // The process is ours and running; that is what is being claimed. It is
        // not a claim that the device has finished booting — the emulator takes
        // its own time and only a diagnostic could say that.
        confirmed: true,
        note: Some(format!(
            "the emulator is starting in its own window (pid held by this app) · {EXTERNAL_WINDOW_NOTE}"
        )),
    })
}

#[cfg(unix)]
fn detach(cmd: &mut Command) {
    use std::os::unix::process::CommandExt;
    cmd.process_group(0);
}

/// Windows has no process group to leave; a spawned child there is already not
/// signalled by the parent's console handler the same way.
#[cfg(not(unix))]
fn detach(_cmd: &mut Command) {}

#[derive(Serialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum StopStatus {
    Stopped,
    /// The refusal the spec asks for: this app never started this device, so it
    /// is not this app's to stop. A simulator the user opened themselves lands
    /// here, every time, however plainly `simctl` says it is Booted.
    NotOwnedByApp,
    /// Started by a different tab. Stop belongs to the tab that owns it.
    OwnedByAnotherTab,
    /// The stop was issued against the right device and did not confirm. The
    /// claim is kept so it can be tried again.
    DidNotConfirm,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StopOutcome {
    pub status: StopStatus,
    /// The claim as it stands after the attempt: `None` once the device is
    /// stopped and the claim is gone, the unchanged claim when it was kept.
    pub owned: Option<OwnedDevice>,
    pub problem: Option<String>,
    pub fix: Option<String>,
}

/// Stop acts on a claim or on nothing. `act` is a parameter for the same reason
/// as in `launch_with`: every refusal and the bookkeeping either side of a stop
/// can then be tested without a device.
fn stop_with<F>(
    ownership: &DeviceOwnership,
    tab_id: &str,
    platform: DevicePlatform,
    device_id: &str,
    act: F,
) -> StopOutcome
where
    F: FnOnce(&mut OwnedHandle, &OwnedDevice) -> Result<(), String>,
{
    let key = DeviceKey::new(platform, device_id);

    // No claim, no stop. Nothing is probed, nothing is matched by name, and no
    // process table is searched: the absence of a record IS the answer.
    let Some(owner) = ownership.owner(&key) else {
        return StopOutcome {
            status: StopStatus::NotOwnedByApp,
            owned: None,
            problem: Some(format!(
                "this app did not start {device_id}, so it will not stop it"
            )),
            fix: Some("stop it where it was started".to_string()),
        };
    };

    if owner.tab_id != tab_id {
        return StopOutcome {
            status: StopStatus::OwnedByAnotherTab,
            owned: Some(owner.clone()),
            problem: Some(format!(
                "{} is owned by another tab, which is where it can be stopped",
                owner.device_name
            )),
            fix: None,
        };
    }

    // Taken out first so the handle can be acted on by value, then put back
    // unchanged if the stop did not confirm. A claim is never silently dropped
    // by a failed stop: the device would still be up with nobody holding it.
    let Some(mut held) = ownership.take(&key) else {
        return StopOutcome {
            status: StopStatus::NotOwnedByApp,
            owned: None,
            problem: Some("the claim went away while stopping".to_string()),
            fix: None,
        };
    };

    match act(&mut held.handle, &owner) {
        Ok(()) => StopOutcome {
            status: StopStatus::Stopped,
            owned: None,
            problem: None,
            fix: None,
        },
        Err(problem) => {
            held.record.note = Some(problem.clone());
            let record = held.record.clone();
            ownership.claim(key, held.record, held.handle);
            StopOutcome {
                status: StopStatus::DidNotConfirm,
                owned: Some(record),
                problem: Some(problem),
                fix: Some(
                    "press Stop again, or shut the device down where it is showing".to_string(),
                ),
            }
        }
    }
}

/// The stop that matches the handle. iOS shuts the UDID down through simctl;
/// Android kills the pid this app is holding and reaps it, the way
/// pty.rs:78-82 does, because an unreaped child becomes a zombie.
///
/// A shutdown, not anything stronger. The device keeps its data, its apps and
/// its settings; this module has no path that would change any of them.
fn perform_stop(handle: &mut OwnedHandle, record: &OwnedDevice) -> Result<(), String> {
    match handle {
        OwnedHandle::BootedSimulator => {
            match probe_command("xcrun", &["simctl", "shutdown", &record.device_id]) {
                Ok(p) if p.ok => Ok(()),
                Ok(_) => Err(format!("simctl would not shut down {}", record.device_name)),
                Err(e) => Err(e),
            }
        }
        OwnedHandle::EmulatorProcess(child) => {
            // Already gone — the user closed the emulator window themselves.
            // That is a stop, not a failure, and `try_wait` has reaped it.
            if matches!(child.try_wait(), Ok(Some(_))) {
                return Ok(());
            }
            child
                .kill()
                .map_err(|e| format!("could not stop the emulator process: {e}"))?;
            let _ = child.wait();
            Ok(())
        }
    }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// Launch is explicit and per-tab (DESIGN-SPEC.md:114): it boots a device that
/// discovery already found, or it reports why it cannot. It never downloads a
/// runtime, never agrees to a licence, and never creates a device.
///
/// Prerequisites are re-read here rather than taken from the caller: the screen
/// the button was drawn on may be minutes old, and a launch that trusted it
/// would attempt a boot against an Xcode that has since been moved and fail
/// opaquely. One discovery pass for the one platform asked about, so the other
/// platform's probes are not paid for.
///
/// `warm_login_shell_path` first, for the reason doctor.rs:288-310 records: a
/// cold `$SHELL -ilc` costs several hundred milliseconds and must not be spent
/// inside a probe's one-second budget.
#[tauri::command]
pub fn launch_device(
    tab_id: String,
    platform: DevicePlatform,
    device_id: String,
    ownership: tauri::State<'_, DeviceOwnership>,
) -> LaunchOutcome {
    warm_login_shell_path();

    match platform {
        DevicePlatform::Ios => launch_with(
            &ownership,
            &tab_id,
            &discover_ios(),
            &device_id,
            start_ios_simulator,
        ),
        DevicePlatform::Android => launch_with(
            &ownership,
            &tab_id,
            &discover_android(),
            &device_id,
            start_android_emulator,
        ),
    }
}

/// Stop, and only of something this app started from this tab. No discovery
/// pass: whether the device is listed, or running, or was listed an hour ago
/// has no bearing on whether it is ours, and asking would only tempt the code
/// into stopping something that merely looked right.
#[tauri::command]
pub fn stop_device(
    tab_id: String,
    platform: DevicePlatform,
    device_id: String,
    ownership: tauri::State<'_, DeviceOwnership>,
) -> StopOutcome {
    warm_login_shell_path();
    stop_with(&ownership, &tab_id, platform, &device_id, perform_stop)
}

/// What this app claims right now. The device tab offers Stop for exactly these
/// and shows every other discovered device without one.
#[tauri::command]
pub fn owned_devices(ownership: tauri::State<'_, DeviceOwnership>) -> Vec<OwnedDevice> {
    ownership.owned()
}

/// Gives up claims without stopping anything: one tab's when `tab_id` is given,
/// all of them on the way out of the app. The devices stay up — DESIGN-SPEC.md
/// ties a device to the tab that ran it but never asks for it to be taken down
/// when that tab closes, and killing a user's simulator because a window closed
/// is not a decision this app gets to make.
///
/// Returns what was released so the caller can say so plainly, rather than the
/// claims disappearing silently.
#[tauri::command]
pub fn release_device_ownership(
    tab_id: Option<String>,
    ownership: tauri::State<'_, DeviceOwnership>,
) -> Vec<OwnedDevice> {
    ownership.release(tab_id.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;

    const RUNTIMES: &str = "\
== Runtimes ==
iOS 17.5 (17.5 - 21F79) - com.apple.CoreSimulator.SimRuntime.iOS-17-5
iOS 18.0 (18.0 - 22A3351) - com.apple.CoreSimulator.SimRuntime.iOS-18-0
tvOS 18.0 (18.0 - 22J357) - com.apple.CoreSimulator.SimRuntime.tvOS-18-0
watchOS 11.0 (11.0 - 22R5338b) - com.apple.CoreSimulator.SimRuntime.watchOS-11-0
";

    #[test]
    fn only_ios_runtimes_count_as_ios_runtimes() {
        assert_eq!(
            ios_runtime_names(RUNTIMES),
            ["iOS 17.5 (17.5 - 21F79)", "iOS 18.0 (18.0 - 22A3351)"]
        );
    }

    #[test]
    fn a_paired_watch_is_not_an_iphone_simulator() {
        let listing = "\
== Devices ==
-- iOS 18.0 --
    iPhone 16 (1A2B3C4D-1111-2222-3333-444455556666) (Shutdown)
-- watchOS 11.0 --
    Apple Watch Series 10 (9F8E7D6C-9999-8888-7777-666655554444) (Shutdown)
-- tvOS 18.0 --
    Apple TV (5555AAAA-1234-5678-9ABC-DEF012345678) (Booted)
";
        let found = ios_device_entries(listing);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].name, "iPhone 16");
        assert_eq!(found[0].run_state.as_deref(), Some("Shutdown"));
    }

    #[test]
    fn a_runtime_with_no_device_lists_nothing() {
        let listing = "== Devices ==\n-- iOS 18.0 --\n";
        assert!(ios_device_entries(listing).is_empty());
    }

    #[test]
    fn emulator_log_lines_are_not_devices() {
        let listing = "\
INFO    | Storing crashdata in: /tmp/avd/emu-crash.db
Pixel_8_API_35
INFO    | Duplicate loglines are suppressed
Pixel_Tablet_API_34
";
        assert_eq!(
            avd_names(listing),
            ["Pixel_8_API_35", "Pixel_Tablet_API_34"]
        );
    }

    #[test]
    fn tools_without_a_device_is_not_tools_missing() {
        let tools = DeviceFact::present("/Applications/Xcode.app/Contents/Developer");
        let runtime = DeviceFact::present("iOS 18.0");
        let devices = DeviceFact::absent_at("x", "no iOS simulator device exists", "create one");
        assert_eq!(
            readiness_of(true, &tools, &runtime, &devices),
            DeviceReadiness::RuntimeOrDeviceMissing
        );
    }

    #[test]
    fn no_tools_at_all_never_blames_the_runtime() {
        let r = blocked(
            DevicePlatform::Ios,
            true,
            DeviceFact::absent("only the Command Line Tools are installed", "install Xcode"),
            "full Xcode is not installed",
        );
        assert_eq!(r.readiness, DeviceReadiness::DependencyMissing);
        // The two later facts carry no repair, so no screen can print a
        // download-a-runtime step at a machine that has no Xcode.
        assert_eq!(r.runtime.state, FactState::Unknown);
        assert_eq!(r.devices.state, FactState::Unknown);
        assert!(r.runtime.fix.is_none() && r.devices.fix.is_none());
    }

    #[test]
    fn an_unsupported_platform_is_not_a_missing_dependency() {
        let r = blocked(
            DevicePlatform::Ios,
            false,
            DeviceFact::unknown("not probed"),
            "iOS simulators exist only on macOS",
        );
        assert_eq!(r.readiness, DeviceReadiness::NotEnabled);
        assert!(!r.platform_supported);
        assert!(r.tools.fix.is_none());
    }

    #[test]
    fn a_failed_probe_never_fills_the_device_list() {
        let r = report(
            DevicePlatform::Android,
            true,
            DeviceFact::present("sdk"),
            DeviceFact::present("android-35/google_apis/arm64-v8a"),
            DeviceFact::unknown("the emulator would not list AVDs"),
            vec![DeviceEntry {
                id: "Pixel_8_API_35".into(),
                name: "Pixel_8_API_35".into(),
                run_state: None,
            }],
        );
        assert!(r.found.is_empty());
        assert_eq!(r.readiness, DeviceReadiness::RuntimeOrDeviceMissing);
    }

    #[test]
    fn everything_present_is_the_only_available() {
        let r = report(
            DevicePlatform::Android,
            true,
            DeviceFact::present("sdk"),
            DeviceFact::present("android-35/google_apis/arm64-v8a"),
            DeviceFact::present("1 AVD(s)"),
            vec![DeviceEntry {
                id: "Pixel_8_API_35".into(),
                name: "Pixel_8_API_35".into(),
                run_state: None,
            }],
        );
        assert_eq!(r.readiness, DeviceReadiness::Available);
        assert_eq!(r.found.len(), 1);
        // The device screen may offer a separate window and must not claim a
        // live viewport it cannot draw.
        assert!(!r.embedded_preview);
    }

    // -----------------------------------------------------------------------
    // Ownership
    //
    // Every test below runs against a registry built in memory. Nothing here
    // boots a simulator or spawns an emulator: `launch_with` and `stop_with`
    // take the action as a parameter, so the decision path and the bookkeeping
    // are exercised while the action is a closure that either records that it
    // was called or asserts that it never should have been. Booting a real
    // device would take minutes, seize the machine and prove less — a test
    // cannot assert "this app owns it" against a simulator it shares with
    // whatever the developer already had open.
    // -----------------------------------------------------------------------

    const TAB: &str = "tab-1";
    const OTHER_TAB: &str = "tab-2";
    const UDID: &str = "1A2B3C4D-1111-2222-3333-444455556666";

    /// An iOS platform with one shut-down iPhone, i.e. everything a launch
    /// needs. `run_state` is what varies between the cases below.
    fn available_ios(run_state: Option<&str>) -> DeviceReport {
        report(
            DevicePlatform::Ios,
            true,
            DeviceFact::present("/Applications/Xcode.app/Contents/Developer"),
            DeviceFact::present("iOS 18.0"),
            DeviceFact::present("1 simulator(s)"),
            vec![DeviceEntry {
                id: UDID.into(),
                name: "iPhone 16".into(),
                run_state: run_state.map(str::to_string),
            }],
        )
    }

    /// A start that touches nothing and reports a confirmed boot.
    fn fake_start(entry: &DeviceEntry) -> Result<StartResult, String> {
        assert!(
            !entry.id.is_empty(),
            "a start is only ever asked for a discovered device"
        );
        Ok(StartResult {
            handle: OwnedHandle::BootedSimulator,
            confirmed: true,
            note: None,
        })
    }

    fn never_starts(_: &DeviceEntry) -> Result<StartResult, String> {
        panic!("a refusal must not reach the start")
    }

    fn never_stops(_: &mut OwnedHandle, _: &OwnedDevice) -> Result<(), String> {
        panic!("a refusal must not reach the stop")
    }

    #[test]
    fn launch_claims_the_device_for_the_tab_that_asked() {
        let reg = DeviceOwnership::default();
        let out = launch_with(
            &reg,
            TAB,
            &available_ios(Some("Shutdown")),
            UDID,
            fake_start,
        );

        assert_eq!(out.status, LaunchStatus::Launched);
        let owned = out.owned.expect("a launch publishes its claim");
        assert_eq!(owned.tab_id, TAB);
        assert_eq!(owned.device_id, UDID);
        assert!(owned.start_confirmed);
        assert_eq!(reg.owned().len(), 1);
    }

    #[test]
    fn a_simulator_the_user_booted_outside_the_app_is_listed_but_never_owned() {
        let reg = DeviceOwnership::default();
        // Discovery lists it exactly as it lists ours, Booted and all.
        let out = launch_with(
            &reg,
            TAB,
            &available_ios(Some("Booted")),
            UDID,
            never_starts,
        );

        assert_eq!(out.status, LaunchStatus::RunningOutsideApp);
        assert!(out.owned.is_none());
        // Nothing was claimed by looking at it.
        assert!(reg.owned().is_empty());

        // And so stop refuses it, which is the whole rule: being up is not
        // being ours.
        let stop = stop_with(&reg, TAB, DevicePlatform::Ios, UDID, never_stops);
        assert_eq!(stop.status, StopStatus::NotOwnedByApp);
        assert!(stop.problem.is_some());
    }

    #[test]
    fn stop_refuses_every_device_this_app_did_not_start() {
        let reg = DeviceOwnership::default();
        // An id that is real on the machine, a plausible AVD name, and an id
        // from the other platform's namespace: none of them is a claim.
        for (platform, id) in [
            (DevicePlatform::Ios, UDID),
            (DevicePlatform::Android, "Pixel_8_API_35"),
            (DevicePlatform::Android, UDID),
        ] {
            let out = stop_with(&reg, TAB, platform, id, never_stops);
            assert_eq!(out.status, StopStatus::NotOwnedByApp);
        }
    }

    #[test]
    fn a_claim_on_one_platform_is_not_a_claim_on_the_other() {
        let reg = DeviceOwnership::default();
        let android = report(
            DevicePlatform::Android,
            true,
            DeviceFact::present("sdk"),
            DeviceFact::present("android-35/google_apis/arm64-v8a"),
            DeviceFact::present("1 AVD(s)"),
            vec![DeviceEntry {
                id: "Pixel_8_API_35".into(),
                name: "Pixel_8_API_35".into(),
                run_state: None,
            }],
        );
        launch_with(&reg, TAB, &android, "Pixel_8_API_35", fake_start);

        // Same string, iOS key: not owned, so not stoppable.
        let out = stop_with(
            &reg,
            TAB,
            DevicePlatform::Ios,
            "Pixel_8_API_35",
            never_stops,
        );
        assert_eq!(out.status, StopStatus::NotOwnedByApp);
        assert_eq!(reg.owned().len(), 1);
    }

    #[test]
    fn only_the_owning_tab_can_relaunch_or_stop_it() {
        let reg = DeviceOwnership::default();
        launch_with(
            &reg,
            TAB,
            &available_ios(Some("Shutdown")),
            UDID,
            fake_start,
        );

        let relaunch = launch_with(
            &reg,
            OTHER_TAB,
            &available_ios(Some("Booted")),
            UDID,
            never_starts,
        );
        assert_eq!(relaunch.status, LaunchStatus::OwnedByAnotherTab);
        // The owner is named, so the other tab's UI can say where Stop lives.
        assert_eq!(relaunch.owned.map(|o| o.tab_id).as_deref(), Some(TAB));

        let stop = stop_with(&reg, OTHER_TAB, DevicePlatform::Ios, UDID, never_stops);
        assert_eq!(stop.status, StopStatus::OwnedByAnotherTab);
        // Still owned by the tab that started it.
        assert_eq!(reg.owned().len(), 1);
    }

    #[test]
    fn the_owning_tab_launching_again_does_not_start_a_second_device() {
        let reg = DeviceOwnership::default();
        launch_with(
            &reg,
            TAB,
            &available_ios(Some("Shutdown")),
            UDID,
            fake_start,
        );

        // Discovery now says Booted — which is our own boot, not a stranger's,
        // and the claim is what tells the two apart.
        let again = launch_with(
            &reg,
            TAB,
            &available_ios(Some("Booted")),
            UDID,
            never_starts,
        );
        assert_eq!(again.status, LaunchStatus::AlreadyOwnedHere);
        assert_eq!(reg.owned().len(), 1);
    }

    #[test]
    fn prerequisites_that_say_no_refuse_in_the_facts_own_words() {
        let reg = DeviceOwnership::default();

        let no_xcode = blocked(
            DevicePlatform::Ios,
            true,
            DeviceFact::absent(
                "only the Command Line Tools are installed",
                "install Xcode from the App Store",
            ),
            "full Xcode is not installed",
        );
        let out = launch_with(&reg, TAB, &no_xcode, UDID, never_starts);
        assert_eq!(out.status, LaunchStatus::PrerequisitesMissing);
        assert_eq!(out.readiness, DeviceReadiness::DependencyMissing);
        assert_eq!(out.fix.as_deref(), Some("install Xcode from the App Store"));

        let no_device = report(
            DevicePlatform::Ios,
            true,
            DeviceFact::present("/Applications/Xcode.app/Contents/Developer"),
            DeviceFact::present("iOS 18.0"),
            DeviceFact::absent_at("x", "no iOS simulator device exists", "create one in Xcode"),
            Vec::new(),
        );
        let out = launch_with(&reg, TAB, &no_device, UDID, never_starts);
        assert_eq!(out.status, LaunchStatus::PrerequisitesMissing);
        assert_eq!(out.readiness, DeviceReadiness::RuntimeOrDeviceMissing);
        assert_eq!(out.fix.as_deref(), Some("create one in Xcode"));

        // An unsupported platform publishes no repair, and the refusal must not
        // invent one.
        let not_macos = blocked(
            DevicePlatform::Ios,
            false,
            DeviceFact::unknown("not probed: iOS simulators exist only on macOS"),
            "iOS simulators exist only on macOS",
        );
        let out = launch_with(&reg, TAB, &not_macos, UDID, never_starts);
        assert_eq!(out.status, LaunchStatus::PrerequisitesMissing);
        assert_eq!(out.readiness, DeviceReadiness::NotEnabled);
        assert!(out.fix.is_none());

        assert!(reg.owned().is_empty());
    }

    #[test]
    fn an_id_discovery_never_listed_is_never_handed_to_a_tool() {
        let reg = DeviceOwnership::default();
        let out = launch_with(
            &reg,
            TAB,
            &available_ios(Some("Shutdown")),
            "not-a-device; rm -rf /",
            never_starts,
        );
        assert_eq!(out.status, LaunchStatus::NotADiscoveredDevice);
        assert!(reg.owned().is_empty());
    }

    #[test]
    fn a_start_that_was_refused_leaves_no_claim_behind() {
        let reg = DeviceOwnership::default();
        let out = launch_with(&reg, TAB, &available_ios(Some("Shutdown")), UDID, |_| {
            Err("simctl would not boot iPhone 16".into())
        });

        assert_eq!(out.status, LaunchStatus::CouldNotStart);
        assert!(out.owned.is_none());
        assert!(reg.owned().is_empty(), "a refused boot must not be claimed");
    }

    #[test]
    fn a_start_that_did_not_confirm_is_still_owned_so_it_cannot_orphan() {
        let reg = DeviceOwnership::default();
        let out = launch_with(&reg, TAB, &available_ios(Some("Shutdown")), UDID, |_| {
            Ok(StartResult {
                handle: OwnedHandle::BootedSimulator,
                confirmed: false,
                note: Some("boot was issued but did not confirm: timed out".into()),
            })
        });

        assert_eq!(out.status, LaunchStatus::Launched);
        let owned = out.owned.expect("an unconfirmed start is still a claim");
        // The uncertainty is published rather than hidden...
        assert!(!owned.start_confirmed);
        assert!(owned.note.is_some());
        // ...and the device remains stoppable, which is the point.
        assert_eq!(reg.owned().len(), 1);
    }

    #[test]
    fn a_stop_that_did_not_confirm_keeps_the_claim() {
        let reg = DeviceOwnership::default();
        launch_with(
            &reg,
            TAB,
            &available_ios(Some("Shutdown")),
            UDID,
            fake_start,
        );

        let out = stop_with(&reg, TAB, DevicePlatform::Ios, UDID, |_, _| {
            Err("xcrun did not answer within 1s".into())
        });
        assert_eq!(out.status, StopStatus::DidNotConfirm);
        assert_eq!(out.owned.map(|o| o.tab_id).as_deref(), Some(TAB));
        // Dropping the claim here would leave a booted simulator nobody holds.
        assert_eq!(reg.owned().len(), 1);

        // Trying again, successfully, ends it.
        let out = stop_with(&reg, TAB, DevicePlatform::Ios, UDID, |_, _| Ok(()));
        assert_eq!(out.status, StopStatus::Stopped);
        assert!(reg.owned().is_empty());
    }

    #[test]
    fn a_stop_acts_on_the_claimed_id_and_no_other() {
        let reg = DeviceOwnership::default();
        launch_with(
            &reg,
            TAB,
            &available_ios(Some("Shutdown")),
            UDID,
            fake_start,
        );

        let mut acted_on = String::new();
        let out = stop_with(&reg, TAB, DevicePlatform::Ios, UDID, |_, record| {
            acted_on = record.device_id.clone();
            Ok(())
        });
        assert_eq!(out.status, StopStatus::Stopped);
        assert_eq!(acted_on, UDID);
    }

    #[test]
    fn quitting_the_app_ends_ownership_without_stopping_the_device() {
        let reg = DeviceOwnership::default();
        launch_with(
            &reg,
            TAB,
            &available_ios(Some("Shutdown")),
            UDID,
            fake_start,
        );

        // `release` takes no action parameter at all: there is no code path
        // through it that could stop a device, which is how the promise is kept
        // rather than remembered.
        let released = reg.release(None);
        assert_eq!(released.len(), 1);
        assert_eq!(released[0].device_id, UDID);
        assert!(reg.owned().is_empty());

        // After the claim is gone the device is a stranger's again — the same
        // state a simulator the user booted themselves has always been in.
        let out = stop_with(&reg, TAB, DevicePlatform::Ios, UDID, never_stops);
        assert_eq!(out.status, StopStatus::NotOwnedByApp);
    }

    #[test]
    fn releasing_one_tab_leaves_another_tabs_device_owned() {
        let reg = DeviceOwnership::default();
        launch_with(
            &reg,
            TAB,
            &available_ios(Some("Shutdown")),
            UDID,
            fake_start,
        );

        let second = "9F8E7D6C-9999-8888-7777-666655554444";
        let mut other = available_ios(Some("Shutdown"));
        other.found[0].id = second.into();
        other.found[0].name = "iPhone 16 Pro".into();
        launch_with(&reg, OTHER_TAB, &other, second, fake_start);

        let released = reg.release(Some(TAB));
        assert_eq!(released.len(), 1);
        assert_eq!(released[0].device_id, UDID);

        let left = reg.owned();
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].tab_id, OTHER_TAB);
    }

    #[test]
    fn a_launch_promises_a_separate_window_and_not_a_viewport() {
        let reg = DeviceOwnership::default();
        let out = launch_with(
            &reg,
            TAB,
            &available_ios(Some("Shutdown")),
            UDID,
            fake_start,
        );
        assert!(!out.embedded_preview);
        assert_eq!(out.embedded_preview, EMBEDDED_PREVIEW_SUPPORTED);
        assert_eq!(out.window_note, "Opens in a separate window");
    }

    /// An Android platform with one AVD, i.e. everything a launch needs. The
    /// Android half is what holds a real child process, which is what the quit
    /// path below is about.
    fn available_android() -> DeviceReport {
        report(
            DevicePlatform::Android,
            true,
            DeviceFact::present("sdk"),
            DeviceFact::present("android-35/google_apis/arm64-v8a"),
            DeviceFact::present("1 AVD(s)"),
            vec![DeviceEntry {
                id: "Pixel_8_API_35".into(),
                name: "Pixel_8_API_35".into(),
                run_state: None,
            }],
        )
    }

    /// Opening the device tab runs discovery and nothing else. The thing that
    /// must not happen is a 4 GB download or a boot started by a user who only
    /// looked at the screen (the rule stated at the top of this file), so this
    /// drives the real discovery pass — it is the only read-only path here.
    ///
    /// Every stop below is handed `never_stops`, which panics if it is reached.
    /// If discovery had claimed anything, the refusal would not happen and the
    /// panicking closure would run. That is the deterministic half, and it is
    /// where the weight of this test sits.
    ///
    /// What this test deliberately does NOT assert: that two discovery passes
    /// agree. They legitimately disagree on a cold machine — `probe_command`
    /// has a one-second budget, and a probe that times out on one pass and
    /// answers on the other changes `readiness`, changes which facts are
    /// `Unknown`, and empties or fills `found`. None of that is a boot or a
    /// download, so none of it may fail this test; an earlier draft compared
    /// `readiness` and `run_state` for equality across passes and was flaky
    /// for exactly that reason. The cross-pass check that remains is
    /// one-directional, because a device going from not-running to running is
    /// the only cross-pass difference a boot could produce.
    #[test]
    fn opening_a_device_tab_discovers_without_booting_or_claiming_anything() {
        let reg = DeviceOwnership::default();

        let first = discover_devices();
        assert_eq!(first.platforms.len(), 2);
        assert_eq!(first.platforms[0].platform, DevicePlatform::Ios);
        assert_eq!(first.platforms[1].platform, DevicePlatform::Android);

        // Discovery is not given the ownership registry at all — it takes no
        // such parameter — so nothing it found can have been claimed.
        assert!(
            reg.owned().is_empty(),
            "looking at the device screen claims nothing"
        );

        for p in &first.platforms {
            // And no report promises a viewport this build cannot draw.
            assert!(!p.embedded_preview);

            // Properties of the report, not values a probe's timing decides.
            // Whatever the probes managed to answer, the summary is derived
            // from the four published facts and nothing else...
            assert_eq!(
                p.readiness,
                readiness_of(p.platform_supported, &p.tools, &p.runtime, &p.devices),
                "the summary must stay derived from the facts it publishes"
            );
            // ...and a list of devices is only ever published alongside a
            // device fact that was actually established. This is the real
            // discovery output held to the rule `a_failed_probe_never_fills_
            // the_device_list` checks over a constructed report: a timed-out
            // probe must leave the selector empty rather than optimistic.
            assert!(
                p.devices.is_present() || p.found.is_empty(),
                "an unestablished device fact must publish no devices"
            );

            // Whatever was listed belongs to whoever started it. Stop refuses
            // each one, so the closure that would act never runs.
            for d in &p.found {
                let out = stop_with(&reg, TAB, p.platform, &d.id, never_stops);
                assert_eq!(
                    out.status,
                    StopStatus::NotOwnedByApp,
                    "{} was listed, which is not the same as being ours",
                    d.name
                );
            }
        }

        // The one cross-pass difference a boot could produce: a device that was
        // not running when the tab opened and is running now. Everything else
        // two passes can disagree about is probe timing — see the note above —
        // so nothing else is compared.
        let second = discover_devices();
        for (before, after) in first.platforms.iter().zip(second.platforms.iter()) {
            assert_eq!(before.platform, after.platform, "the order is fixed");
            for d in &before.found {
                // Only devices both passes saw: a probe that timed out in one
                // pass is a reporting difference, not a change to the machine.
                let Some(again) = after.found.iter().find(|e| e.id == d.id) else {
                    continue;
                };
                if !looks_already_running(d.run_state.as_deref()) {
                    assert!(
                        !looks_already_running(again.run_state.as_deref()),
                        "{} was not running when the device tab opened and is running now. \
                         Discovery must not boot what it lists. (The one other way to \
                         reach this line is to have booted {} by hand in the second this \
                         test took to run — check that before changing anything.)",
                        d.name,
                        d.name
                    );
                }
            }
        }
    }

    /// The claim above is about what discovery does; this one is about what it
    /// could possibly do. The discovery half of this file is checked for the
    /// commands that start a device or fetch one, because the guarantee in the
    /// header — "DISCOVERY probes nothing into existence" — is a property of
    /// the code and not of one run of it. A machine with no Xcode and no SDK
    /// would pass the behavioural test above by never getting far enough to
    /// break anything.
    ///
    /// Comment lines are dropped first: the header comment names these very
    /// actions in order to forbid them, and the fix strings that remain are
    /// advice for the user ("install Xcode from the App Store"), not commands
    /// this code runs.
    #[test]
    fn the_discovery_half_of_this_file_names_no_boot_download_or_licence_command() {
        let src = include_str!("devices.rs");
        let (discovery, _) = src
            .split_once("// Ownership")
            .expect("the file is split into a discovery half and an ownership half");
        let code: String = discovery
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");

        for forbidden in [
            "boot",             // xcrun simctl boot
            "\"-avd\"",         // the emulator's launch flag
            "Command::new",     // any spawn at all, timed or detached
            "sdkmanager",       // the runtime and system-image downloader
            "avdmanager",       // device creation
            "licen",            // licence acceptance, either spelling
            "downloadPlatform", // xcodebuild's runtime fetch
        ] {
            assert!(
                !code.contains(forbidden),
                "discovery must not be able to start or fetch anything, but it names `{forbidden}`"
            );
        }
    }

    /// The quit path, against the one handle that is a live process.
    ///
    /// `release` is the only thing that runs when a tab closes or the app
    /// quits, and it takes no action parameter — there is no argument through
    /// which a caller could pass something that stops a device, which is the
    /// structural half of the promise. The other half is that dropping the
    /// handle it removes does not kill the child either (`Child`'s drop is
    /// documented not to, which is what `take` relies on), and that is a
    /// runtime fact worth checking rather than remembering.
    ///
    /// A `sleep` stands in for the emulator. The promise under test is about
    /// `Child`, not about anything the emulator does, and booting a real one
    /// would take minutes and seize the machine to prove the same thing.
    #[cfg(unix)]
    #[test]
    fn releasing_a_claim_on_the_way_out_leaves_the_owned_process_running() {
        /// Read from the process table, and NOT with `kill -0`.
        ///
        /// Nothing reaps the handle that `release` drops — that is the whole
        /// design — so a process this test's own assertion had killed would
        /// still be a zombie holding its pid, and `kill -0` answers yes for a
        /// zombie. Measured on this machine: an unreaped killed child reports
        /// state `Z` while `kill -0` still exits 0, so a liveness check built
        /// on the signal could not fail and would have proved nothing. The
        /// state letter is the only reading that separates the two.
        fn is_alive(pid: u32) -> bool {
            let out = Command::new("/bin/ps")
                .args(["-p", &pid.to_string(), "-o", "state="])
                .stderr(Stdio::null())
                .output();
            match out {
                Ok(o) if o.status.success() => {
                    let state = String::from_utf8_lossy(&o.stdout).trim().to_string();
                    !state.is_empty() && !state.starts_with('Z')
                }
                _ => false,
            }
        }

        let child = Command::new("/bin/sleep")
            .arg("30")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("/bin/sleep exists on every unix this app builds for");
        let pid = child.id();
        assert!(is_alive(pid), "the stand-in process must start");

        let reg = DeviceOwnership::default();
        let out = launch_with(
            &reg,
            TAB,
            &available_android(),
            "Pixel_8_API_35",
            move |_| {
                Ok(StartResult {
                    handle: OwnedHandle::EmulatorProcess(child),
                    confirmed: true,
                    note: None,
                })
            },
        );
        assert_eq!(out.status, LaunchStatus::Launched);
        assert_eq!(
            out.owned.as_ref().map(|o| o.stop_action),
            Some("terminate the emulator process this app spawned"),
            "the claim must know it is holding a process"
        );

        // The app quits: every claim is given up at once.
        let released = reg.release(None);
        assert_eq!(released.len(), 1);
        assert_eq!(released[0].device_id, "Pixel_8_API_35");
        assert!(reg.owned().is_empty());

        // The claim is gone and the process is not. A user who started a device
        // through this app and then closed the app still has their device.
        assert!(
            is_alive(pid),
            "quitting must end ownership and leave the device running"
        );

        // Not part of the assertion — the stand-in is this test's litter.
        let _ = Command::new("/bin/kill")
            .args(["-9", &pid.to_string()])
            .status();
    }

    #[test]
    fn android_has_no_run_state_to_read_so_only_the_claim_decides() {
        // `emulator -list-avds` cannot say what is running, so the honest
        // answer for an unclaimed AVD is to start one — never to report it as
        // running outside the app on a guess.
        assert!(!looks_already_running(None));
        assert!(looks_already_running(Some("Booted")));
        assert!(looks_already_running(Some("Booting")));
        assert!(!looks_already_running(Some("Shutdown")));
    }
}

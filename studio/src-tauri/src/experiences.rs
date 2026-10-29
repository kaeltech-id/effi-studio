use crate::projects::{load, save};
use serde::{Deserialize, Serialize};

/// Availability is compiled in, not configurable from the UI: Verify is not a
/// feature flag a user can flip, it is an unreleased experience.
const VERIFY_REASON: &str = "Not available to install yet.";

#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ExperienceId {
    Build,
    Verify,
}

#[derive(Serialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Availability {
    Available,
    ComingSoon,
}

/// The whole of the persisted experience state, and deliberately only Build:
/// with no `verify_enabled` field to deserialise into, a hand-edited
/// studio.json has nowhere to say Verify is on.
///
/// camelCase while the parent StudioConfig is snake_case — the same deliberate
/// split PanelState carries, and for the same reason (projects.rs:54-58): this
/// struct crosses to the frontend, where the wire convention is camelCase,
/// while renaming the parent would stop it reading an older studio.json.
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ExperienceState {
    pub build_enabled: bool,
}

/// A view model rather than the stored shape, for the reason ProjectView
/// exists (projects.rs:12-15): availability and Verify's reason are facts about
/// this release, so they are recomputed on every read. Written to disk they
/// would be read back by a later build that had shipped Verify, and an old file
/// would then outrank the running code about what exists.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExperienceView {
    pub id: ExperienceId,
    pub availability: Availability,
    pub enabled: bool,
    pub reason: Option<String>,
}

#[tauri::command]
pub fn experiences() -> Vec<ExperienceView> {
    let state = load().experiences;
    vec![
        ExperienceView {
            id: ExperienceId::Build,
            availability: Availability::Available,
            enabled: state.build_enabled,
            // Nothing to explain: the control is live.
            reason: None,
        },
        // Literal, not read from `state`: Verify reports disabled whatever is
        // on disk, so there is no file to edit to make it look installed.
        ExperienceView {
            id: ExperienceId::Verify,
            availability: Availability::ComingSoon,
            enabled: false,
            reason: Some(VERIFY_REASON.to_string()),
        },
    ]
}

/// Only Build can be enabled, and the signature is what enforces it: there is
/// no experience id to pass, so a caller has no way to name Verify and no
/// request to enable it can ever reach storage.
#[tauri::command]
pub fn set_experiences(build_enabled: bool) -> Result<(), String> {
    let mut cfg = load();
    cfg.experiences = ExperienceState { build_enabled };
    save(&cfg)
}

"""Guards for the macOS release path.

The README download link is a bare URL and the workflow uploads by glob, so
nothing in the build fails if a filename drifts — the link simply 404s for
every visitor. These tests tie the link, the build script, the workflow and the
version sources to one another. They read only tracked files, never build
output, so they pass on a cold checkout.
"""

import json
import os
import re

STABLE_ASSET = 'EffiStudio-macOS.dmg'
DOWNLOAD_URL = (
    'https://github.com/kaeltech-id/effi-studio/releases/latest/download/'
    + STABLE_ASSET)
DIST_DIR = 'studio/src-tauri/target/release/bundle/dist'
SCRIPT = ('studio', 'scripts', 'build-macos-dmg.sh')
WORKFLOW = ('.github', 'workflows', 'release-macos.yml')


def _repo(*parts):
    return os.path.join(os.path.dirname(__file__), '..', *parts)


def _read(*parts):
    with open(_repo(*parts), encoding='utf-8', errors='replace') as fh:
        return fh.read()


class TestDownloadLinkMatchesBuiltAsset:
    """A rename in any one of these three files breaks the download for
    everyone and fails nothing. These guards are the only thing holding the
    name steady across the link, the script and the upload."""

    def test_readme_links_the_stable_asset(self):
        assert DOWNLOAD_URL in _read('README.md')

    def test_script_produces_that_exact_name(self):
        assert f'STABLE_NAME="{STABLE_ASSET}"' in _read(*SCRIPT)

    def test_workflow_uploads_that_exact_name(self):
        assert STABLE_ASSET in _read(*WORKFLOW)

    def test_workflow_uploads_from_the_scripts_dist_dir(self):
        """The script writes to DIST_DIR and the workflow uploads from a
        hardcoded path. Nothing but this test connects the two."""
        assert f'DIST_DIR="$STUDIO_DIR/src-tauri/target/release/bundle/dist"' \
            in _read(*SCRIPT)
        assert f'{DIST_DIR}/{STABLE_ASSET}' in _read(*WORKFLOW)

    def test_versioned_name_template_matches_the_upload_glob(self):
        """The versioned asset is built by string interpolation and uploaded by
        glob; a change to either side silently drops it from the release."""
        assert 'VERSIONED_NAME="EffiStudio-${VERSION}-macOS.dmg"' in _read(*SCRIPT)
        assert f'{DIST_DIR}/EffiStudio-*-macOS.dmg' in _read(*WORKFLOW)

    def test_workflow_calls_the_script_instead_of_rebuilding(self):
        assert 'studio/scripts/build-macos-dmg.sh' in _read(*WORKFLOW)


class TestScriptNeverTouchesGit:
    """CLAUDE.md makes git operations exclusive to /ec-git. The script prints a
    publish command for the operator to run; it must never run one itself."""

    ALLOWED = ('github.com', 'gh release create')

    def test_no_line_executes_git_or_gh(self):
        for n, line in enumerate(_read(*SCRIPT).splitlines(), 1):
            stripped = line.strip()
            if any(token in stripped for token in self.ALLOWED):
                continue
            assert not re.match(r'(git|gh)\s+\S', stripped), \
                f'{SCRIPT[-1]}:{n} executes: {stripped}'

    def test_the_publish_hint_is_still_printed(self):
        """The 'prints and stops' contract has two halves. Without this one,
        deleting the hint entirely would pass the test above."""
        assert 'gh release create' in _read(*SCRIPT)


class TestVersionSourcesAgree:
    """VERSION, tauri.conf.json and Cargo.toml all feed the DMG filename and
    the bundle's CFBundleShortVersionString. Drift between them ships an
    installer labelled with the wrong release.

    studio/package.json is deliberately excluded: Tauri reads the version from
    tauri.conf.json, so the npm workspace version never reaches the artifact.
    """

    def _version(self):
        return _read('VERSION').strip()

    def test_tauri_conf_matches_version_file(self):
        conf = json.loads(_read('studio', 'src-tauri', 'tauri.conf.json'))
        assert conf['version'] == self._version()

    def test_cargo_toml_matches_version_file(self):
        cargo = _read('studio', 'src-tauri', 'Cargo.toml')
        found = re.search(r'^version = "([^"]+)"', cargo, re.M)
        assert found and found.group(1) == self._version()

    def test_workflow_asserts_the_tag_matches_version(self):
        """Nothing else connects the pushed tag to VERSION: tag v2.1.0 with
        VERSION at 2.0.0 and the release carries a 2.0.0 installer."""
        assert 'GITHUB_REF_NAME' in _read(*WORKFLOW)


class TestBuildVerificationIsLoadBearing:
    """An earlier revision printed `lipo -archs` and the bundle version and
    then discarded both, so a DMG built from a stale bundle published cleanly.
    These guards keep the checks as assertions rather than as log lines."""

    def test_bundle_version_is_asserted_not_just_printed(self):
        script = _read(*SCRIPT)
        assert 'bundle reports $BUNDLE_VERSION, expected $VERSION' in script

    def test_universal_build_asserts_both_architectures(self):
        script = _read(*SCRIPT)
        assert 'universal build is missing $want' in script
        assert 'for want in x86_64 arm64' in script

    def test_host_only_fallback_is_opt_in(self):
        """A silent fallback publishes an Intel-incompatible DMG under a name
        the README advertises as universal."""
        assert 'ALLOW_HOST_FALLBACK' in _read(*SCRIPT)


class TestGatekeeperGuidanceIsHonest:
    """An ad-hoc signed, non-notarized DMG is refused by Gatekeeper, so the
    README has to document an override. It must name the per-app OS route
    first and state what the user gives up — `xattr -dr` disables Gatekeeper
    for the app permanently and recursively, and leaves Apple no way to revoke
    a malicious build."""

    def test_readme_documents_the_os_native_override(self):
        readme = _read('README.md')
        assert 'Open Anyway' in readme
        assert 'Privacy & Security' in readme

    def test_readme_states_the_consequence(self):
        readme = _read('README.md')
        assert 'belum dinotarisasi' in readme
        assert 'permanen dan rekursif' in readme

    def test_readme_documents_checksum_verification(self):
        assert 'shasum -a 256' in _read('README.md')

    def test_script_publishes_checksums(self):
        assert 'SHA256SUMS' in _read(*SCRIPT)
        assert 'SHA256SUMS' in _read(*WORKFLOW)


class TestWorkflowSupplyChain:
    """A release-writing workflow that compiles third-party code is the one
    place a moving action tag or a persisted token actually costs something."""

    def test_every_action_is_pinned_to_a_commit_sha(self):
        for n, line in enumerate(_read(*WORKFLOW).splitlines(), 1):
            m = re.search(r'uses:\s*(\S+)@(\S+)', line)
            if not m:
                continue
            assert re.fullmatch(r'[0-9a-f]{40}', m.group(2)), \
                f'release-macos.yml:{n} uses a mutable ref: {m.group(0)}'

    def test_checkout_does_not_persist_the_release_token(self):
        """persist-credentials writes a contents:write token into .git/config,
        readable by every later step — including `npm ci` and every build.rs."""
        assert 'persist-credentials: false' in _read(*WORKFLOW)

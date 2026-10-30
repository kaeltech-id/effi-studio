#!/usr/bin/env bash
# Builds the macOS DMG for Effi Studio and names it for a stable download URL.
# Never performs a git operation: it prints the publish command and stops.
# It does rewrite two tracked files in place — src-tauri/tauri.conf.json and
# src-tauri/Cargo.toml — so the bundle version always matches VERSION.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
STUDIO_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
REPO_ROOT=$(cd -- "$STUDIO_DIR/.." && pwd)
DIST_DIR="$STUDIO_DIR/src-tauri/target/release/bundle/dist"
STABLE_NAME="EffiStudio-macOS.dmg"
ALLOW_HOST_FALLBACK="${ALLOW_HOST_FALLBACK:-0}"

[ -f "$REPO_ROOT/VERSION" ] || { echo "error: $REPO_ROOT/VERSION not found" >&2; exit 1; }
VERSION=$(tr -d '[:space:]' < "$REPO_ROOT/VERSION")
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] \
    || { echo "error: VERSION is not a semver string: '$VERSION'" >&2; exit 1; }
echo "==> Effi Studio $VERSION — macOS DMG"

TAURI_CONF="$STUDIO_DIR/src-tauri/tauri.conf.json"
CARGO_TOML="$STUDIO_DIR/src-tauri/Cargo.toml"

python3 -I -c "import json,sys; json.load(open(sys.argv[1], encoding='utf-8'))" "$TAURI_CONF"

echo "==> syncing version into tauri.conf.json and Cargo.toml"
VERSION="$VERSION" python3 -I - "$TAURI_CONF" <<'PY'
import json, os, sys
path = sys.argv[1]
with open(path, encoding="utf-8") as fh:
    conf = json.load(fh)
conf["version"] = os.environ["VERSION"]
with open(path, "w", encoding="utf-8") as fh:
    json.dump(conf, fh, indent=2, ensure_ascii=False)
    fh.write("\n")
PY

VERSION="$VERSION" python3 -I - "$CARGO_TOML" <<'PY'
import os, re, sys
path = sys.argv[1]
version = os.environ["VERSION"]
with open(path, encoding="utf-8") as fh:
    body = fh.read()
body, n = re.subn(r'^version = "[^"]*"$',
                  lambda _: 'version = "%s"' % version,
                  body, count=1, flags=re.M)
if n != 1:
    sys.exit("error: no [package] version line found in %s" % path)
with open(path, "w", encoding="utf-8") as fh:
    fh.write(body)
PY

grep -qxF "version = \"$VERSION\"" "$CARGO_TOML" \
    || { echo "error: Cargo.toml version not synced" >&2; exit 1; }

cd "$STUDIO_DIR"
BUILD_TARGET="universal-apple-darwin"
ARCH_LABEL="universal"
INSTALLED=$(rustup target list --installed 2>/dev/null || true)
case $'\n'"$INSTALLED"$'\n' in
    *$'\n'x86_64-apple-darwin$'\n'*) ;;
    *)
        echo "WARNING: x86_64-apple-darwin is not installed — building host-only." >&2
        echo "WARNING: the resulting DMG will NOT run on Intel Macs. Install it with:" >&2
        echo "WARNING:   rustup target add x86_64-apple-darwin" >&2
        BUILD_TARGET=""
        ARCH_LABEL=$(uname -m)
        ;;
esac

echo "==> building ($ARCH_LABEL)"
if [ -z "$BUILD_TARGET" ]; then
    npm run tauri -- build
elif ! npm run tauri -- build --target "$BUILD_TARGET"; then
    if [ "$ALLOW_HOST_FALLBACK" = "1" ]; then
        echo "WARNING: universal build failed — ALLOW_HOST_FALLBACK=1, building host-only." >&2
        BUILD_TARGET=""
        ARCH_LABEL=$(uname -m)
        npm run tauri -- build
    else
        echo "error: the universal build failed." >&2
        echo "error: $STABLE_NAME is advertised as running on Intel and Apple Silicon," >&2
        echo "error: so a host-only DMG is not published under that name." >&2
        echo "error: Re-run with ALLOW_HOST_FALLBACK=1 to build for $(uname -m) alone." >&2
        exit 1
    fi
fi

if [ -n "$BUILD_TARGET" ]; then
    BUNDLE_DIR="$STUDIO_DIR/src-tauri/target/$BUILD_TARGET/release/bundle/dmg"
else
    BUNDLE_DIR="$STUDIO_DIR/src-tauri/target/release/bundle/dmg"
fi
[ -d "$BUNDLE_DIR" ] || { echo "error: bundle directory not found: $BUNDLE_DIR" >&2; exit 1; }
BUILT_DMG=$(/bin/ls -t "$BUNDLE_DIR"/*.dmg 2>/dev/null | /usr/bin/sed -n 1p || true)
[ -n "$BUILT_DMG" ] || { echo "error: no .dmg produced under $BUNDLE_DIR" >&2; exit 1; }
case "$BUILT_DMG" in
    *"_${VERSION}_"*) ;;
    *) echo "error: newest dmg is not version $VERSION: $BUILT_DMG" >&2; exit 1 ;;
esac

VERSIONED_NAME="EffiStudio-${VERSION}-macOS.dmg"
mkdir -p "$DIST_DIR"
/bin/rm -f "$DIST_DIR"/EffiStudio-*.dmg "$DIST_DIR/SHA256SUMS"
cp "$BUILT_DMG" "$DIST_DIR/$STABLE_NAME"
cp "$BUILT_DMG" "$DIST_DIR/$VERSIONED_NAME"
echo "==> $DIST_DIR/$STABLE_NAME"
echo "==> $DIST_DIR/$VERSIONED_NAME"

echo "==> verifying $STABLE_NAME"
MOUNT_POINT=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/effi-dmg.XXXXXX")
cleanup() {
    /usr/bin/hdiutil detach "$MOUNT_POINT" -quiet 2>/dev/null \
        || /usr/bin/hdiutil detach "$MOUNT_POINT" -force -quiet 2>/dev/null \
        || true
    /bin/rmdir "$MOUNT_POINT" 2>/dev/null || true
}
trap cleanup EXIT INT TERM
/usr/bin/hdiutil attach "$DIST_DIR/$STABLE_NAME" \
    -nobrowse -readonly -noautoopen -mountpoint "$MOUNT_POINT" -quiet

APP="$MOUNT_POINT/Effi Studio.app"
[ -d "$APP" ] || { echo "error: 'Effi Studio.app' missing inside the DMG" >&2; exit 1; }
BIN=$(/usr/bin/find "$APP/Contents/MacOS" -maxdepth 1 -type f | /usr/bin/sed -n 1p)
[ -n "$BIN" ] || { echo "error: no executable in $APP/Contents/MacOS" >&2; exit 1; }

ARCHS=$(/usr/bin/lipo -archs "$BIN")
BUNDLE_VERSION=$(/usr/bin/defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString)
echo "    archs: $ARCHS"
echo "    bundle version: $BUNDLE_VERSION"

[ "$BUNDLE_VERSION" = "$VERSION" ] \
    || { echo "error: bundle reports $BUNDLE_VERSION, expected $VERSION" >&2; exit 1; }
if [ "$ARCH_LABEL" = "universal" ]; then
    for want in x86_64 arm64; do
        case " $ARCHS " in
            *" $want "*) ;;
            *) echo "error: universal build is missing $want (got: $ARCHS)" >&2; exit 1 ;;
        esac
    done
fi

cleanup || true
trap - EXIT INT TERM

( cd "$DIST_DIR" && /usr/bin/shasum -a 256 "$STABLE_NAME" "$VERSIONED_NAME" > SHA256SUMS )
SHA_STABLE=$(/usr/bin/shasum -a 256 "$DIST_DIR/$STABLE_NAME" | /usr/bin/cut -d' ' -f1)
echo "    sha256: $SHA_STABLE"

printf '%s\n' \
  "" \
  "==> done. To publish (this script never runs git or gh itself):" \
  "" \
  "  gh release create \"v$VERSION\" \\" \
  "    \"$DIST_DIR/$STABLE_NAME\" \\" \
  "    \"$DIST_DIR/$VERSIONED_NAME\" \\" \
  "    \"$DIST_DIR/SHA256SUMS\" \\" \
  "    --title \"Effi Studio v$VERSION\" \\" \
  "    --notes \"macOS DMG ($ARCH_LABEL). Requires macOS 11+. SHA256 $SHA_STABLE\"" \
  "" \
  "Once published, the README download link resolves to:" \
  "  https://github.com/kaeltech-id/effi-studio/releases/latest/download/$STABLE_NAME"

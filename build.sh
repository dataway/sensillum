#!/bin/bash

set -euo pipefail

APP_NAME="sensillum"
TARGET="x86_64-unknown-linux-musl"

# Pass --release as the first argument to build an optimised binary.
# Default is a debug build (fast compile, includes debug info).
if [[ "${1:-}" == "--release" ]]; then
    PROFILE="release"
    CARGO_FLAGS="--release"
else
    PROFILE="debug"
    CARGO_FLAGS=""
fi

echo "🕸️  Building $APP_NAME ($PROFILE) for $TARGET..."

# Warn if the target directory is on a network filesystem (NFS, CIFS, etc.).
# Follows symlinks so that a target/ -> /var/tmp/... symlink is correctly
# reported as local.
if [[ -e "target" ]]; then
    target_check=$(realpath "target")
else
    target_check=$(pwd)
fi
if command -v findmnt >/dev/null 2>&1; then
    fstype=$(findmnt -n -o FSTYPE --target "$target_check" 2>/dev/null || true)
else
    fstype=$(df -T "$target_check" 2>/dev/null | awk 'NR==2{print $2}' || true)
fi
case "$fstype" in
    nfs*|cifs|smbfs|afs)
        echo "   ⚠️  Warning: target/ resolves to a $fstype mount ($target_check)." >&2
        echo "   ⚠️  Consider symlinking target/ to a local path to speed up builds." >&2
        ;;
esac

# Ensure the musl target is installed.
if ! rustup target list --installed | grep -q "$TARGET"; then
    echo "   [+] Installing $TARGET target..."
    rustup target add "$TARGET"
fi

# Capture git metadata so build.rs uses these values rather than re-running
# the git CLI itself (matches how the Docker/CI build works).
export SENSILLUM_GIT_COMMIT
export SENSILLUM_GIT_TAG
export SENSILLUM_GIT_DIRTY
SENSILLUM_GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "")
SENSILLUM_GIT_TAG=$(git describe --tags --exact-match 2>/dev/null || echo "")
SENSILLUM_GIT_DIRTY=$(git status --porcelain 2>/dev/null | grep -q . && echo "true" || echo "false")

echo "   [+] Compiling (commit=${SENSILLUM_GIT_COMMIT:-unknown}, tag=${SENSILLUM_GIT_TAG:-none}, dirty=$SENSILLUM_GIT_DIRTY)..."
# shellcheck disable=SC2086
cargo build $CARGO_FLAGS --target "$TARGET"

SOURCE_PATH="target/$TARGET/$PROFILE/$APP_NAME"
cp "$SOURCE_PATH" "./$APP_NAME"

# Only strip release builds — stripping debug builds discards debug info.
if [[ "$PROFILE" == "release" ]] && command -v strip >/dev/null 2>&1; then
    echo "   [+] Stripping symbols..."
    strip "./$APP_NAME"
fi

echo "🕸️  Done. Binary: ./$APP_NAME ($(du -h "./$APP_NAME" | cut -f1))"
echo "Run with: ./$APP_NAME"

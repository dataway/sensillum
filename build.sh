#!/bin/bash

# Exit on error
set -e

APP_NAME="sensillum"
TARGET="x86_64-unknown-linux-musl"

echo "🕸️  Preparing $APP_NAME for build..."

# 1. Ensure the musl target is installed
if ! rustup target list --installed | grep -q "$TARGET"; then
    echo "   [+] Installing $TARGET target..."
    rustup target add $TARGET
fi

# 2. Build the optimized release binary
echo "   [+] Compiling optimized static binary..."
cargo build --release --target $TARGET

# 3. Move and Rename
# Cargo puts musl builds in target/<target>/release/
SOURCE_PATH="target/$TARGET/release/$APP_NAME"
if [ -f "$SOURCE_PATH" ]; then
    cp "$SOURCE_PATH" "./$APP_NAME"
    echo "   [+] Binary moved to current directory: ./$APP_NAME"
else
    # Handle cases where the package name differs from APP_NAME
    ACTUAL_BIN=$(ls target/$TARGET/release/ | grep -v "\.d$" | head -n 1)
    cp "target/$TARGET/release/$ACTUAL_BIN" "./$APP_NAME"
    echo "   [+] Binary moved and renamed to: ./$APP_NAME"
fi

# 4. Final Polish (Strip is handled by Cargo.toml, but we double-check)
if command -v strip >/dev/null 2>&1; then
    echo "   [+] stripping symbols..."
    strip "./$APP_NAME"
fi

echo "🕸️  Done. Binary size: $(du -h ./$APP_NAME | cut -f1)"
echo "Run with: ./$APP_NAME"

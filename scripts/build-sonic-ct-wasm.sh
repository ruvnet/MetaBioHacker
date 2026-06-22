#!/usr/bin/env bash
# Build the sonic_ct WebAssembly module and stage it for the React UI.
#
# No wasm-bindgen / wasm-pack required — the crate exports a raw C ABI, so we
# just compile to wasm32-unknown-unknown and copy the .wasm next to the UI.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WASM_CRATE="$ROOT/crates/sonic-ct-wasm"
UI_PUBLIC="$ROOT/examples/sonic-ct/public"
OUT="$WASM_CRATE/target/wasm32-unknown-unknown/release/sonic_ct_wasm.wasm"

echo "==> ensuring wasm32 target"
rustup target add wasm32-unknown-unknown >/dev/null 2>&1 || true

echo "==> building sonic-ct-wasm (release)"
( cd "$WASM_CRATE" && cargo build --release --target wasm32-unknown-unknown )

mkdir -p "$UI_PUBLIC"
cp "$OUT" "$UI_PUBLIC/sonic_ct.wasm"
SIZE=$(wc -c < "$UI_PUBLIC/sonic_ct.wasm")
echo "==> staged $UI_PUBLIC/sonic_ct.wasm ($SIZE bytes)"

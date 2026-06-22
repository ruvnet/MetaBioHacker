# ADR-0002: C ABI WebAssembly bindings

**Status:** Accepted  
**Date:** 2026-06

## Decision
WASM bindings use a hand-written C ABI (`extern "C"` functions) rather than `wasm-bindgen`.

## Rationale
- **Binary size:** 31 KB vs. ~1 MB with wasm-bindgen + serde
- **Zero-copy:** JavaScript reads flat F32/U8 buffers directly from WASM linear memory — no serialisation cost
- **Stability:** C ABI is stable across Rust versions; wasm-bindgen changes frequently
- **Auditability:** every exported symbol is explicit; no generated glue to audit

## Consequences
- JavaScript caller must manage buffer lifetime (valid until next `sct_run` call)
- No automatic TypeScript type generation; types documented manually in `docs/api/sonic-ct-wasm.md`
- No async support in the WASM layer (USCT reconstruction is synchronous)

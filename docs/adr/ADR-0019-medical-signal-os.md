# ADR-0019: Medical Signal Operating System architecture

**Status:** Accepted  
**Date:** 2026-06

## Decision
MetaBioHacker is a layered Medical Signal Operating System, not a diagnostic AI.

## Layers
1. **Inputs** — acoustic, imaging, labs, waveforms, pathology (typed observations with provenance)
2. **Core** — frozen physics engines + deterministic validators (the immutable truth layer)
3. **Learning layer** — harness evolution (policy, routing, confidence, explanation)
4. **Output** — uncertainty-aware patient state graph with full provenance and consent scope

## Analogy
Like an operating system: the kernel (physics engine) provides stable, auditable primitives. Applications (harness, UI, routing) evolve on top under explicit constraints. The kernel never changes at application request.

## Acceptance criteria
Multimodal context improves reconstruction confidence ≥10% OR stability ≥10% while preserving:
- Full provenance chain (observation → prior → score → ledger)
- Consent scope on every output
- Uncertainty overlay on every label
- Human-review path for any clinical-adjacent claim

## Consequences
- Regulatory boundary (ADR-0018) is architecturally enforced, not just policy
- The system can be safely extended to new modalities without touching the physics

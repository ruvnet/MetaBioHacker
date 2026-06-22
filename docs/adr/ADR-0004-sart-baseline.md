# ADR-0004: SART as reconstruction baseline

**Status:** Accepted  
**Date:** 2026-06

## Decision
SART (Simultaneous Algebraic Reconstruction Technique) is the default reconstruction method. One iteration equals delay-and-sum backprojection.

## Algorithm
```
For each ray i (source → receiver):
  residual  = (measured_time_i − predicted_time_i) / ray_length_i
  s_j      += relaxation × A_ij × residual   ∀ cells j on the ray
```

## Parameters
- `iters`: 8 (default) — more iterations → lower MAE, diminishing returns beyond 16
- `relaxation`: 0.9 — values above 1.5 cause instability, below 0.5 slow convergence
- `method = Backprojection` sets `iters = 1` (the classic baseline)

## Consequences
- Single-pass is always available as a fast sanity check
- Multi-pass converges toward least-squares solution
- Landweber is available for comparison (gradient-descent equivalent)
- FWI (ADR-0026) is the next level — handles diffraction/refraction that SART ignores

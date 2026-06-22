# ADR-0026: Full-Waveform Inversion roadmap

**Status:** Accepted (roadmap)  
**Date:** 2026-06

## Decision
Full-Waveform Inversion (FWI) is implemented and tested, but not the default reconstruction method. It is the documented path to sub-mm resolution and improved bone reconstruction.

## Why FWI
SART (straight-ray) ignores diffraction and refraction. Bone Dice ≈ 0 because the spine's acoustic shadow cannot be modelled with first-arrival travel times alone. FWI solves the full wave equation, which naturally handles these effects.

## Current implementation
- 2-D scalar acoustic wave equation (explicit FD, CFL-stable)
- Adjoint-state gradient (verified: cosine > 0.85 vs finite difference)
- Gradient descent with source/receiver footprint muting and backtracking
- Frequency continuation: low-frequency stages first (cycle-skip-robust), then higher
- Misfit reduction: ≥15% drop in CI test

## Roadmap
1. Tikhonov / Total Variation regularisation
2. Source encoding for faster multi-source forward solve
3. 3-D extension (fully 3-D wave equation, not slice-by-slice)
4. Integration with acoustic memory for warm-starting

## Default method stays SART
FWI is ~500 ms per source on small grids vs. ~130 ms total for SART. Until the speed gap closes, SART remains the default interactive reconstruction method.

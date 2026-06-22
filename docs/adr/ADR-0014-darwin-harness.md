# ADR-0014: Darwin multi-objective harness evolution

**Status:** Accepted  
**Date:** 2026-06

## Decision
The MetaBioHacker harness evolves via multi-objective Pareto-front selection (`@metaharness/darwin`). The frozen physics engine (`sonic_ct_serve`) serves as the objective function.

## Evolution loop
1. Harness writes JSON policy to `sonic_ct_serve` stdin
2. Engine returns `{score, routing}` on stdout
3. Darwin selects Pareto-optimal policies (stability × latency tradeoff)
4. Optional: LLM write layer (OpenRouter, env-key only) proposes harness mutations
5. Acceptance gate: `stability ≥ +10%` OR `latency ≥ −20%`, no regression in `acousticResidual`

## Invariant
The engine binary is never modified by the evolution loop. ADR-0003 (Frozen physics) takes precedence.

## Consequences
- Harness improvements can ship without touching physics tests
- Budget cap on LLM write layer prevents runaway costs
- Darwin genome is version-controlled alongside harness code

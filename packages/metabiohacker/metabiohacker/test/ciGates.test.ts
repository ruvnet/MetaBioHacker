// CI gates — the invariants that must never regress (ADR-0013/0017/0018/0022/0024).
// Each test is a named gate; CI fails if any is violated.
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreMultimodalRun } from "../src/fusion/scoring.ts";
import { buildReconstructionPrior } from "../src/fusion/priorBuilder.ts";
import { applyContradictionPenalty } from "../src/fusion/contradictionPenalty.ts";
import { gateEvidence } from "../src/evidence/evidenceGate.ts";
import { CachedEvidenceProvider } from "../src/evidence/cachedProvider.ts";
import { classifyRealSliceResult } from "../src/calibration/domainGapScoring.ts";
import { ACOUSTIC_BASELINE } from "./fixtures.ts";

const provider = new CachedEvidenceProvider();

test("GATE: acoustic residual is invariant to the contradiction penalty", () => {
  const base = scoreMultimodalRun({ acoustic: ACOUSTIC_BASELINE, prior: buildReconstructionPrior([]) });
  const penalized = applyContradictionPenalty({
    score: base,
    contradictions: [{ id: "c", severity: "high", message: "x", observationIds: [], requiresHumanReview: true }],
  });
  assert.equal(penalized.acousticResidual, base.acousticResidual);
});

test("GATE: pathology forces human review", async () => {
  const path = await provider.gradeModality("pathology");
  assert.equal(gateEvidence(path).humanReviewRequired, true);
});

test("GATE: a claim with grade C/D or no citations is blocked", async () => {
  assert.equal(gateEvidence(await provider.gradeModality("acoustic")).allowed, false); // grade C
  assert.equal(gateEvidence(await provider.gradeModality("nonsense")).allowed, false); // grade D
});

test("GATE: real-slice result below the honesty gate is not headline", () => {
  // CT ~0.30 Dice must never be a headline metric.
  assert.notEqual(classifyRealSliceResult({ meanDice: 0.3, domainGapScore: 0.5, registrationErrorPx: 6 }), "headline");
});

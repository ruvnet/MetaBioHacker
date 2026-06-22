// MetaBioHacker Multimodal V0 — runnable local benchmark.
//
// Proves: ingest typed artifacts -> canonical observations -> patient state
// graph + contradictions -> priors -> Darwin-selected fusion policy -> verifiable
// run ledger -> safe UI packet. No real patient data, no diagnosis, no claims.
//
// Run: npm run benchmark   (node --experimental-strip-types)

import { labAdapter } from "./src/ingest/labAdapter.ts";
import { imagingAdapter } from "./src/ingest/imagingAdapter.ts";
import { pathologyAdapter } from "./src/ingest/pathologyAdapter.ts";
import { buildReconstructionPrior } from "./src/fusion/priorBuilder.ts";
import { scoreMultimodalRun } from "./src/fusion/scoring.ts";
import { evolveMultimodalHarness } from "./src/fusion/evolveMultimodalHarness.ts";
import { buildPatientStateGraph } from "./src/graph/buildPatientStateGraph.ts";
import { detectContradictions } from "./src/graph/contradictions.ts";
import { createRunLedger } from "./src/ledger/createRunLedger.ts";
import { verifyRunLedger } from "./src/ledger/verifyRunLedger.ts";
import { createReconstructionPacket } from "./src/output/reconstructionPacket.ts";
import { labFixture, mriFixture, pathologyFixture, ACOUSTIC_BASELINE } from "./test/fixtures.ts";

const labs = await labAdapter.parse(labFixture);
const imaging = await imagingAdapter.parse(mriFixture);
const pathology = await pathologyAdapter.parse(pathologyFixture);
const observations = [...labs, ...imaging, ...pathology];

console.log("== MetaBioHacker Multimodal V0 benchmark ==");
console.log(`ingested ${observations.length} observations from ${new Set(observations.map((o) => o.modality)).size} modalities`);

// Acoustic-only baseline vs evolved multimodal fusion policy.
const acousticOnly = scoreMultimodalRun({ acoustic: ACOUSTIC_BASELINE, prior: buildReconstructionPrior([]) });
const { front, best, baseline } = await evolveMultimodalHarness({ observations, acoustic: ACOUSTIC_BASELINE });

const stabilityGain = (best.score.reconstructionStability - acousticOnly.reconstructionStability) / acousticOnly.reconstructionStability;
const uncertaintyDrop = (acousticOnly.uncertainty - best.score.uncertainty) / Math.max(acousticOnly.uncertainty, 1e-6);

console.log(`pareto front size: ${front.length}`);
console.log(`acoustic-only : stability ${acousticOnly.reconstructionStability.toFixed(3)} residual ${acousticOnly.acousticResidual.toFixed(3)}`);
console.log(`best fusion    : stability ${best.score.reconstructionStability.toFixed(3)} residual ${best.score.acousticResidual.toFixed(3)} (${best.genome.id})`);
console.log(`stability gain ${(stabilityGain * 100).toFixed(1)}% · uncertainty drop ${(uncertaintyDrop * 100).toFixed(1)}%`);

// Build + verify the audit ledger for the best run.
const prior = buildReconstructionPrior(observations);
const graph = buildPatientStateGraph("synthetic_patient_001", observations);
const contradictions = detectContradictions(observations);
const score = scoreMultimodalRun({ acoustic: ACOUSTIC_BASELINE, prior });
const ledger = createRunLedger({
  id: "bench_run_001",
  patientId: "synthetic_patient_001",
  runTime: new Date().toISOString(),
  acousticEngine: { binaryHash: "sonic_ct_serve", version: "0.1.0" },
  observations,
  prior,
  graph,
  contradictions,
  routing: [{ id: "r0", stage: "local", reason: "frozen acoustic reconstruction", inputIds: observations.map((o) => o.id), outputId: "score", latencyMs: ACOUSTIC_BASELINE.latencyMs, costUsd: 0, accepted: true }],
  score,
});
const verification = verifyRunLedger(ledger);
const packet = createReconstructionPacket(ledger);

console.log(`\nledger verified: ${verification.passed} · mode: ${packet.mode} · human review: ${packet.evidence.humanReviewRequired}`);
console.log(`ledger hash: ${ledger.hashes.ledgerHash.slice(0, 16)}…`);

// Acceptance: stability up (or uncertainty down) with residual unchanged,
// provenance complete, pathology forcing review.
const residualFlat = best.score.acousticResidual === acousticOnly.acousticResidual;
const provenanceComplete = observations.every((o) => o.provenance.hash && o.provenance.sourceId);
const reviewForced = packet.evidence.humanReviewRequired === true;
const passed = (stabilityGain >= 0.1 || uncertaintyDrop >= 0.15) && residualFlat && provenanceComplete && reviewForced && verification.passed;
console.log(`\nACCEPTANCE: ${passed ? "PASS" : "review"} (residualFlat=${residualFlat}, provenance=${provenanceComplete}, review=${reviewForced})`);

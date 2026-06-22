import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPatientStateGraph } from "../src/graph/buildPatientStateGraph.ts";
import { detectContradictions } from "../src/graph/contradictions.ts";
import { buildReconstructionPrior } from "../src/fusion/priorBuilder.ts";
import { scoreMultimodalRun } from "../src/fusion/scoring.ts";
import { createRunLedger } from "../src/ledger/createRunLedger.ts";
import { verifyRunLedger } from "../src/ledger/verifyRunLedger.ts";
import { createReconstructionPacket } from "../src/output/reconstructionPacket.ts";
import type { MedicalObservation } from "../src/ingest/types.ts";
import { ACOUSTIC_BASELINE } from "./fixtures.ts";

test("creates a verifiable ledger and a safe UI packet", () => {
  const observations: MedicalObservation[] = [
    {
      id: "obs_mri_001",
      patientId: "synthetic_patient_001",
      eventTime: "2026-06-21",
      modality: "mri",
      sourceFormat: "DICOM",
      name: "MRI abdomen",
      bodySite: "abdomen",
      derivedFeatures: {},
      uncertainty: 0.09,
      qualityScore: 0.91,
      humanReviewRequired: false,
      consentScope: "research",
      provenance: { sourceSystem: "synthetic", sourceId: "study_001", parserVersion: "0.1.0", hash: "hash_001" },
    },
  ];
  const prior = buildReconstructionPrior(observations);
  const graph = buildPatientStateGraph("synthetic_patient_001", observations);
  const contradictions = detectContradictions(observations);
  const score = scoreMultimodalRun({ acoustic: ACOUSTIC_BASELINE, prior });

  const ledger = createRunLedger({
    id: "run_001",
    patientId: "synthetic_patient_001",
    runTime: "2026-06-21T20:00:00Z",
    acousticEngine: { binaryHash: "engine_hash_001", version: "0.1.0" },
    observations,
    prior,
    graph,
    contradictions,
    routing: [
      {
        id: "route_001",
        stage: "local",
        reason: "Initial frozen acoustic reconstruction",
        inputIds: ["obs_mri_001"],
        outputId: "score_001",
        latencyMs: 140,
        costUsd: 0,
        accepted: true,
      },
    ],
    score,
  });

  const verification = verifyRunLedger(ledger);
  const packet = createReconstructionPacket(ledger);
  assert.equal(verification.passed, true, verification.errors.join("; "));
  assert.equal(packet.displayRules.blockDiagnosisLanguage, true);
  assert.equal(packet.displayRules.showUncertaintyOverlay, true);
  assert.equal(packet.ledgerHash, ledger.hashes.ledgerHash);
});

test("tampering with the ledger fails verification", () => {
  const observations: MedicalObservation[] = [];
  const prior = buildReconstructionPrior(observations);
  const graph = buildPatientStateGraph("p", observations);
  const score = scoreMultimodalRun({ acoustic: ACOUSTIC_BASELINE, prior });
  const ledger = createRunLedger({
    id: "run_x",
    patientId: "p",
    runTime: "t",
    acousticEngine: { binaryHash: "h", version: "0.1.0" },
    observations,
    prior,
    graph,
    contradictions: [],
    routing: [],
    score,
  });
  // Tamper with the score after hashing.
  ledger.score.acousticResidual = 0.0;
  assert.equal(verifyRunLedger(ledger).passed, false);
});

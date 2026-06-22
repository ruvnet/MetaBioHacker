import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPatientStateGraph } from "../src/graph/buildPatientStateGraph.ts";
import { detectContradictions } from "../src/graph/contradictions.ts";
import { applyContradictionPenalty } from "../src/fusion/contradictionPenalty.ts";
import { scoreMultimodalRun } from "../src/fusion/scoring.ts";
import { buildReconstructionPrior } from "../src/fusion/priorBuilder.ts";
import type { MedicalObservation } from "../src/ingest/types.ts";
import { ACOUSTIC_BASELINE } from "./fixtures.ts";

function makeLab(id: string, name: string, value: number, unit: string): MedicalObservation {
  return {
    id,
    patientId: "synthetic_patient_001",
    eventTime: "2026-06-21",
    modality: "lab",
    sourceFormat: "CSV",
    name,
    value,
    unit,
    derivedFeatures: {},
    uncertainty: 0.08,
    qualityScore: 0.92,
    humanReviewRequired: false,
    consentScope: "research",
    provenance: { sourceSystem: "synthetic", sourceId: id, parserVersion: "0.1.0", hash: id },
  };
}

test("graph links observations to patient and body site", () => {
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
  const graph = buildPatientStateGraph("synthetic_patient_001", observations);
  assert.ok(graph.nodes.some((n) => n.type === "patient"));
  assert.ok(graph.nodes.some((n) => n.type === "body_site"));
  assert.ok(graph.edges.some((e) => e.type === "has_observation"));
  assert.ok(graph.edges.some((e) => e.type === "measures_site"));
});

test("detects conflicting same-test values as high severity", () => {
  const contradictions = detectContradictions([
    makeLab("lab_1", "CRP", 1.1, "mg/L"),
    makeLab("lab_2", "CRP", 8.2, "mg/L"),
  ]);
  assert.ok(contradictions.length > 0);
  assert.equal(contradictions[0].severity, "high");
  assert.equal(contradictions[0].requiresHumanReview, true);
});

test("contradiction penalty lowers agreement, not acoustic residual", () => {
  const prior = buildReconstructionPrior([makeLab("lab_1", "CRP", 1.1, "mg/L")]);
  const base = scoreMultimodalRun({ acoustic: ACOUSTIC_BASELINE, prior });
  const penalized = applyContradictionPenalty({
    score: base,
    contradictions: [
      { id: "c1", severity: "high", message: "x", observationIds: ["a", "b"], requiresHumanReview: true },
    ],
  });
  assert.ok(penalized.multimodalAgreement < base.multimodalAgreement);
  assert.ok(penalized.uncertainty > base.uncertainty);
  assert.equal(penalized.acousticResidual, base.acousticResidual);
});

import type { RawArtifact } from "../src/ingest/types.ts";

export const labFixture: RawArtifact = {
  id: "artifact_lab_001",
  patientId: "synthetic_patient_001",
  sourceFormat: "CSV",
  metadata: { sourceSystem: "syntheticLab" },
  body: [
    "eventTime,name,value,unit,loinc",
    "2026-06-21,Glucose,5.4,mmol/L,2345-7",
    "2026-06-21,ALT,22,U/L,1742-6",
    "2026-06-21,CRP,1.1,mg/L,1988-5",
  ].join("\n"),
};

export const mriFixture: RawArtifact = {
  id: "artifact_mri_001",
  patientId: "synthetic_patient_001",
  sourceFormat: "DICOM",
  metadata: { sourceSystem: "syntheticDicomSidecar" },
  body: JSON.stringify({
    eventTime: "2026-06-21",
    modality: "mri",
    bodySite: "abdomen",
    studyId: "study_001",
    features: { structureConfidence: 0.91, boundaryConfidence: 0.86 },
  }),
};

export const pathologyFixture: RawArtifact = {
  id: "artifact_path_001",
  patientId: "synthetic_patient_001",
  sourceFormat: "JSON",
  metadata: { sourceSystem: "syntheticPathology" },
  body: JSON.stringify({
    eventTime: "2026-06-21",
    modality: "pathology",
    specimenType: "biopsy core",
    bodySite: "liver",
    findingText: "Synthetic finding text — research fixture only.",
    confidence: 0.82,
  }),
};

export const ACOUSTIC_BASELINE = {
  shapeConsistency: 0.72,
  acousticResidual: 0.18,
  temporalStability: 0.7,
  latencyMs: 140,
  safetyScore: 0.99,
};

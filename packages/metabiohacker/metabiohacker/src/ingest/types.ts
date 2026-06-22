// MetaBioHacker Multimodal Ingest V0 — canonical observation schema.
//
// Goal: no real patient data, no diagnosis, no claims. Prove the pipeline can
// ingest typed medical artifacts, convert them into canonical observations,
// build priors, run the frozen Rust acoustic engine, and score whether
// multimodal context improves reconstruction. FHIR/DICOM/LOINC/SNOMED/OMOP are
// the interchange layers; observations are the internal canonical event.

export type Modality =
  | "acoustic"
  | "mri"
  | "ct"
  | "ultrasound"
  | "ekg"
  | "eeg"
  | "lab"
  | "pathology"
  | "cytology"
  | "pap"
  | "hpv"
  | "biopsy"
  | "wearable";

export type SourceFormat = "CSV" | "JSON" | "DICOM" | "FHIR" | "PDF" | "RAW";

export type MedicalObservation = {
  id: string;
  patientId: string;
  eventTime: string;
  modality: Modality;
  sourceFormat: SourceFormat;
  name: string;
  value?: number | string | boolean;
  unit?: string;
  codeSystem?: "LOINC" | "SNOMED" | "ICD" | "CPT" | "RxNorm";
  code?: string;
  bodySite?: string;
  specimenType?: string;
  derivedFeatures: Record<string, number | string | boolean>;
  uncertainty: number;
  qualityScore: number;
  humanReviewRequired: boolean;
  consentScope: "research" | "wellness" | "clinicalReview";
  provenance: { sourceSystem: string; sourceId: string; parserVersion: string; hash: string };
};

export type RawArtifact = {
  id: string;
  patientId: string;
  sourceFormat: SourceFormat;
  body: string;
  metadata: Record<string, string>;
};

export type IngestAdapter = {
  name: string;
  parse: (artifact: RawArtifact) => Promise<MedicalObservation[]>;
};

// Modalities whose parsed output is ground-truth-adjacent and must always be
// routed for professional review (ADR-0013 / ADR-0018).
export const REVIEW_REQUIRED_MODALITIES: Modality[] = [
  "pathology",
  "biopsy",
  "pap",
  "hpv",
  "cytology",
];

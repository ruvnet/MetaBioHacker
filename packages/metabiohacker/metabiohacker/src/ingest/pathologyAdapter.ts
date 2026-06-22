// Pathology / cytology adapter: parses a report sidecar JSON into an
// observation. Parsed pathology text is ground-truth-ADJACENT — it is always
// flagged for human review and never treated as truth automatically.

import { createHash } from "node:crypto";
import type { IngestAdapter, MedicalObservation, RawArtifact } from "./types.ts";

type PathSidecar = {
  eventTime: string;
  modality: "pathology" | "cytology" | "pap" | "hpv" | "biopsy";
  specimenType: string;
  bodySite: string;
  findingText: string;
  code?: string; // optional SNOMED CT
  confidence?: number;
};

export const pathologyAdapter: IngestAdapter = {
  name: "pathologyAdapter",
  async parse(artifact: RawArtifact): Promise<MedicalObservation[]> {
    const p = JSON.parse(artifact.body) as PathSidecar;
    const hash = createHash("sha256").update(artifact.body).digest("hex");
    const confidence = p.confidence ?? 0.8;
    return [
      {
        id: `${artifact.id}_path`,
        patientId: artifact.patientId,
        eventTime: p.eventTime,
        modality: p.modality,
        sourceFormat: artifact.sourceFormat,
        name: `${p.modality} ${p.bodySite}`,
        value: p.findingText,
        codeSystem: p.code ? "SNOMED" : undefined,
        code: p.code,
        bodySite: p.bodySite,
        specimenType: p.specimenType,
        derivedFeatures: { findingLength: p.findingText.length },
        uncertainty: 1 - confidence,
        qualityScore: confidence,
        humanReviewRequired: true, // pathology is never auto-truth
        consentScope: "clinicalReview",
        provenance: {
          sourceSystem: artifact.metadata.sourceSystem ?? "synthetic",
          sourceId: artifact.id,
          parserVersion: "0.1.0",
          hash,
        },
      },
    ];
  },
};

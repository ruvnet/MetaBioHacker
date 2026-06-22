// Imaging adapter: for V0 we do not parse raw DICOM yet — we read a DICOM
// sidecar JSON (study-level metadata + derived features). Replace with a real
// DICOM parser later; the canonical observation shape stays identical.

import { createHash } from "node:crypto";
import type { IngestAdapter, MedicalObservation, RawArtifact } from "./types.ts";

type ImagingSidecar = {
  eventTime: string;
  modality: "mri" | "ct" | "ultrasound";
  bodySite: string;
  studyId: string;
  features: { structureConfidence: number; boundaryConfidence: number; motionConfidence?: number };
};

export const imagingAdapter: IngestAdapter = {
  name: "imagingAdapter",
  async parse(artifact: RawArtifact): Promise<MedicalObservation[]> {
    const parsed = JSON.parse(artifact.body) as ImagingSidecar;
    const hash = createHash("sha256").update(artifact.body).digest("hex");
    return [
      {
        id: `${artifact.id}_imaging`,
        patientId: artifact.patientId,
        eventTime: parsed.eventTime,
        modality: parsed.modality,
        sourceFormat: artifact.sourceFormat,
        name: `${parsed.modality} ${parsed.bodySite}`,
        bodySite: parsed.bodySite,
        derivedFeatures: {
          structureConfidence: parsed.features.structureConfidence,
          boundaryConfidence: parsed.features.boundaryConfidence,
          motionConfidence: parsed.features.motionConfidence ?? 0,
        },
        uncertainty: 1 - parsed.features.structureConfidence,
        qualityScore: parsed.features.structureConfidence,
        humanReviewRequired: false,
        consentScope: "research",
        provenance: {
          sourceSystem: artifact.metadata.sourceSystem ?? "synthetic",
          sourceId: parsed.studyId,
          parserVersion: "0.1.0",
          hash,
        },
      },
    ];
  },
};

// Lab adapter: CSV -> LOINC-coded MedicalObservations. Labs are the easiest,
// cheapest, most longitudinal signal, so they are ingested first.

import { createHash } from "node:crypto";
import type { IngestAdapter, MedicalObservation, RawArtifact } from "./types.ts";

export const labAdapter: IngestAdapter = {
  name: "labAdapter",
  async parse(artifact: RawArtifact): Promise<MedicalObservation[]> {
    const lines = artifact.body
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];
    const header = lines[0].split(",").map((cell) => cell.trim());
    return lines.slice(1).map((line, index) => {
      const cells = line.split(",").map((cell) => cell.trim());
      const row = Object.fromEntries(header.map((key, i) => [key, cells[i]]));
      const value = Number(row.value);
      const hash = createHash("sha256").update(line).digest("hex");
      const observation: MedicalObservation = {
        id: `${artifact.id}_lab_${index}`,
        patientId: artifact.patientId,
        eventTime: row.eventTime,
        modality: "lab",
        sourceFormat: "CSV",
        name: row.name,
        value: Number.isFinite(value) ? value : row.value,
        unit: row.unit,
        codeSystem: "LOINC",
        code: row.loinc,
        derivedFeatures: {},
        uncertainty: 0.08,
        qualityScore: 0.92,
        humanReviewRequired: false,
        consentScope: "research",
        provenance: {
          sourceSystem: artifact.metadata.sourceSystem ?? "synthetic",
          sourceId: artifact.id,
          parserVersion: "0.1.0",
          hash,
        },
      };
      return observation;
    });
  },
};

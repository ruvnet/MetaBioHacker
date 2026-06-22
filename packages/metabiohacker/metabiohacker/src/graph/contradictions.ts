// Contradiction detection V0 — rule-based. Flags low-quality inputs, large
// same-test value disagreements, and any review-required modality that slipped
// through unflagged. Learned contradiction scoring comes later.

import type { MedicalObservation } from "../ingest/types.ts";

export type Contradiction = {
  id: string;
  severity: "low" | "medium" | "high";
  message: string;
  observationIds: string[];
  requiresHumanReview: boolean;
};

export function detectContradictions(observations: MedicalObservation[]): Contradiction[] {
  return [
    ...detectQualityConflicts(observations),
    ...detectSameTestValueConflicts(observations),
    ...detectPathologyReviewConflicts(observations),
  ];
}

function detectQualityConflicts(observations: MedicalObservation[]): Contradiction[] {
  return observations
    .filter((o) => o.qualityScore < 0.5)
    .map((o) => ({
      id: `quality_conflict_${o.id}`,
      severity: "medium" as const,
      message: `Low quality observation should reduce confidence: ${o.name}`,
      observationIds: [o.id],
      requiresHumanReview: o.humanReviewRequired,
    }));
}

function detectSameTestValueConflicts(observations: MedicalObservation[]): Contradiction[] {
  const out: Contradiction[] = [];
  const grouped = new Map<string, MedicalObservation[]>();
  for (const o of observations) {
    if (typeof o.value !== "number") continue;
    const key = [o.patientId, o.name.toLowerCase(), o.unit ?? ""].join("_");
    const g = grouped.get(key) ?? [];
    g.push(o);
    grouped.set(key, g);
  }
  for (const group of grouped.values()) {
    if (group.length < 2) continue;
    const values = group.map((o) => Number(o.value)).filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    if (min <= 0) continue;
    if (max / min >= 2) {
      out.push({
        id: `value_conflict_${group.map((g) => g.id).join("_")}`,
        severity: "high",
        message: `Large same-test difference detected: ${group[0].name}`,
        observationIds: group.map((g) => g.id),
        requiresHumanReview: true,
      });
    }
  }
  return out;
}

function detectPathologyReviewConflicts(observations: MedicalObservation[]): Contradiction[] {
  return observations
    .filter((o) => ["pathology", "biopsy", "pap", "cytology", "hpv"].includes(o.modality))
    .filter((o) => !o.humanReviewRequired)
    .map((o) => ({
      id: `missing_review_${o.id}`,
      severity: "high" as const,
      message: `Human review is required for ${o.modality}`,
      observationIds: [o.id],
      requiresHumanReview: true,
    }));
}

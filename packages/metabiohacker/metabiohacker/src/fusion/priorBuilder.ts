// Prior builder: medical observations MODIFY reconstruction priors and
// uncertainty — they never force a conclusion (ADR-0017). External data can
// change priors, confidence, routing, and uncertainty; it cannot diagnose.

import type { MedicalObservation } from "../ingest/types.ts";

export type ReconstructionPrior = {
  anatomyPriorWeight: number;
  organBoundaryPriorWeight: number;
  biochemicalContextWeight: number;
  cardiacTimingWeight: number;
  neuralTimingWeight: number;
  pathologyValidationWeight: number;
  uncertaintyPenalty: number;
  humanReviewRequired: boolean;
};

export function emptyPrior(): ReconstructionPrior {
  return {
    anatomyPriorWeight: 0,
    organBoundaryPriorWeight: 0,
    biochemicalContextWeight: 0,
    cardiacTimingWeight: 0,
    neuralTimingWeight: 0,
    pathologyValidationWeight: 0,
    uncertaintyPenalty: 0,
    humanReviewRequired: false,
  };
}

export function buildReconstructionPrior(observations: MedicalObservation[]): ReconstructionPrior {
  const prior = emptyPrior();
  for (const o of observations) {
    if (o.modality === "mri") {
      prior.anatomyPriorWeight += 0.9 * o.qualityScore;
      prior.organBoundaryPriorWeight += 0.7 * o.qualityScore;
    }
    if (o.modality === "ct") {
      prior.anatomyPriorWeight += 0.75 * o.qualityScore;
      prior.organBoundaryPriorWeight += 0.65 * o.qualityScore;
    }
    if (o.modality === "ultrasound") {
      prior.organBoundaryPriorWeight += 0.7 * o.qualityScore;
    }
    if (o.modality === "lab") {
      prior.biochemicalContextWeight += 0.35 * o.qualityScore;
    }
    if (o.modality === "ekg") {
      prior.cardiacTimingWeight += 0.85 * o.qualityScore;
    }
    if (o.modality === "eeg") {
      prior.neuralTimingWeight += 0.75 * o.qualityScore;
    }
    if (
      o.modality === "pathology" ||
      o.modality === "biopsy" ||
      o.modality === "pap" ||
      o.modality === "cytology" ||
      o.modality === "hpv"
    ) {
      prior.pathologyValidationWeight += 0.95 * o.qualityScore;
      prior.humanReviewRequired = true;
    }
    prior.uncertaintyPenalty += o.uncertainty * 0.05;
  }
  return clampPrior(prior);
}

function clampPrior(p: ReconstructionPrior): ReconstructionPrior {
  return {
    anatomyPriorWeight: clamp(p.anatomyPriorWeight),
    organBoundaryPriorWeight: clamp(p.organBoundaryPriorWeight),
    biochemicalContextWeight: clamp(p.biochemicalContextWeight),
    cardiacTimingWeight: clamp(p.cardiacTimingWeight),
    neuralTimingWeight: clamp(p.neuralTimingWeight),
    pathologyValidationWeight: clamp(p.pathologyValidationWeight),
    uncertaintyPenalty: clamp(p.uncertaintyPenalty),
    humanReviewRequired: p.humanReviewRequired,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

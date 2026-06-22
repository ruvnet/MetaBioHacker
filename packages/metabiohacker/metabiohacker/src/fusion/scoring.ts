// Multimodal scoring: priors lift reconstruction stability/agreement and shape
// uncertainty, but the acoustic residual (the physics) is passed through
// unchanged — external data never edits the frozen engine's output.

import type { ReconstructionPrior } from "./priorBuilder.ts";

export type AcousticResult = {
  shapeConsistency: number;
  acousticResidual: number;
  temporalStability: number;
  latencyMs: number;
  safetyScore: number;
};

export type MultimodalScore = {
  reconstructionStability: number;
  acousticResidual: number;
  multimodalAgreement: number;
  uncertainty: number;
  latencyMs: number;
  safetyScore: number;
  humanReviewCoverage: number;
};

export function scoreMultimodalRun(input: { acoustic: AcousticResult; prior: ReconstructionPrior }): MultimodalScore {
  const priorSupport =
    input.prior.anatomyPriorWeight * 0.3 +
    input.prior.organBoundaryPriorWeight * 0.25 +
    input.prior.biochemicalContextWeight * 0.15 +
    input.prior.cardiacTimingWeight * 0.15 +
    input.prior.neuralTimingWeight * 0.1 +
    input.prior.pathologyValidationWeight * 0.05;

  const reconstructionStability = clamp(input.acoustic.temporalStability + priorSupport * 0.12);
  const multimodalAgreement = clamp(input.acoustic.shapeConsistency * 0.6 + priorSupport * 0.4);
  const uncertainty = clamp(1 - multimodalAgreement + input.prior.uncertaintyPenalty);

  return {
    reconstructionStability,
    acousticResidual: input.acoustic.acousticResidual, // physics: passed through unchanged
    multimodalAgreement,
    uncertainty,
    latencyMs: input.acoustic.latencyMs,
    safetyScore: input.acoustic.safetyScore,
    humanReviewCoverage: input.prior.humanReviewRequired ? 1 : 0,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

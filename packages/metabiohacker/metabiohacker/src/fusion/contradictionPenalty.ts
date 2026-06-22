// Contradictions lower multimodal agreement and raise uncertainty (and dent
// safety for high-severity ones) — but never touch the acoustic residual.

import type { Contradiction } from "../graph/contradictions.ts";
import type { MultimodalScore } from "./scoring.ts";

export function applyContradictionPenalty(input: {
  score: MultimodalScore;
  contradictions: Contradiction[];
}): MultimodalScore {
  const high = input.contradictions.filter((c) => c.severity === "high").length;
  const medium = input.contradictions.filter((c) => c.severity === "medium").length;
  const low = input.contradictions.filter((c) => c.severity === "low").length;
  const penalty = Math.min(0.5, high * 0.18 + medium * 0.08 + low * 0.03);
  return {
    ...input.score,
    multimodalAgreement: clamp(input.score.multimodalAgreement - penalty),
    uncertainty: clamp(input.score.uncertainty + penalty),
    safetyScore: clamp(input.score.safetyScore - high * 0.05),
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// Domain-gap scoring + the real-slice honesty gate. A real CT/MRI slice is only
// a clean acoustic benchmark when it is close enough to what the acoustic ring
// would actually observe; otherwise it is research-only or excluded from
// headline metrics. Prevents accidental overclaiming (ADR-0024).

export function scoreDomainGap(input: {
  registrationErrorPx: number; // normalised 0..1 (or px/maxPx)
  targetBoundaryComplexity: number; // 0..1
  classImbalance: number; // 0..1
  missingAcousticEquivalent: number; // 0..1 (e.g. air/contrast with no acoustic analogue)
}): number {
  const gap =
    input.registrationErrorPx * 0.25 +
    input.targetBoundaryComplexity * 0.25 +
    input.classImbalance * 0.2 +
    input.missingAcousticEquivalent * 0.3;
  return Math.max(0, Math.min(1, gap));
}

export function classifyRealSliceResult(input: {
  meanDice: number;
  domainGapScore: number;
  registrationErrorPx: number; // pixels
}): "headline" | "researchOnly" | "exclude" {
  if (input.registrationErrorPx > 12) return "exclude";
  if (input.domainGapScore > 0.6) return "exclude";
  if (input.meanDice < 0.45) return "researchOnly";
  if (input.domainGapScore > 0.3) return "researchOnly";
  return "headline";
}

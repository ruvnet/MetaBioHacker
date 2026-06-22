// Gate a fusion policy's admitted modalities through the evidence layer. A
// modality may only contribute a prior if its evidence grades A or B with
// citations; otherwise it counts as an unsupported claim. Evidence grade and
// unsupported-claim count become Darwin Pareto objectives (ADR-0023).

import type { EvidenceProvider, EvidenceGrade } from "./types.ts";
import { gradeRank } from "./types.ts";
import { gateEvidence } from "./evidenceGate.ts";

export type FusionEvidence = {
  allowedModalities: string[];
  blockedModalities: string[];
  worstGrade: EvidenceGrade;
  unsupportedClaimCount: number;
  humanReviewRequired: boolean;
};

export async function gateFusionModalities(
  modalities: string[],
  provider: EvidenceProvider
): Promise<FusionEvidence> {
  const allowed: string[] = [];
  const blocked: string[] = [];
  let worst: EvidenceGrade = "A";
  let humanReview = false;

  for (const m of modalities) {
    const dossier = await provider.gradeModality(m);
    const gate = gateEvidence(dossier);
    humanReview = humanReview || gate.humanReviewRequired;
    if (gradeRank(dossier.evidenceGrade) < gradeRank(worst)) worst = dossier.evidenceGrade;
    if (gate.allowed) allowed.push(m);
    else blocked.push(m);
  }

  return {
    allowedModalities: allowed,
    blockedModalities: blocked,
    worstGrade: modalities.length ? worst : "D",
    unsupportedClaimCount: blocked.length,
    humanReviewRequired: humanReview,
  };
}

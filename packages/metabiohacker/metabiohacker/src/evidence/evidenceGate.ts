// The hard rule: a modality, prior, or user-facing claim ships only when ruvn
// grades the supporting evidence A or B AND citations are present. Review-required
// modalities always force human review regardless of grade.

import {
  type EvidenceGateResult,
  type RuvnEvidenceDossier,
  REVIEW_REQUIRED_MODALITIES,
} from "./types.ts";

export function gateEvidence(dossier: RuvnEvidenceDossier): EvidenceGateResult {
  const strong = dossier.evidenceGrade === "A" || dossier.evidenceGrade === "B";
  const hasCitations = dossier.citations.length > 0;
  const reviewForced = REVIEW_REQUIRED_MODALITIES.includes(dossier.modality) || dossier.humanReviewRequired;
  const allowed = strong && hasCitations;
  const reason = allowed
    ? `grade ${dossier.evidenceGrade} with ${dossier.citations.length} citation(s)`
    : !strong
      ? `evidence grade ${dossier.evidenceGrade} below B — claim blocked`
      : "no citations — claim blocked";
  return {
    allowed,
    reason,
    grade: dossier.evidenceGrade,
    citations: dossier.citations,
    humanReviewRequired: reviewForced,
  };
}

// Gate a specific claim string against its dossier's allow/block lists.
export function gateClaim(dossier: RuvnEvidenceDossier, claim: string): EvidenceGateResult {
  const base = gateEvidence(dossier);
  if (dossier.blockedClaims.some((c) => claim.toLowerCase().includes(c.toLowerCase()))) {
    return { ...base, allowed: false, reason: `claim explicitly blocked by dossier: "${claim}"` };
  }
  return base;
}

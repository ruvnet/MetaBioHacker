// Evidence-intelligence layer. ruvn (research agent harness) grades the science
// behind each modality, prior, and claim. Runs OFF the reconstruction hot path.
// A/B = usable (primary/official or reputable secondary), C = context only,
// D = discarded. Claims ship only on A/B with citations (ADR-0023).

export type EvidenceGrade = "A" | "B" | "C" | "D";

export type Citation = { title: string; url: string; grade: EvidenceGrade };

export type RuvnEvidenceDossier = {
  question: string;
  modality: string;
  allowedClaims: string[];
  blockedClaims: string[];
  evidenceGrade: EvidenceGrade;
  citations: Citation[];
  humanReviewRequired: boolean;
  generatedAt?: string;
};

// Any source of dossiers (cached, or the live ruvn CLI).
export type EvidenceProvider = {
  name: string;
  gradeModality: (modality: string, question?: string) => Promise<RuvnEvidenceDossier>;
};

export type EvidenceGateResult = {
  allowed: boolean;
  reason: string;
  grade: EvidenceGrade;
  citations: Citation[];
  humanReviewRequired: boolean;
};

// Modalities whose claims always require human review (ADR-0013/0018).
export const REVIEW_REQUIRED_MODALITIES = ["pathology", "biopsy", "pap", "hpv", "cytology"];

export function gradeRank(g: EvidenceGrade): number {
  return { A: 3, B: 2, C: 1, D: 0 }[g];
}

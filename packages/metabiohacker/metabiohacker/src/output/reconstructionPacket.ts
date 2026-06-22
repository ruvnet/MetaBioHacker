// The safe UI-facing packet: exposes confidence, uncertainty, provenance, and
// review status; enforces uncertainty overlay and blocks diagnostic language.

import type { ReconstructionLedger } from "../ledger/types.ts";

export type ReconstructionPacket = {
  runId: string;
  patientId: string;
  mode: "research" | "wellness" | "clinical_review";
  summary: {
    confidence: number;
    uncertainty: number;
    multimodalAgreement: number;
    reconstructionStability: number;
    acousticResidual: number;
    safetyScore: number;
  };
  evidence: {
    observationsUsed: number;
    modalitiesUsed: string[];
    contradictions: { severity: string; message: string; observationIds: string[] }[];
    humanReviewRequired: boolean;
  };
  displayRules: {
    showUncertaintyOverlay: boolean;
    blockDiagnosisLanguage: boolean;
    showRawEvidenceLinks: boolean;
    showContradictions: boolean;
  };
  ledgerHash: string;
};

export function createReconstructionPacket(ledger: ReconstructionLedger): ReconstructionPacket {
  return {
    runId: ledger.id,
    patientId: ledger.patientId,
    mode: ledger.safety.allowedOutputMode,
    summary: {
      confidence: clamp(ledger.score.multimodalAgreement),
      uncertainty: clamp(ledger.score.uncertainty),
      multimodalAgreement: clamp(ledger.score.multimodalAgreement),
      reconstructionStability: clamp(ledger.score.reconstructionStability),
      acousticResidual: ledger.score.acousticResidual,
      safetyScore: clamp(ledger.score.safetyScore),
    },
    evidence: {
      observationsUsed: ledger.observations.length,
      modalitiesUsed: Array.from(new Set(ledger.observations.map((o) => o.modality))),
      contradictions: ledger.contradictions.map((c) => ({
        severity: c.severity,
        message: c.message,
        observationIds: c.observationIds,
      })),
      humanReviewRequired: ledger.safety.humanReviewRequired,
    },
    displayRules: {
      showUncertaintyOverlay: true,
      blockDiagnosisLanguage: true,
      showRawEvidenceLinks: true,
      showContradictions: true,
    },
    ledgerHash: ledger.hashes.ledgerHash,
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

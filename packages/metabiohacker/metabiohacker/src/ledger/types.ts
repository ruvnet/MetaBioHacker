// Reconstruction Run Ledger: a permanent, verifiable audit trail for every scan
// — its observations, prior, graph, contradictions, routing, score, safety
// state, and stable hashes. No black box; every reconstruction is reproducible.

import type { MedicalObservation } from "../ingest/types.ts";
import type { ReconstructionPrior } from "../fusion/priorBuilder.ts";
import type { MultimodalScore } from "../fusion/scoring.ts";
import type { PatientStateGraph } from "../graph/types.ts";
import type { Contradiction } from "../graph/contradictions.ts";

export type RoutingDecision = {
  id: string;
  stage: "local" | "cheap" | "mid" | "frontier" | "human_review";
  reason: string;
  inputIds: string[];
  outputId: string;
  latencyMs: number;
  costUsd: number;
  accepted: boolean;
};

export type ReconstructionLedger = {
  id: string;
  patientId: string;
  runTime: string;
  acousticEngine: { binaryHash: string; version: string; frozen: true };
  inputObservationIds: string[];
  observations: MedicalObservation[];
  prior: ReconstructionPrior;
  graph: PatientStateGraph;
  contradictions: Contradiction[];
  routing: RoutingDecision[];
  score: MultimodalScore;
  safety: {
    diagnosticLanguageBlocked: boolean;
    uncertaintyOverlayRequired: boolean;
    humanReviewRequired: boolean;
    allowedOutputMode: "research" | "wellness" | "clinical_review";
  };
  hashes: {
    observationHash: string;
    priorHash: string;
    graphHash: string;
    scoreHash: string;
    ledgerHash: string;
  };
};

import type { MedicalObservation } from "../ingest/types.ts";
import type { ReconstructionPrior } from "../fusion/priorBuilder.ts";
import type { MultimodalScore } from "../fusion/scoring.ts";
import type { PatientStateGraph } from "../graph/types.ts";
import type { Contradiction } from "../graph/contradictions.ts";
import { stableHash } from "./stableHash.ts";
import type { ReconstructionLedger, RoutingDecision } from "./types.ts";

export function createRunLedger(input: {
  id: string;
  patientId: string;
  runTime: string;
  acousticEngine: { binaryHash: string; version: string };
  observations: MedicalObservation[];
  prior: ReconstructionPrior;
  graph: PatientStateGraph;
  contradictions: Contradiction[];
  routing: RoutingDecision[];
  score: MultimodalScore;
}): ReconstructionLedger {
  const humanReviewRequired =
    input.contradictions.some((c) => c.requiresHumanReview) ||
    input.observations.some((o) => o.humanReviewRequired);

  const observationHash = stableHash(input.observations);
  const priorHash = stableHash(input.prior);
  const graphHash = stableHash(input.graph);
  const scoreHash = stableHash(input.score);

  const base = {
    id: input.id,
    patientId: input.patientId,
    runTime: input.runTime,
    acousticEngine: { binaryHash: input.acousticEngine.binaryHash, version: input.acousticEngine.version, frozen: true as const },
    inputObservationIds: input.observations.map((o) => o.id),
    observations: input.observations,
    prior: input.prior,
    graph: input.graph,
    contradictions: input.contradictions,
    routing: input.routing,
    score: input.score,
    safety: {
      diagnosticLanguageBlocked: true,
      uncertaintyOverlayRequired: true,
      humanReviewRequired,
      allowedOutputMode: humanReviewRequired ? ("clinical_review" as const) : ("research" as const),
    },
    hashes: { observationHash, priorHash, graphHash, scoreHash, ledgerHash: "" },
  };

  const ledgerHash = stableHash({
    ...base,
    hashes: { observationHash, priorHash, graphHash, scoreHash },
  });

  return { ...base, hashes: { observationHash, priorHash, graphHash, scoreHash, ledgerHash } };
}

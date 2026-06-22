// Darwin primitives select the best multimodal fusion policy: which modalities
// to admit as priors, how to weight uncertainty, and whether pathology is used
// for validation only. The frozen acoustic engine is never mutated.

import { mapLimit, paretoFront } from "@metaharness/darwin";
import type { MedicalObservation } from "../ingest/types.ts";
import { buildReconstructionPrior } from "./priorBuilder.ts";
import { scoreMultimodalRun, type AcousticResult, type MultimodalScore } from "./scoring.ts";
import { applyContradictionPenalty } from "./contradictionPenalty.ts";
import { detectContradictions } from "../graph/contradictions.ts";

export type FusionGenome = {
  id: string;
  useLabs: boolean;
  useMri: boolean;
  useEkg: boolean;
  useEeg: boolean;
  usePathologyAsValidationOnly: boolean;
  maxObservationAgeDays: number;
  uncertaintyPenaltyWeight: number;
};

export type ScoredFusion = { genome: FusionGenome; score: MultimodalScore };

function admit(genome: FusionGenome, o: MedicalObservation): boolean {
  if (o.modality === "lab") return genome.useLabs;
  if (o.modality === "mri") return genome.useMri;
  if (o.modality === "ekg") return genome.useEkg;
  if (o.modality === "eeg") return genome.useEeg;
  if (["pathology", "biopsy", "pap", "cytology", "hpv"].includes(o.modality)) {
    return genome.usePathologyAsValidationOnly;
  }
  return true;
}

export async function evaluateFusionPopulation(input: {
  genomes: FusionGenome[];
  observations: MedicalObservation[];
  acoustic: AcousticResult;
  concurrency: number;
}): Promise<ScoredFusion[]> {
  return mapLimit(input.genomes, input.concurrency, async (genome: FusionGenome) => {
    const filtered = input.observations.filter((o) => admit(genome, o));
    const prior = buildReconstructionPrior(filtered);
    const base = scoreMultimodalRun({ acoustic: input.acoustic, prior });
    const contradictions = detectContradictions(filtered);
    const score = applyContradictionPenalty({ score: base, contradictions });
    return { genome, score };
  });
}

// Pareto frontier across the multimodal objectives. paretoFront maximises every
// component, so minimised objectives are negated.
export function fusionParetoFront(scored: ScoredFusion[]): ScoredFusion[] {
  return paretoFront(scored, (c) => [
    c.score.reconstructionStability,
    c.score.multimodalAgreement,
    c.score.safetyScore,
    c.score.humanReviewCoverage,
    -c.score.acousticResidual,
    -c.score.uncertainty,
    -c.score.latencyMs,
  ]);
}

export async function evolveMultimodalHarness(input: {
  observations: MedicalObservation[];
  acoustic: AcousticResult;
  concurrency?: number;
}): Promise<{ front: ScoredFusion[]; best: ScoredFusion; baseline: ScoredFusion }> {
  const concurrency = input.concurrency ?? 4;
  // Acoustic-only baseline vs a population enabling various modality priors.
  const baselineGenome: FusionGenome = {
    id: "acoustic-only",
    useLabs: false,
    useMri: false,
    useEkg: false,
    useEeg: false,
    usePathologyAsValidationOnly: true,
    maxObservationAgeDays: 365,
    uncertaintyPenaltyWeight: 0.05,
  };
  const genomes: FusionGenome[] = [baselineGenome];
  const flags = [true, false];
  let i = 0;
  for (const useLabs of flags)
    for (const useMri of flags)
      for (const useEkg of flags) {
        genomes.push({
          id: `g${i++}`,
          useLabs,
          useMri,
          useEkg,
          useEeg: false,
          usePathologyAsValidationOnly: true,
          maxObservationAgeDays: 365,
          uncertaintyPenaltyWeight: 0.05,
        });
      }

  const scored = await evaluateFusionPopulation({ genomes, observations: input.observations, acoustic: input.acoustic, concurrency });
  const front = fusionParetoFront(scored);
  const baseline = scored.find((s) => s.genome.id === "acoustic-only")!;
  const best = scored.reduce((a, b) => (b.score.reconstructionStability > a.score.reconstructionStability ? b : a));
  return { front, best, baseline };
}

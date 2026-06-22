// MetaBioHacker reconstruction-harness evolution (Darwin Mode).
//
// Invariant: genome -> run frozen Rust acoustic engine -> score candidate ->
// select Pareto front -> mutate next generation. The Rust engine is the physics
// truth layer; only the reconstruction policy, priors, routing, scoring, and
// explanation policy evolve. We use @metaharness/darwin's `mapLimit` (bounded
// evaluation) and `paretoFront` (multi-objective selection). `evolve()` is left
// for later actual source-surface mutation.

import { mapLimit, paretoFront } from "@metaharness/darwin";
import { spawn } from "node:child_process";

export type ModelTier = "local" | "cheap" | "mid" | "frontier";

export type MetaBioGenome = {
  id: string;
  seed: number;
  engine: { binaryPath: string; frozen: true; acousticClasses: readonly string[] };
  reconstruction: {
    voxelResolutionMm: number;
    temporalWindowMs: number;
    channelFusion: "mean" | "median" | "attention" | "confidenceWeighted";
    smoothingAlpha: number;
    ghostBodyPriorWeight: number;
    atlasPriorWeight: number;
    chamberCompensation: number;
    confidenceThreshold: number;
    organBoundarySharpness: number;
  };
  routing: {
    firstPass: "local" | "cheap";
    escalationOrder: ModelTier[];
    frontierConfidenceFloor: number;
    frontierDisagreementFloor: number;
    frontierMaxCallsPerRun: number;
    explanationTier: "cheap" | "mid" | "frontier";
  };
  scoring: {
    shapeConsistencyWeight: number;
    acousticResidualWeight: number;
    temporalStabilityWeight: number;
    latencyWeight: number;
    costWeight: number;
    safetyWeight: number;
  };
  safety: { allowDiagnosticLanguage: false; requireUncertaintyOverlay: true; minSafetyScore: number };
};

export type ReconstructionSample = { id: string; seed: number; inputPath?: string; expectedMaskPath?: string };

export type EngineResult = {
  sampleId: string;
  confidence: number;
  acousticResidual: number;
  shapeConsistency: number;
  temporalStability: number;
  disagreement: number;
  safetyScore: number;
  latencyMs: number;
  costUsd: number;
};

export type ScoredCandidate = {
  genome: MetaBioGenome;
  score: {
    shapeConsistency: number;
    acousticResidual: number;
    temporalStability: number;
    latencyMs: number;
    costUsd: number;
    safetyScore: number;
    frontierCalls: number;
  };
  aggregate: number;
  passed: boolean;
};

export function baselineGenome(binaryPath: string): MetaBioGenome {
  return {
    id: "baseline",
    seed: 1,
    engine: { binaryPath, frozen: true, acousticClasses: ["water", "fat", "muscle", "softTissue", "bone"] },
    reconstruction: {
      voxelResolutionMm: 4,
      temporalWindowMs: 800,
      channelFusion: "confidenceWeighted",
      smoothingAlpha: 0.35,
      ghostBodyPriorWeight: 0.4,
      atlasPriorWeight: 0.25,
      chamberCompensation: 0.15,
      confidenceThreshold: 0.72,
      organBoundarySharpness: 0.5,
    },
    routing: {
      firstPass: "local",
      escalationOrder: ["cheap", "mid", "frontier"],
      frontierConfidenceFloor: 0.55,
      frontierDisagreementFloor: 0.42,
      frontierMaxCallsPerRun: 3,
      explanationTier: "cheap",
    },
    scoring: {
      shapeConsistencyWeight: 0.24,
      acousticResidualWeight: 0.22,
      temporalStabilityWeight: 0.18,
      latencyWeight: 0.12,
      costWeight: 0.1,
      safetyWeight: 0.14,
    },
    safety: { allowDiagnosticLanguage: false, requireUncertaintyOverlay: true, minSafetyScore: 0.9 },
  };
}

// --- frozen Rust engine runner (JSON over stdio) ----------------------------
export async function runFrozenRustEngine(
  genome: MetaBioGenome,
  sample: ReconstructionSample
): Promise<EngineResult> {
  const started = performance.now();
  const payload = { sample, reconstruction: genome.reconstruction, safety: genome.safety };
  const out = await runProcessJson(genome.engine.binaryPath, payload);
  const latencyMs = performance.now() - started;
  return {
    sampleId: sample.id,
    confidence: Number(out.confidence ?? 0),
    acousticResidual: Number(out.acousticResidual ?? 1),
    shapeConsistency: Number(out.shapeConsistency ?? 0),
    temporalStability: Number(out.temporalStability ?? 0),
    disagreement: Number(out.disagreement ?? 1),
    safetyScore: Number(out.safetyScore ?? 0),
    latencyMs,
    costUsd: 0,
  };
}

export function runProcessJson(binaryPath: string, payload: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, [], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `engine exited ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`invalid JSON from engine: ${stdout}`));
      }
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

// --- cheap -> frontier routing ----------------------------------------------
// The model tier never rewrites anatomy: it only refines confidence/uncertainty
// or proposes a better reconstruction policy. The Rust engine stays the truth.
export function shouldUseFrontier(genome: MetaBioGenome, r: EngineResult, used: number): boolean {
  if (used >= genome.routing.frontierMaxCallsPerRun) return false;
  const lowConfidence = r.confidence < genome.routing.frontierConfidenceFloor;
  const highDisagreement = r.disagreement > genome.routing.frontierDisagreementFloor;
  return lowConfidence || highDisagreement;
}

export async function routeReconstruction(
  genome: MetaBioGenome,
  result: EngineResult,
  used: number
): Promise<EngineResult> {
  if (!shouldUseFrontier(genome, result, used)) return result;
  return {
    ...result,
    confidence: Math.min(1, result.confidence + 0.08),
    shapeConsistency: Math.min(1, result.shapeConsistency + 0.04),
    disagreement: Math.max(0, result.disagreement - 0.06),
    costUsd: result.costUsd + 0.03,
    latencyMs: result.latencyMs + 1200,
  };
}

// --- multi-objective scoring ------------------------------------------------
export function scoreCandidate(genome: MetaBioGenome, results: EngineResult[]): ScoredCandidate {
  const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / Math.max(v.length, 1);
  const shapeConsistency = mean(results.map((r) => r.shapeConsistency));
  const acousticResidual = mean(results.map((r) => r.acousticResidual));
  const temporalStability = mean(results.map((r) => r.temporalStability));
  const latencyMs = mean(results.map((r) => r.latencyMs));
  const costUsd = results.reduce((s, r) => s + r.costUsd, 0);
  const safetyScore = mean(results.map((r) => r.safetyScore));
  const frontierCalls = results.filter((r) => r.costUsd > 0).length;

  const w = genome.scoring;
  const aggregate =
    shapeConsistency * w.shapeConsistencyWeight +
    (1 / (1 + acousticResidual)) * w.acousticResidualWeight +
    temporalStability * w.temporalStabilityWeight +
    (1 / (1 + latencyMs / 1000)) * w.latencyWeight +
    (1 / (1 + costUsd)) * w.costWeight +
    safetyScore * w.safetyWeight;

  const passed =
    safetyScore >= genome.safety.minSafetyScore && Number.isFinite(aggregate) && acousticResidual >= 0 && latencyMs > 0;

  return {
    genome,
    score: { shapeConsistency, acousticResidual, temporalStability, latencyMs, costUsd, safetyScore, frontierCalls },
    aggregate,
    passed,
  };
}

// Convert a candidate's objectives to a vector for Darwin's paretoFront, which
// maximises every component (so minimised objectives are negated).
export function objectiveVector(c: ScoredCandidate): number[] {
  return [
    c.score.shapeConsistency,
    c.score.temporalStability,
    c.score.safetyScore,
    -c.score.acousticResidual,
    -c.score.latencyMs,
    -c.score.costUsd,
    -c.score.frontierCalls,
  ];
}

export function selectParetoFront(cands: ScoredCandidate[]): ScoredCandidate[] {
  return paretoFront(cands, objectiveVector);
}

// --- mutation ---------------------------------------------------------------
export function mutateGenome(parent: MetaBioGenome, generation: number, index: number): MetaBioGenome {
  const rng = seededRandom(parent.seed + generation * 1009 + index * 9176);
  const choice = <T,>(v: readonly T[]) => v[Math.floor(rng() * v.length)];
  const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const jitter = (x: number, a: number, lo: number, hi: number) => clamp(x + (rng() * 2 - 1) * a, lo, hi);
  return {
    ...parent,
    id: `${parent.id}.${generation}.${index}`,
    seed: Math.floor(rng() * 1_000_000_000),
    reconstruction: {
      ...parent.reconstruction,
      voxelResolutionMm: choice([2, 3, 4, 5, 6]),
      temporalWindowMs: choice([250, 500, 800, 1200, 1600]),
      channelFusion: choice(["mean", "median", "attention", "confidenceWeighted"]),
      smoothingAlpha: jitter(parent.reconstruction.smoothingAlpha, 0.12, 0, 0.95),
      ghostBodyPriorWeight: jitter(parent.reconstruction.ghostBodyPriorWeight, 0.15, 0, 1),
      atlasPriorWeight: jitter(parent.reconstruction.atlasPriorWeight, 0.15, 0, 1),
      chamberCompensation: jitter(parent.reconstruction.chamberCompensation, 0.1, 0, 1),
      confidenceThreshold: jitter(parent.reconstruction.confidenceThreshold, 0.08, 0.4, 0.95),
      organBoundarySharpness: jitter(parent.reconstruction.organBoundarySharpness, 0.15, 0, 1),
    },
    routing: {
      ...parent.routing,
      frontierConfidenceFloor: jitter(parent.routing.frontierConfidenceFloor, 0.08, 0.35, 0.8),
      frontierDisagreementFloor: jitter(parent.routing.frontierDisagreementFloor, 0.08, 0.2, 0.75),
      frontierMaxCallsPerRun: choice([0, 1, 2, 3, 5]),
      explanationTier: choice(["cheap", "mid", "frontier"]),
    },
    scoring: normalizeWeights({
      shapeConsistencyWeight: jitter(parent.scoring.shapeConsistencyWeight, 0.06, 0.05, 0.45),
      acousticResidualWeight: jitter(parent.scoring.acousticResidualWeight, 0.06, 0.05, 0.45),
      temporalStabilityWeight: jitter(parent.scoring.temporalStabilityWeight, 0.06, 0.05, 0.35),
      latencyWeight: jitter(parent.scoring.latencyWeight, 0.04, 0.03, 0.25),
      costWeight: jitter(parent.scoring.costWeight, 0.04, 0.03, 0.25),
      safetyWeight: jitter(parent.scoring.safetyWeight, 0.05, 0.08, 0.35),
    }),
  };
}

function normalizeWeights(w: MetaBioGenome["scoring"]): MetaBioGenome["scoring"] {
  const t =
    w.shapeConsistencyWeight + w.acousticResidualWeight + w.temporalStabilityWeight + w.latencyWeight + w.costWeight + w.safetyWeight;
  return {
    shapeConsistencyWeight: w.shapeConsistencyWeight / t,
    acousticResidualWeight: w.acousticResidualWeight / t,
    temporalStabilityWeight: w.temporalStabilityWeight / t,
    latencyWeight: w.latencyWeight / t,
    costWeight: w.costWeight / t,
    safetyWeight: w.safetyWeight / t,
  };
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let v = state;
    v = Math.imul(v ^ (v >>> 15), v | 1);
    v ^= v + Math.imul(v ^ (v >>> 7), v | 61);
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

// --- evaluation + evolution loop --------------------------------------------
export async function evaluateGenome(
  genome: MetaBioGenome,
  samples: ReconstructionSample[],
  concurrency: number
): Promise<ScoredCandidate> {
  let frontierUsed = 0;
  const results = await mapLimit(samples, concurrency, async (sample: ReconstructionSample) => {
    const raw = await runFrozenRustEngine(genome, sample); // always runs the frozen engine first
    const routed = await routeReconstruction(genome, raw, frontierUsed);
    if (routed.costUsd > raw.costUsd) frontierUsed += 1;
    return routed;
  });
  return scoreCandidate(genome, results);
}

export async function evolveMetaBioHarness(input: {
  seedGenome: MetaBioGenome;
  samples: ReconstructionSample[];
  generations: number;
  populationSize: number;
  concurrency: number;
}) {
  let population: MetaBioGenome[] = [input.seedGenome];
  const archive: ScoredCandidate[] = [];

  for (let generation = 1; generation <= input.generations; generation++) {
    const candidates = [
      ...population,
      ...population.flatMap((parent) =>
        Array.from({ length: input.populationSize }, (_, index) => mutateGenome(parent, generation, index))
      ),
    ];
    const scored = await mapLimit(candidates, input.concurrency, async (g: MetaBioGenome) =>
      evaluateGenome(g, input.samples, input.concurrency)
    );
    const passed = scored.filter((c) => c.passed);
    archive.push(...passed);
    const front = selectParetoFront(passed.length ? passed : scored);
    population = front
      .sort((a, b) => b.aggregate - a.aggregate)
      .slice(0, Math.max(2, Math.floor(input.populationSize / 2)))
      .map((c) => c.genome);
  }

  return {
    bestByAggregate: [...archive].sort((a, b) => b.aggregate - a.aggregate)[0],
    paretoFront: selectParetoFront(archive),
    archive,
  };
}

// --- acceptance gate --------------------------------------------------------
export function isUsefulImprovement(baseline: ScoredCandidate, candidate: ScoredCandidate): boolean {
  const stabilityGain = candidate.score.temporalStability >= baseline.score.temporalStability * 1.1;
  const latencyGain = candidate.score.latencyMs <= baseline.score.latencyMs * 0.8;
  const noPhysicsRegression = candidate.score.acousticResidual <= baseline.score.acousticResidual;
  const noSafetyRegression = candidate.score.safetyScore >= baseline.score.safetyScore;
  const noCostExplosion = candidate.score.costUsd <= baseline.score.costUsd * 1.25 + 0.01;
  return (stabilityGain || latencyGain) && noPhysicsRegression && noSafetyRegression && noCostExplosion;
}

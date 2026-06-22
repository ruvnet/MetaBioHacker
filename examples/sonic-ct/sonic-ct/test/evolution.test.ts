import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapLimit } from "@metaharness/darwin";
import {
  baselineGenome,
  runFrozenRustEngine,
  routeReconstruction,
  selectParetoFront,
  type ScoredCandidate,
} from "../src/optimizer/reconstructionEvolution.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FAKE = path.join(__dirname, "fixtures", "fakeEngine.mjs");

// 1. mapLimit must bound concurrency.
test("mapLimit bounds in-flight evaluations", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const items = Array.from({ length: 12 }, (_, i) => i);
  await mapLimit(items, 3, async (x: number) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
    return x;
  });
  assert.ok(maxInFlight <= 3, `maxInFlight ${maxInFlight} should be <= 3`);
});

// Helper to build a scored candidate with chosen objective values.
function cand(id: string, shape: number, latency: number, cost: number): ScoredCandidate {
  return {
    genome: { id } as any,
    score: {
      shapeConsistency: shape,
      acousticResidual: 0.05,
      temporalStability: 0.8,
      latencyMs: latency,
      costUsd: cost,
      safetyScore: 0.97,
      frontierCalls: 0,
    },
    aggregate: shape,
    passed: true,
  };
}

// 2. paretoFront keeps a slower-but-accurate candidate AND a faster-but-cheaper
//    candidate, while dropping a dominated one.
test("paretoFront keeps non-dominated trade-offs", () => {
  const accurate = cand("accurate", 0.9, 5000, 0.05); // high shape, slow
  const fast = cand("fast", 0.6, 800, 0.0); // low shape, fast + cheap
  const dominated = cand("dominated", 0.55, 6000, 0.06); // worse on every axis
  const front = selectParetoFront([accurate, fast, dominated]);
  const ids = front.map((c) => c.genome.id);
  assert.ok(ids.includes("accurate"), "accurate must be on the front");
  assert.ok(ids.includes("fast"), "fast must be on the front");
  assert.ok(!ids.includes("dominated"), "dominated must be excluded");
});

// 3. Frontier routing augments the engine result; it never bypasses the engine.
test("frontier routing never bypasses the frozen engine", async () => {
  const g = baselineGenome(FAKE);
  g.routing.frontierMaxCallsPerRun = 3;
  const raw = await runFrozenRustEngine(g, { id: "s1", seed: 1 });
  // The engine ran and produced its own result.
  assert.equal(raw.sampleId, "s1");
  assert.equal(raw.costUsd, 0);

  const routed = await routeReconstruction(g, raw, 0);
  // Frontier fired (fake confidence 0.3 < floor 0.55) but on TOP of the engine
  // result: same sample, improved confidence, added cost — physics untouched.
  assert.equal(routed.sampleId, raw.sampleId);
  assert.ok(routed.costUsd > raw.costUsd, "frontier should add cost");
  assert.ok(routed.confidence > raw.confidence, "frontier should refine confidence");
  assert.ok(routed.shapeConsistency >= raw.shapeConsistency);
});

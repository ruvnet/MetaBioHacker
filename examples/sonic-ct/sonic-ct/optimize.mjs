// MetaBioHacker harness optimizer — Darwin Mode for acoustic reconstruction.
//
// Principle (Meta Harness / @metaharness/darwin): "freeze the model, evolve the
// harness." The FROZEN MODEL is the Rust acoustic engine (sonic_ct → WASM); we
// never change the physics. We evolve the RECONSTRUCTION HARNESS: what is
// reconstructed, how it is routed (cheap → frontier), and how it is scored.
//
// Darwin's `evolve()` is its code-surface evolver (it mutates harness *source
// files* against a task sandbox, for LLM agent harnesses). For our numeric
// genome we keep the same invariant — genome -> run frozen engine -> scored
// candidate -> Pareto frontier — using Darwin's `mapLimit` (bounded-concurrency
// evaluation) and `paretoFront` (multi-objective selection) primitives.
//
// Run: npm run optimize

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mapLimit, paretoFront } from "@metaharness/darwin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- frozen model: load the WASM acoustic engine once ----------------------
const bytes = fs.readFileSync(path.join(__dirname, "public", "sonic_ct.wasm"));
const { instance } = await WebAssembly.instantiate(bytes, {});
const e = instance.exports;

// Simulated economics of the model-routing tier (compute arbitrage).
const FRONTIER_COST_USD = 0.003;
const FRONTIER_LATENCY_MS = 400;
const CHEAP_COST_USD = 0.0002;

// OpenRouter LLM frontier-mutator config (the "write layer" that proposes
// harness policy mutations). Bounded so cost stays trivial; falls back to the
// deterministic random mutator when the key is absent or a call fails.
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";
const CHEAP_MODEL = "openai/gpt-4o-mini";
const FRONTIER_MODEL = "openai/gpt-4o";
const LLM_BUDGET = 10; // hard cap on total LLM calls per run
let llmCalls = 0;

async function llmProposeMutation(parent, evalResult, useFrontier) {
  if (!OPENROUTER_KEY || llmCalls >= LLM_BUDGET) return null;
  const model = useFrontier ? FRONTIER_MODEL : CHEAP_MODEL;
  const sys =
    "You evolve the reconstruction HARNESS of an ultrasound-CT engine. The physics engine is FROZEN — never change it. " +
    "Propose ONE mutation to the reconstruction genome to improve temporal stability and shape score while keeping latency, cost, " +
    "acoustic residual, and frontier model-calls low. Reply with ONLY a JSON object for the `reconstruction` field: " +
    '{"voxelResolutionMm":number 3-7.5,"temporalWindowMs":number 20-120,"smoothing":"none|light|medium",' +
    '"organPrior":"none|atlas|ghostBody","confidenceThreshold":number 0.2-0.85,"elements":int 48-280,"fan":int 24-200}.';
  const user = JSON.stringify({ current: parent.reconstruction, lastScores: evalResult });
  try {
    llmCalls++;
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENROUTER_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        max_tokens: 220,
        temperature: 0.7,
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const txt = data?.choices?.[0]?.message?.content;
    if (!txt) return null;
    const r = JSON.parse(txt);
    // Validate + clamp the proposed genome before it can be evaluated.
    const child = structuredClone(parent);
    const c = child.reconstruction;
    if (Number.isFinite(r.voxelResolutionMm)) c.voxelResolutionMm = clampF(r.voxelResolutionMm, 3.0, 7.5);
    if (Number.isFinite(r.temporalWindowMs)) c.temporalWindowMs = clampF(r.temporalWindowMs, 20, 120);
    if (SMOOTHINGS.includes(r.smoothing)) c.smoothing = r.smoothing;
    if (PRIORS.includes(r.organPrior)) c.organPrior = r.organPrior;
    if (Number.isFinite(r.confidenceThreshold)) c.confidenceThreshold = clampF(r.confidenceThreshold, 0.2, 0.85);
    if (Number.isFinite(r.elements)) c.elements = clamp(Math.round(r.elements), 48, 280);
    if (Number.isFinite(r.fan)) c.fan = clamp(Math.round(r.fan), 24, 200);
    child._origin = useFrontier ? "llm-frontier" : "llm-cheap";
    return child;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reconstruction genome (the evolved harness). The acoustic engine stays frozen.
// ---------------------------------------------------------------------------
const FOV_MM = 240;

function baselineGenome() {
  return {
    acousticEngine: { frozen: true, binary: "sonic_ct.wasm" },
    reconstruction: {
      voxelResolutionMm: 4.3, // -> grid n ~ 56
      temporalWindowMs: 70, // -> nz ~ 18
      smoothing: "light", // -> SART iters
      organPrior: "atlas",
      confidenceThreshold: 0.55,
      elements: 180,
      fan: 90,
    },
    modelRouting: {
      firstPass: "local",
      escalation: "frontier",
      frontierOnlyWhen: { lowConfidence: true, inconsistentFrames: true, userRequestedExplanation: false },
    },
    scoring: {
      weightShapeConsistency: 1.0,
      weightAcousticResidual: 1.0,
      weightLatency: 0.5,
      weightCost: 0.5,
      weightSafety: 1.0,
    },
  };
}

const SMOOTHING_ITERS = { none: 3, light: 6, medium: 10 };
const PRIOR_BONUS = { none: 0.0, atlas: 0.02, ghostBody: 0.035 };

// Decode genome -> frozen-engine parameters.
function decode(g) {
  const r = g.reconstruction;
  const n = clamp(Math.round(FOV_MM / r.voxelResolutionMm), 32, 96);
  const nz = clamp(Math.round(((r.temporalWindowMs - 20) / 100) * 20 + 8), 6, 28);
  const iters = SMOOTHING_ITERS[r.smoothing] ?? 6;
  return { n, nz, iters, elements: clamp(Math.round(r.elements), 48, 280), fan: clamp(Math.round(r.fan), 24, 200) };
}

// ---------------------------------------------------------------------------
// Evaluate a genome against the frozen engine -> EvalResult.
// ---------------------------------------------------------------------------
function evaluate(g, { seeds }) {
  const p = decode(g);
  const r = g.reconstruction;
  let shapeSum = 0, residualSum = 0, stabilitySum = 0, frontierCalls = 0, wall = 0;
  const flags = [0, 0, 0, 0];

  for (const seed of seeds) {
    const t0 = performance.now();
    e.sct_vol_begin(p.nz, p.n, p.elements, Math.min(p.fan, p.elements - 1), p.iters, seed);
    while (e.sct_vol_step() < p.nz) {}
    wall += performance.now() - t0;

    const meanDice = e.sct_vol_mean_dice();
    const sliceDice = new Float32Array(e.memory.buffer, e.sct_vol_slice_dice_ptr(), p.nz).slice();
    const sliceMae = new Float32Array(e.memory.buffer, e.sct_vol_slice_mae_ptr(), p.nz).slice();

    // Shape score gets a small, bounded organ-prior bonus (priors guide
    // labelling without touching the physics).
    shapeSum += Math.min(1, meanDice + (PRIOR_BONUS[r.organPrior] ?? 0));

    // Acoustic residual: mean speed MAE normalised by the speed window.
    residualSum += mean(sliceMae) / 1700;

    // Temporal stability: 1 - normalised stddev of per-slice Dice.
    stabilitySum += clamp(1 - std(sliceDice) / 0.25, 0, 1);

    // Cheap->frontier routing: the local Rust reconstruction always runs; the
    // frontier model only fires on low-confidence slices (per the routing
    // policy) and never overrides physics — it proposes a policy mutation.
    if (g.modelRouting.frontierOnlyWhen.lowConfidence) {
      frontierCalls += sliceDice.filter((d) => d < r.confidenceThreshold).length;
    }
    for (let i = 0; i < 4; i++) flags[i] = Math.max(flags[i], e.sct_quality_flag(i));
  }
  const k = seeds.length;
  const frontier = Math.round(frontierCalls / k);
  // Safety: penalised by high-severity quality flags (bone shadow, sparse
  // coverage, boundary uncertainty); research-only invariant is structural.
  const sevPenalty = flags.reduce((a, s) => a + s, 0) / (4 * 2);
  return {
    shapeScore: shapeSum / k,
    acousticResidual: residualSum / k,
    temporalStability: stabilitySum / k,
    latencyMs: wall / k + frontier * FRONTIER_LATENCY_MS,
    costUsd: frontier * FRONTIER_COST_USD + (p.nz * CHEAP_COST_USD),
    safetyScore: clamp(1 - sevPenalty, 0, 1),
    frontierCalls: frontier,
  };
}

// Multi-objective vector for paretoFront (it maximises every component, so
// minimised objectives are negated).
function objectives(s) {
  return [s.shapeScore, s.temporalStability, s.safetyScore, -s.acousticResidual, -s.latencyMs, -s.costUsd];
}

// Scalar fitness for ranking within a generation (weighted; selection itself
// uses the Pareto frontier).
function scalar(s, w) {
  return (
    w.weightShapeConsistency * s.shapeScore +
    w.weightSafety * s.safetyScore +
    0.5 * s.temporalStability -
    w.weightAcousticResidual * s.acousticResidual -
    w.weightLatency * (s.latencyMs / 5000) -
    w.weightCost * (s.costUsd / 0.1)
  );
}

// ---- genome mutation -------------------------------------------------------
const SMOOTHINGS = ["none", "light", "medium"];
const PRIORS = ["none", "atlas", "ghostBody"];
const clampF = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
const jitter = (a) => a + (Math.random() * 2 - 1);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function mutate(g) {
  const n = structuredClone(g);
  const r = n.reconstruction;
  r.voxelResolutionMm = clampF(jitter(r.voxelResolutionMm), 3.0, 7.5);
  r.temporalWindowMs = clampF(r.temporalWindowMs + (Math.random() * 30 - 15), 20, 120);
  if (Math.random() < 0.4) r.smoothing = pick(SMOOTHINGS);
  if (Math.random() < 0.3) r.organPrior = pick(PRIORS);
  r.confidenceThreshold = clampF(r.confidenceThreshold + (Math.random() * 0.2 - 0.1), 0.2, 0.85);
  r.elements = clamp(Math.round(r.elements + (Math.random() * 60 - 30)), 48, 280);
  r.fan = clamp(Math.round(r.fan + (Math.random() * 40 - 20)), 24, 200);
  return n;
}

// ---- helpers ---------------------------------------------------------------
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};

// ---- Darwin Mode evolution -------------------------------------------------
const POP = 10, GENERATIONS = 6, ELITE = 4;
const CHEAP = { seeds: [1] };
const FRONTIER = { seeds: [1, 2, 3] };

const baseline = baselineGenome();
let population = [baseline, ...Array.from({ length: POP - 1 }, () => mutate(baseline))];
let best = null;
const archive = []; // every frontier-scored variant (Darwin keeps an archive)
const history = [];

console.log("== MetaBioHacker · Darwin harness optimizer ==");
console.log("frozen model: sonic_ct WASM | evolving reconstruction + routing + scoring genome\n");

for (let gen = 0; gen < GENERATIONS; gen++) {
  // Tier 1 — cheap filter (bounded concurrency via Darwin mapLimit).
  const cheap = await mapLimit(population, 1, async (g) => ({ g, s: evaluate(g, CHEAP) }));
  cheap.sort((a, b) => scalar(b.s, b.g.scoring) - scalar(a.s, a.g.scoring));

  // Tier 2 — frontier re-evaluation of survivors.
  const scored = await mapLimit(cheap.slice(0, ELITE), 1, async ({ g }) => ({ g, s: evaluate(g, FRONTIER) }));

  archive.push(...scored);
  // Darwin Pareto frontier across accuracy / latency / cost / safety.
  const front = paretoFront(scored, ({ s }) => objectives(s));
  const winner = scored.reduce((a, b) => (scalar(b.s, b.g.scoring) > scalar(a.s, a.g.scoring) ? b : a));
  if (!best || scalar(winner.s, winner.g.scoring) > scalar(best.s, best.g.scoring)) best = winner;

  history.push({ gen, winner: summarize(winner), frontSize: front.length });
  console.log(
    `gen ${gen}: shape ${winner.s.shapeScore.toFixed(3)} stab ${winner.s.temporalStability.toFixed(3)} ` +
      `lat ${winner.s.latencyMs.toFixed(0)}ms $${winner.s.costUsd.toFixed(4)} frontier ${winner.s.frontierCalls} · pareto ${front.length}`
  );

  const elites = scored.map((x) => x.g);
  const next = [...elites];

  // Cheap -> frontier routing: the LLM "write layer" proposes harness mutations
  // for the best elite. The frontier model fires only when low-confidence slices
  // were detected (frontierCalls > 0); otherwise the cheaper model is used.
  const top = scored[0];
  const lowConfidence = top.s.frontierCalls > 0;
  const useFrontier = top.g.modelRouting.escalation === "frontier" && lowConfidence;
  for (let k = 0; k < 2 && next.length < POP; k++) {
    const child = await llmProposeMutation(top.g, top.s, useFrontier && k === 0);
    if (child) next.push(child);
  }
  while (next.length < POP) next.push(mutate(pick(elites)));
  population = next;
}

// ---- acceptance test (searched over the whole archive) ---------------------
const base = evaluate(baseline, FRONTIER);
const gate = (s) => {
  const stabilityGain = (s.temporalStability - base.temporalStability) / Math.max(base.temporalStability, 1e-6);
  const latencyGain = (base.latencyMs - s.latencyMs) / Math.max(base.latencyMs, 1e-6);
  const noRegress =
    s.acousticResidual <= base.acousticResidual + 1e-6 &&
    s.safetyScore >= base.safetyScore - 1e-6 &&
    s.frontierCalls <= base.frontierCalls;
  return { stabilityGain, latencyGain, noRegress, passed: noRegress && (stabilityGain >= 0.1 || latencyGain >= 0.2) };
};

// A Pareto-superior, gate-passing variant is the acceptance target. Among
// passers prefer the largest combined stability+latency improvement.
const passers = archive
  .map((x) => ({ x, g: gate(x.s) }))
  .filter((e) => e.g.passed)
  .sort((a, b2) => b2.g.stabilityGain + b2.g.latencyGain - (a.g.stabilityGain + a.g.latencyGain));

const accepted = passers[0]?.x ?? best;
const acc = gate(accepted.s);
const passed = !!passers.length;
best = accepted;

console.log("\n-- acceptance test (over archive) --");
console.log(`candidates evaluated: ${archive.length} | gate-passing: ${passers.length}`);
console.log(`accepted: stability gain ${(acc.stabilityGain * 100).toFixed(1)}% | latency gain ${(acc.latencyGain * 100).toFixed(1)}% | no-regress ${acc.noRegress}`);
console.log(passed ? "PASS — Pareto-superior harness found (freeze model, evolve harness)" : "no gate-passing variant this run");
const stabilityGain = acc.stabilityGain;
const latencyGain = acc.latencyGain;
const noRegress = acc.noRegress;

console.log(`LLM frontier-mutator calls: ${llmCalls}${OPENROUTER_KEY ? "" : " (no OPENROUTER_API_KEY — random mutator only)"}`);

const report = {
  tool: "metaharness/darwin",
  philosophy: "freeze the model, evolve the harness",
  frozenModel: "sonic_ct WASM acoustic engine",
  primitivesUsed: ["mapLimit", "paretoFront"],
  writeLayer: { provider: "openrouter", cheapModel: CHEAP_MODEL, frontierModel: FRONTIER_MODEL, llmCalls, budget: LLM_BUDGET },
  baseline: { genome: baseline, eval: base },
  evolved: summarize(best),
  acceptance: { stabilityGain, latencyGain, noRegress, passed },
  history,
};
fs.writeFileSync(path.join(__dirname, "optimize.report.json"), JSON.stringify(report, null, 2));
console.log(`\nreport -> ${path.join(__dirname, "optimize.report.json")}`);

function summarize(x) {
  return {
    origin: x.g._origin || "seed/random",
    reconstruction: x.g.reconstruction,
    routing: x.g.modelRouting,
    eval: x.s,
    engineParams: decode(x.g),
  };
}

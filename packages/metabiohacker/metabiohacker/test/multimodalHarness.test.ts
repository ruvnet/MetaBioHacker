import { test } from "node:test";
import assert from "node:assert/strict";
import { labAdapter } from "../src/ingest/labAdapter.ts";
import { imagingAdapter } from "../src/ingest/imagingAdapter.ts";
import { pathologyAdapter } from "../src/ingest/pathologyAdapter.ts";
import { buildReconstructionPrior } from "../src/fusion/priorBuilder.ts";
import { scoreMultimodalRun } from "../src/fusion/scoring.ts";
import { evolveMultimodalHarness } from "../src/fusion/evolveMultimodalHarness.ts";
import { labFixture, mriFixture, pathologyFixture, ACOUSTIC_BASELINE } from "./fixtures.ts";

test("ingests lab + imaging artifacts into reconstruction priors", async () => {
  const labs = await labAdapter.parse(labFixture);
  const imaging = await imagingAdapter.parse(mriFixture);
  const observations = [...labs, ...imaging];
  assert.equal(observations.length, 4);
  const prior = buildReconstructionPrior(observations);
  assert.ok(prior.anatomyPriorWeight > 0.7, `anatomy ${prior.anatomyPriorWeight}`);
  assert.ok(prior.biochemicalContextWeight > 0, "biochemical context present");
});

test("multimodal priors improve stability without changing acoustic residual", async () => {
  const labs = await labAdapter.parse(labFixture);
  const imaging = await imagingAdapter.parse(mriFixture);
  const prior = buildReconstructionPrior([...labs, ...imaging]);
  const score = scoreMultimodalRun({ acoustic: ACOUSTIC_BASELINE, prior });
  assert.ok(score.reconstructionStability > ACOUSTIC_BASELINE.temporalStability, "stability improved");
  assert.equal(score.acousticResidual, ACOUSTIC_BASELINE.acousticResidual, "residual unchanged");
  assert.ok(score.safetyScore >= 0.99, "safety preserved");
});

test("pathology forces human review", async () => {
  const path = await pathologyAdapter.parse(pathologyFixture);
  assert.equal(path[0].humanReviewRequired, true);
  const prior = buildReconstructionPrior(path);
  assert.equal(prior.humanReviewRequired, true);
});

test("Darwin fusion harness finds a Pareto-superior multimodal policy", async () => {
  const labs = await labAdapter.parse(labFixture);
  const imaging = await imagingAdapter.parse(mriFixture);
  const observations = [...labs, ...imaging];
  const { front, best, baseline } = await evolveMultimodalHarness({ observations, acoustic: ACOUSTIC_BASELINE });
  assert.ok(front.length > 0, "non-empty pareto front");
  // The best multimodal policy beats acoustic-only on stability...
  assert.ok(best.score.reconstructionStability > baseline.score.reconstructionStability, "stability gain");
  // ...without touching the physics residual.
  assert.equal(best.score.acousticResidual, baseline.score.acousticResidual);
});

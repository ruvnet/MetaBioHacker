import { test } from "node:test";
import assert from "node:assert/strict";
import { CachedEvidenceProvider } from "../src/evidence/cachedProvider.ts";
import { gateEvidence, gateClaim } from "../src/evidence/evidenceGate.ts";
import { gateFusionModalities } from "../src/evidence/gateFusion.ts";

const provider = new CachedEvidenceProvider();

test("A/B evidence with citations is allowed; C/D is blocked", async () => {
  const mri = await provider.gradeModality("mri");
  assert.equal(gateEvidence(mri).allowed, true); // grade A

  const acoustic = await provider.gradeModality("acoustic");
  assert.equal(gateEvidence(acoustic).allowed, false); // grade C — research only
});

test("unknown modality grades D and is blocked", async () => {
  const unknown = await provider.gradeModality("crystalHealing");
  assert.equal(unknown.evidenceGrade, "D");
  assert.equal(gateEvidence(unknown).allowed, false);
});

test("pathology forces human review even at grade A", async () => {
  const path = await provider.gradeModality("pathology");
  const gate = gateEvidence(path);
  assert.equal(gate.allowed, true);
  assert.equal(gate.humanReviewRequired, true);
});

test("explicitly blocked claims are rejected", async () => {
  const ultrasound = await provider.gradeModality("ultrasound");
  // "cancer detection" is in ultrasound.blockedClaims.
  assert.equal(gateClaim(ultrasound, "ultrasound cancer detection").allowed, false);
  assert.equal(gateClaim(ultrasound, "body composition trend").allowed, true);
});

test("fusion gate counts unsupported modalities", async () => {
  const good = await gateFusionModalities(["mri", "lab", "ekg"], provider);
  assert.equal(good.unsupportedClaimCount, 0);
  assert.equal(good.worstGrade, "A");

  const mixed = await gateFusionModalities(["mri", "acoustic"], provider);
  assert.equal(mixed.unsupportedClaimCount, 1); // acoustic (C) is unsupported as a claim
  assert.deepEqual(mixed.allowedModalities, ["mri"]);
});

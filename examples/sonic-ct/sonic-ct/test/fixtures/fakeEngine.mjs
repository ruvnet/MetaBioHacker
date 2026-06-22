#!/usr/bin/env node
// Deterministic fake "frozen Rust engine" for tests: reads JSON on stdin,
// writes fixed JSON on stdout. Low confidence + high disagreement so frontier
// routing is exercised.
let s = "";
process.stdin.on("data", (d) => (s += d));
process.stdin.on("end", () => {
  let id = "fake";
  try {
    id = JSON.parse(s).sample.id;
  } catch {}
  process.stdout.write(
    JSON.stringify({
      sampleId: id,
      confidence: 0.3,
      acousticResidual: 0.05,
      shapeConsistency: 0.6,
      temporalStability: 0.7,
      disagreement: 0.6,
      safetyScore: 0.97,
    })
  );
});

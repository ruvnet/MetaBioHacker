// Probe the @metaharness/darwin surface so we wire to the real exports.
const mod = await import("@metaharness/darwin");
const names = Object.keys(mod).sort();
console.log("exports", names);

for (const required of ["evolve", "mapLimit"]) {
  if (typeof mod[required] !== "function") {
    throw new Error(`Missing required export: ${required}`);
  }
}
const paretoNames = names.filter((name) => /pareto/i.test(name));
console.log("pareto exports", paretoNames);
if (paretoNames.length === 0) {
  console.warn("No Pareto export found by name. Inspect exports above.");
}

// Inspect evolve() arity + the EvolutionConfig shape if discoverable.
console.log("evolve.length (arity):", mod.evolve.length);
const fnNames = names.filter((n) => typeof mod[n] === "function");
console.log("function exports:", fnNames);

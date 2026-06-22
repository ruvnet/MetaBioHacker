// Region-level Dice. Two entry points:
//  - diceByRegionFromLabels: exact, from predicted + target label rasters.
//  - regionDiceFromClassDice: lightweight, from the engine's per-class Dice
//    array (5 values) when full rasters aren't shipped out of the engine.

import { type RegionDiceScore, type Region, CLASS_TO_REGION } from "./realSliceTypes.ts";

// Exact region Dice from two equal-length class-label arrays (0..4).
export function diceByRegionFromLabels(predicted: number[], target: number[]): RegionDiceScore[] {
  const regions: Region[] = ["fluid", "fat", "softTissue", "bone"];
  const acc = new Map<Region, { inter: number; pred: number; tgt: number }>();
  for (const r of regions) acc.set(r, { inter: 0, pred: 0, tgt: 0 });

  const n = Math.min(predicted.length, target.length);
  for (let i = 0; i < n; i++) {
    const pr = CLASS_TO_REGION[predicted[i]];
    const tr = CLASS_TO_REGION[target[i]];
    if (acc.has(pr)) acc.get(pr)!.pred++;
    if (acc.has(tr)) acc.get(tr)!.tgt++;
    if (pr === tr && acc.has(pr)) acc.get(pr)!.inter++;
  }

  return regions.map((region) => {
    const { inter, pred, tgt } = acc.get(region)!;
    const dice = pred + tgt === 0 ? 1 : (2 * inter) / (pred + tgt);
    return { region, dice, intersection: inter, predictedArea: pred, targetArea: tgt };
  });
}

// Region Dice derived from the engine's per-class Dice array (water, fat,
// muscle, organ, bone). muscle+organ collapse into softTissue (their min — the
// conservative, honest estimate, since soft-tissue boundaries are the hard case).
export function regionDiceFromClassDice(classDice: number[]): RegionDiceScore[] {
  const d = (i: number) => classDice[i] ?? 0;
  const soft = Math.min(d(2), d(3));
  const mk = (region: Region, dice: number): RegionDiceScore => ({
    region,
    dice,
    intersection: 0,
    predictedArea: 0,
    targetArea: 0,
  });
  return [mk("fluid", d(0)), mk("fat", d(1)), mk("softTissue", soft), mk("bone", d(4))];
}

export function meanRegionDice(scores: RegionDiceScore[]): number {
  if (scores.length === 0) return 0;
  return scores.reduce((s, r) => s + r.dice, 0) / scores.length;
}

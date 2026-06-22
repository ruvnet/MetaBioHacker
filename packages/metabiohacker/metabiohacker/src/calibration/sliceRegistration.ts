// Slice registration V0: estimate how well a predicted body mask aligns to the
// target body mask, as a centroid-offset error in pixels. A full intensity- or
// landmark-based registration is future work; this is enough to drive the
// honesty gate (large misalignment => exclude from headline metrics).

export type Mask = { width: number; height: number; data: Uint8Array | number[] };

function centroid(mask: Mask): { cx: number; cy: number; area: number } {
  let sx = 0, sy = 0, area = 0;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[y * mask.width + x]) {
        sx += x;
        sy += y;
        area++;
      }
    }
  }
  return area ? { cx: sx / area, cy: sy / area, area } : { cx: mask.width / 2, cy: mask.height / 2, area: 0 };
}

export function estimateRegistrationErrorPx(predicted: Mask, target: Mask): number {
  const p = centroid(predicted);
  const t = centroid(target);
  if (p.area === 0 || t.area === 0) return Number.POSITIVE_INFINITY;
  return Math.hypot(p.cx - t.cx, p.cy - t.cy);
}

export type Registration = { dx: number; dy: number; errorPx: number; overlapDice: number };

// Dice overlap of mask `a` with mask `b` translated by (dx, dy).
function shiftedDice(a: Mask, b: Mask, dx: number, dy: number): number {
  let inter = 0, sa = 0, sb = 0;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const av = a.data[y * a.width + x] ? 1 : 0;
      const bx = x - dx, by = y - dy;
      const bv = bx >= 0 && by >= 0 && bx < b.width && by < b.height && b.data[by * b.width + bx] ? 1 : 0;
      sa += av;
      sb += bv;
      if (av && bv) inter++;
    }
  }
  return sa + sb === 0 ? 1 : (2 * inter) / (sa + sb);
}

// Rigid translation registration: find the integer offset that maximises the
// overlap Dice between the predicted body mask and the target mask. This is the
// foundational registration (landmark-based refinement is future work) and
// gives the honesty gate a real misalignment estimate instead of a proxy.
export function registerByTranslation(predicted: Mask, target: Mask, maxShift = 12): Registration {
  let best: Registration = { dx: 0, dy: 0, errorPx: 0, overlapDice: shiftedDice(target, predicted, 0, 0) };
  for (let dy = -maxShift; dy <= maxShift; dy++) {
    for (let dx = -maxShift; dx <= maxShift; dx++) {
      const dice = shiftedDice(target, predicted, dx, dy);
      if (dice > best.overlapDice) {
        best = { dx, dy, errorPx: Math.hypot(dx, dy), overlapDice: dice };
      }
    }
  }
  return best;
}

// A coarse boundary-complexity proxy (0..1): perimeter/area ratio of the target
// mask, normalised. Higher = more intricate soft-tissue boundaries = harder.
export function boundaryComplexity(target: Mask): number {
  let perimeter = 0, area = 0;
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < target.width && y < target.height ? target.data[y * target.width + x] : 0;
  for (let y = 0; y < target.height; y++) {
    for (let x = 0; x < target.width; x++) {
      if (!at(x, y)) continue;
      area++;
      if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) perimeter++;
    }
  }
  if (area === 0) return 1;
  // Circle has perimeter ~ 2*sqrt(pi*area); ratio>1 => more complex than a disk.
  const ideal = 2 * Math.sqrt(Math.PI * area);
  return Math.max(0, Math.min(1, perimeter / ideal - 0.5));
}

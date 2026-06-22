// Shared body geometry constants for the scanner scene.
// The procedural ghost uses these; a supplied GLB model overrides the *visual*
// body but never the physics (the Rust phantom remains ground truth).

// Torso radius (lathe units) at normalised height t in [0,1] (0 = pelvis).
export const TORSO_PROFILE = [
  [0.0, 0.5],
  [0.12, 0.7],
  [0.22, 0.64],
  [0.42, 0.55], // waist
  [0.62, 0.72],
  [0.8, 0.84], // chest
  [0.93, 0.92], // shoulders
  [1.0, 0.86],
];

// Human proportions: wider than deep.
export const SX = 1.28;
export const SZ = 0.82;

export function torsoRadius(t) {
  for (let i = 1; i < TORSO_PROFILE.length; i++) {
    if (t <= TORSO_PROFILE[i][0]) {
      const [t0, r0] = TORSO_PROFILE[i - 1];
      const [t1, r1] = TORSO_PROFILE[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return r0 + (r1 - r0) * f;
    }
  }
  return TORSO_PROFILE[TORSO_PROFILE.length - 1][1];
}

export const sliceY = (z, nz, spacing) => (z - (nz - 1) / 2) * spacing;

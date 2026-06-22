// Sonic Chamber design tokens — "luxury clinical sci-fi spa".
export const theme = {
  background: "#030711",
  chamberGlass: "#BFE9FF",
  chamberTint: "#4CC9F0",
  medicalWhite: "#F8FBFF",
  titanium: "#AAB7C4",
  deepNavy: "#07111F",
  cyan: "#38E8FF",
  blue: "#3A86FF",
  violet: "#9B5CFF",
  amber: "#FFB86B",
  gold: "#FFD166",
  danger: "#FF4D6D",
  success: "#5CFFB1",
  text: "#EAF7FF",
  mutedText: "#8EA7B8",
};

// Tissue → RGB (0..255). water transparent in the volume; others premium tones.
export const TISSUE_COLORS = [
  [20, 40, 80], // water  - deep navy (rendered transparent in the body volume)
  [255, 209, 102], // fat    - gold
  [255, 150, 90], // muscle - warm amber
  [155, 92, 255], // organ  - AI violet
  [240, 244, 250], // bone   - ivory
];

// Inferno-ish ramp for the speed channel.
const INFERNO = [
  [0.0, [4, 6, 24]],
  [0.3, [87, 16, 110]],
  [0.55, [188, 55, 84]],
  [0.8, [249, 142, 9]],
  [1.0, [252, 255, 200]],
];

function ramp(stops, t) {
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1];
      const [t1, c1] = stops[i];
      const f = (t - t0) / (t1 - t0 || 1);
      return [
        c0[0] + (c1[0] - c0[0]) * f,
        c0[1] + (c1[1] - c0[1]) * f,
        c0[2] + (c1[2] - c0[2]) * f,
      ];
    }
  }
  return stops[stops.length - 1][1];
}

export const infernoColor = (t) => ramp(INFERNO, t);

// Error heat: cyan (low) → amber → red (high).
export function errorColor(t) {
  return ramp(
    [
      [0.0, [20, 60, 90]],
      [0.4, [56, 232, 255]],
      [0.7, [255, 184, 107]],
      [1.0, [255, 77, 109]],
    ],
    t
  );
}

// Confidence: red (low) → cyan (high).
export function confidenceColor(t) {
  return ramp(
    [
      [0.0, [255, 77, 109]],
      [0.5, [255, 209, 102]],
      [1.0, [92, 255, 177]],
    ],
    t
  );
}

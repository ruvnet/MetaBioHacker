// Build per-slice RGBA DataTextures from a volume snapshot, one per channel.
import * as THREE from "three";
import { TISSUE_COLORS, infernoColor, errorColor, confidenceColor } from "./theme.js";

// Returns an array of length `nz`; entries beyond `builtCount` are null.
export function buildSliceTextures(vol, channel, builtCount) {
  const { n, nz, truthLabels, reconLabels, reconSpeed, error, confidenceVol } = vol;
  const cells = n * n;
  const out = new Array(nz).fill(null);

  for (let z = 0; z < Math.min(builtCount, nz); z++) {
    const base = z * cells;
    const rgba = new Uint8Array(cells * 4);
    for (let i = 0; i < cells; i++) {
      const inBody = truthLabels[base + i] !== 0;
      let r = 0, g = 0, b = 0, a = 0;
      switch (channel) {
        case "truth": {
          const c = TISSUE_COLORS[truthLabels[base + i]] || [0, 0, 0];
          [r, g, b] = c;
          a = inBody ? 255 : 0;
          break;
        }
        case "recon": {
          const lab = reconLabels[base + i];
          const c = TISSUE_COLORS[lab] || [0, 0, 0];
          [r, g, b] = c;
          a = lab !== 0 ? 255 : 0;
          break;
        }
        case "speed": {
          [r, g, b] = infernoColor(reconSpeed[base + i] / 255);
          a = inBody ? 235 : 0;
          break;
        }
        case "error": {
          [r, g, b] = errorColor(error[base + i] / 255);
          a = inBody ? 235 : 0;
          break;
        }
        case "confidence": {
          [r, g, b] = confidenceColor(confidenceVol[base + i] / 255);
          a = inBody ? 235 : 0;
          break;
        }
        default:
          a = 0;
      }
      rgba[i * 4] = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = a;
    }
    const tex = new THREE.DataTexture(rgba, n, n, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    out[z] = tex;
  }
  return out;
}

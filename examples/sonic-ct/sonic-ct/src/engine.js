// Loader + typed API for the raw-C-ABI sonic_ct WebAssembly module.
// Exposes both the single-slice pipeline and the progressive 3-D volume sweep.

const N_CLASSES = 5;

export class SonicCT {
  constructor(exports) {
    this.e = exports;
  }

  static async load(url = "sonic_ct.wasm") {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`failed to fetch ${url}: ${resp.status}`);
    const bytes = await resp.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    return new SonicCT(instance.exports);
  }

  _f32(ptr, len) {
    return new Float32Array(this.e.memory.buffer, ptr, len).slice();
  }
  _u8(ptr, len) {
    return new Uint8Array(this.e.memory.buffer, ptr, len).slice();
  }

  // --- single slice (used for the 2-D inspector) ---
  runSlice({ n = 96, elements = 180, fan = 90, iters = 6, seed = 1 } = {}) {
    const e = this.e;
    if (!e.sct_run(n >>> 0, elements >>> 0, fan >>> 0, iters >>> 0, seed >>> 0)) {
      throw new Error("sct_run failed");
    }
    const gn = e.sct_grid_n();
    const cells = gn * gn;
    const dice = new Float32Array(N_CLASSES);
    for (let c = 0; c < N_CLASSES; c++) dice[c] = e.sct_dice(c);
    return {
      n: gn,
      measurements: e.sct_measurements(),
      mae: e.sct_mae(),
      meanDice: e.sct_mean_dice(),
      dice,
      reconLabels: this._u8(e.sct_recon_labels_ptr(), cells),
      truthLabels: this._u8(e.sct_truth_labels_ptr(), cells),
    };
  }

  // --- progressive volume sweep ---
  volBegin({ nz = 24, n = 56, elements = 128, fan = 64, iters = 5, seed = 1 } = {}) {
    this.e.sct_vol_begin(nz >>> 0, n >>> 0, elements >>> 0, fan >>> 0, iters >>> 0, seed >>> 0);
    this._nz = nz;
    this._n = n;
  }

  // Build the next slice; returns slices completed so far.
  volStep() {
    return this.e.sct_vol_step();
  }

  volProgress() {
    const e = this.e;
    return { cursor: e.sct_vol_cursor(), nz: e.sct_vol_slices() };
  }

  // Snapshot every channel + metric (copies out of linear memory).
  volSnapshot() {
    const e = this.e;
    const n = e.sct_vol_n();
    const nz = e.sct_vol_slices();
    const total = n * n * nz;
    const fractions = new Float32Array(N_CLASSES);
    for (let c = 0; c < N_CLASSES; c++) fractions[c] = e.sct_vol_fraction(c);
    const elements = e.sct_vol_elements();
    return {
      n,
      nz,
      cursor: e.sct_vol_cursor(),
      measurements: e.sct_vol_measurements(),
      meanDice: e.sct_vol_mean_dice(),
      confidence: e.sct_vol_confidence(),
      worstSlice: e.sct_vol_worst_slice(),
      fractions,
      elements,
      ringXY: this._f32(e.sct_vol_ring_xy_ptr(), elements * 2),
      truthLabels: this._u8(e.sct_vol_truth_labels_ptr(), total),
      reconLabels: this._u8(e.sct_vol_recon_labels_ptr(), total),
      reconSpeed: this._u8(e.sct_vol_recon_speed_ptr(), total),
      error: this._u8(e.sct_vol_error_ptr(), total),
      confidenceVol: this._u8(e.sct_vol_confidence_ptr(), total),
      sliceDice: this._f32(e.sct_vol_slice_dice_ptr(), nz),
      sliceMae: this._f32(e.sct_vol_slice_mae_ptr(), nz),
      organs: this._organs(),
      qualityFlags: [0, 1, 2, 3].map((f) => e.sct_quality_flag(f)),
    };
  }

  _organs() {
    const e = this.e;
    const count = e.sct_organ_count();
    const out = [];
    for (let i = 0; i < count; i++) {
      const id = e.sct_organ_id(i);
      out.push({
        id,
        name: ORGAN_NAMES[id] || "unknown",
        confidence: e.sct_organ_conf(i),
        evidence: e.sct_organ_evidence(i),
      });
    }
    return out;
  }
}

export const ORGAN_NAMES = [
  "liver",
  "spleen",
  "left kidney",
  "right kidney",
  "aorta",
  "heart",
  "left lung",
  "right lung",
];

// Evidence bitmask labels (must match sonic_ct::organ EV_* constants).
export const EVIDENCE = [
  [1, "expected z-zone"],
  [2, "correct side"],
  [4, "plausible size"],
  [8, "posterior adjacency"],
  [16, "consistent across slices"],
];

export const TISSUE_NAMES = ["water", "fat", "muscle", "organ", "bone"];

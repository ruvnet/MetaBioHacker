// Fetch several real public anatomical CT slices and convert each to a grayscale
// PGM the Rust engine can ingest as a ground-truth phantom.
//
// Source: Wikimedia Commons CT images. The images themselves are NOT committed;
// they are fetched on demand and the derived low-resolution PGMs are written to
// public/benchmark/ (gitignored). Verify each file's license on Commons before
// any redistribution.
//
// Usage: node tools/fetchRealSlice.mjs [n]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const N = Number(process.argv[2] || 96);
const OUTDIR = path.join(__dirname, "..", "public", "benchmark");
fs.mkdirSync(OUTDIR, { recursive: true });

// Public CT slices on Wikimedia Commons (region keyed).
const IMAGES = [
  { key: "abdomen", file: "Axial-Abdomen(L200)(W600).jpg" },
  { key: "thorax", file: "CT-Thorax-5.0-B70f-Lungs.jpg" },
  { key: "pelvis", file: "Axial-Pelvis(L40)(W350).jpg" },
];

function toPgm(buf, n) {
  const img = jpeg.decode(buf, { useTArray: true });
  const side = Math.min(img.width, img.height);
  const ox = ((img.width - side) / 2) | 0;
  const oy = ((img.height - side) / 2) | 0;
  const gray = new Uint8Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let acc = 0, cnt = 0;
      const x0 = ox + (((x * side) / n) | 0);
      const x1 = ox + ((((x + 1) * side) / n) | 0);
      const y0 = oy + (((y * side) / n) | 0);
      const y1 = oy + ((((y + 1) * side) / n) | 0);
      for (let yy = y0; yy < y1; yy++)
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          acc += (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
          cnt++;
        }
      gray[y * n + x] = cnt ? Math.round(acc / cnt) : 0;
    }
  }
  const header = Buffer.from(`P5\n${n} ${n}\n255\n`, "ascii");
  const body = Buffer.alloc(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) body[y * n + x] = gray[(n - 1 - y) * n + x];
  return Buffer.concat([header, body]);
}

let ok = 0;
for (const { key, file } of IMAGES) {
  const url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn(`skip ${key}: HTTP ${resp.status}`);
      continue;
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.subarray(0, 3).toString("hex") !== "ffd8ff") {
      console.warn(`skip ${key}: not a JPEG`);
      continue;
    }
    const out = path.join(OUTDIR, `real_${key}.pgm`);
    fs.writeFileSync(out, toPgm(buf, N));
    console.log(`wrote ${out}`);
    ok++;
  } catch (e) {
    console.warn(`skip ${key}: ${e.message}`);
  }
}
console.log(`${ok}/${IMAGES.length} real slices ready (${N}x${N})`);

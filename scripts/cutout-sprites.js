// One-off: flood-fill the white background from the edges of each listed
// sprite and make those pixels transparent. Pixels only count as background
// if they're reachable from an edge through a chain of near-white pixels,
// so white details INSIDE the subject (shirts, teeth, eyes) stay opaque.
//
// Run: node scripts/cutout-sprites.js

const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const SPRITES = [
  "braovic1", "braovic2",
  "denis1", "denis2",
  "fixx1", "fixx2",
  "goran1", "goran2",
  "matija1", "matija2",
  "pasko1", "pasko2",
  "sandro1", "sandro2",
  "stipe1", "stipe2",
];

// Pixels with all three channels >= THRESHOLD count as "white enough" to
// belong to the background region. 230 catches JPEG-style near-white ringing
// without eating into skin tones.
const THRESHOLD = 230;

// After flood-filling, pixels ON the border of the removed region get their
// alpha softened by how close they were to pure white — this anti-aliases the
// cutout edge so you don't get a crunchy silhouette.
function softenEdgeAlpha(r, g, b) {
  const minC = Math.min(r, g, b);
  if (minC >= 250) return 0;           // pure white → fully transparent
  if (minC <= 200) return 255;         // clearly subject → fully opaque
  // Linear ramp 200..250 → 255..0
  return Math.round(255 - ((minC - 200) * 255) / 50);
}

async function processSprite(name) {
  const filePath = path.join("public/sprites", `${name}.png`);
  const img = sharp(filePath).ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const ch = info.channels; // 4 after ensureAlpha

  const visited = new Uint8Array(w * h);
  const queue = [];
  const pushIfWhite = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    const p = idx * ch;
    if (data[p] < THRESHOLD || data[p + 1] < THRESHOLD || data[p + 2] < THRESHOLD) return;
    visited[idx] = 1;
    queue.push(x, y);
  };

  // Seed from every edge pixel
  for (let x = 0; x < w; x++) { pushIfWhite(x, 0); pushIfWhite(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIfWhite(0, y); pushIfWhite(w - 1, y); }

  while (queue.length) {
    const y = queue.pop();
    const x = queue.pop();
    pushIfWhite(x + 1, y);
    pushIfWhite(x - 1, y);
    pushIfWhite(x, y + 1);
    pushIfWhite(x, y - 1);
  }

  // Write back, setting alpha=0 on flood-filled pixels. Also soften the
  // transition: any opaque pixel that has a flood-filled neighbour gets its
  // alpha ramped from how close to white it is.
  const out = Buffer.alloc(w * h * 4);
  let bgCount = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const src = idx * ch;
      const dst = idx * 4;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      if (visited[idx]) {
        out[dst + 3] = 0;
        bgCount++;
        continue;
      }
      // Edge-soften: if any 4-neighbour is background-visited, ramp alpha
      // by whiteness so the edge doesn't look cut with scissors.
      const nbrBg =
        (x > 0 && visited[idx - 1]) ||
        (x < w - 1 && visited[idx + 1]) ||
        (y > 0 && visited[idx - w]) ||
        (y < h - 1 && visited[idx + w]);
      if (nbrBg) {
        out[dst + 3] = softenEdgeAlpha(data[src], data[src + 1], data[src + 2]);
      } else {
        out[dst + 3] = data[src + 3];
      }
    }
  }

  const tmp = filePath + ".tmp";
  await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toFile(tmp);
  fs.renameSync(tmp, filePath);
  const pct = ((bgCount / (w * h)) * 100).toFixed(1);
  console.log(`${name.padEnd(12)} ${w}x${h} → ${pct}% removed`);
}

(async () => {
  for (const n of SPRITES) {
    try { await processSprite(n); }
    catch (e) { console.error(n, e.message); }
  }
})();

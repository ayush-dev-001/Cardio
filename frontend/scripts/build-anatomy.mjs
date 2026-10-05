/**
 * Build the runtime anatomy models (run after assets/3d/pipeline/*.py):
 *
 *   npm run build:anatomy -- <path-to-low_poly_male_body_base.glb>
 *
 * 1. heart: assets/3d/build/heart_raw.glb (labelled parts, decimetres, heart-centred)
 *    -> per-part simplification to a laptop-friendly budget, smooth normals, meshopt compression
 *    -> public/models/heart.glb
 * 2. torso: body base mesh (metres, Y-up, facing +Z) -> skin removed, cropped to the torso,
 *    moved so the heart sits at its anatomical position in the chest, decimetres, compressed
 *    -> public/models/torso.glb
 */
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, simplifyPrimitive, weld } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import { mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const HEART_RAW = resolve(root, "assets/3d/build/heart_raw.glb");
const OUT_DIR = resolve(here, "../public/models");
const BODY = process.argv[2];

/** Triangle budget per heart part (total ~125k; arteries kept relatively detailed). */
const BUDGET = {
  heart: 60000,
  aorta: 12000,
  venae_cavae: 6000,
  right_atrium: 9000,
  pulmonary_trunk: 6000,
  RCA: 14000,
  LAD: 8000,
  LCX: 8000,
  left_main: 1500,
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.encoder": MeshoptEncoder,
  "meshopt.decoder": MeshoptEncoder,
});
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
mkdirSync(OUT_DIR, { recursive: true });

/** Cardiothoracic ratio used to fit the torso to the heart (normal adult range ~0.42-0.50). */
const CARDIOTHORACIC_RATIO = 0.48;
let heartWidthDm = null; // heart-muscle width, measured before simplification

const triCount = (prim) => (prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION").getCount()) / 3;

// ----------------------------------------------------------------------------- heart
{
  const doc = await io.read(HEART_RAW);
  {
    const muscle = doc.getRoot().listNodes().find((n) => n.getName() === "heart").getMesh().listPrimitives()[0].getAttribute("POSITION");
    let lo = Infinity, hi = -Infinity;
    const el = [];
    for (let i = 0; i < muscle.getCount(); i++) [lo, hi] = [Math.min(lo, muscle.getElement(i, el)[0]), Math.max(hi, el[0])];
    heartWidthDm = hi - lo;
  }
  await doc.transform(weld());
  for (const node of doc.getRoot().listNodes()) {
    const name = node.getName();
    for (const prim of node.getMesh()?.listPrimitives() ?? []) {
      const before = triCount(prim);
      const target = BUDGET[name] ?? 5000;
      if (before > target) {
        simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: target / before, error: 0.004, lockBorder: false });
      }
      console.log(`heart/${name}: ${before} -> ${triCount(prim)} triangles`);
    }
  }
  // re-weld after simplification so meshopt can reorder/quantise/compress the primitives
  // no normals here: shared (welded) vertices compress far better; the viewer computes smooth normals on load
  await doc.transform(weld(), dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  const out = resolve(OUT_DIR, "heart.glb");
  await io.write(out, doc);
  console.log(`wrote ${out} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
}

// ----------------------------------------------------------------------------- torso
if (BODY) {
  const doc = await io.read(BODY);
  const node = doc.getRoot().listNodes().find((n) => n.getMesh());
  const prim = node.getMesh().listPrimitives()[0];
  const world = node.getWorldMatrix();
  const pos = prim.getAttribute("POSITION").getArray();
  const idx = prim.getIndices().getArray();

  // world-space positions in metres
  const P = new Float64Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const [x, y, z] = [pos[i], pos[i + 1], pos[i + 2]];
    P[i] = world[0] * x + world[4] * y + world[8] * z + world[12];
    P[i + 1] = world[1] * x + world[5] * y + world[9] * z + world[13];
    P[i + 2] = world[2] * x + world[6] * y + world[10] * z + world[14];
  }
  let H = -Infinity;
  for (let i = 1; i < P.length; i += 3) H = Math.max(H, P[i]);

  // landmarks from a horizontal slice through the chest. The arms hang in an A-pose and cross
  // this slice, so the torso half-width is where the largest gap in |x| starts (torso | gap | arm).
  const chestY = 0.715 * H;
  const slice = [];
  for (let i = 0; i < P.length; i += 3) if (Math.abs(P[i + 1] - chestY) < 0.015) slice.push(i);
  const xs = slice.map((i) => Math.abs(P[i])).sort((a, b) => a - b);
  let half = xs[xs.length - 1], gap = 0;
  for (let k = 1; k < xs.length; k++) if (xs[k] - xs[k - 1] > gap) [gap, half] = [xs[k] - xs[k - 1], xs[k - 1]];
  let zF = -Infinity, zB = Infinity;
  for (const i of slice) if (Math.abs(P[i]) <= half) [zF, zB] = [Math.max(zF, P[i + 2]), Math.min(zB, P[i + 2])];
  // heart centre: ~2 cm left of the midline, at the chest slice, ~40% of chest depth behind the front
  const heart = [0.02, chestY, zF - 0.4 * (zF - zB)];

  // keep the torso: hips to neck, arms cut at the shoulders
  const keep = (v) => P[v * 3 + 1] > 0.5 * H && P[v * 3 + 1] < 0.875 * H && Math.abs(P[v * 3]) < 1.37 * half; // shoulder stubs remain
  const tris = [];
  for (let t = 0; t < idx.length; t += 3) if (keep(idx[t]) && keep(idx[t + 1]) && keep(idx[t + 2])) tris.push(idx[t], idx[t + 1], idx[t + 2]);
  // The base mesh is a broad, stylised body; scale it about the heart so the heart spans a
  // normal cardiothoracic ratio of the chest width (instead of inflating the real-size heart).
  const chestWidthDm = 2 * half * 10;
  const fit = heartWidthDm / (CARDIOTHORACIC_RATIO * chestWidthDm);
  const used = [...new Set(tris)];
  const remap = new Map(used.map((v, k) => [v, k]));
  const outPos = new Float32Array(used.length * 3);
  used.forEach((v, k) => {
    for (let c = 0; c < 3; c++) outPos[k * 3 + c] = (P[v * 3 + c] - heart[c]) * 10 * fit; // metres -> dm, heart-centred, fitted
  });

  // rebuild a clean document with just the torso mesh
  const { Document } = await import("@gltf-transform/core");
  const out = new Document();
  const buf = out.createBuffer();
  const p = out.createPrimitive()
    .setAttribute("POSITION", out.createAccessor().setType("VEC3").setArray(outPos).setBuffer(buf))
    .setIndices(out.createAccessor().setType("SCALAR").setArray(new Uint32Array(tris.map((v) => remap.get(v)))).setBuffer(buf));
  const mesh = out.createMesh("torso").addPrimitive(p);
  out.createScene("torso").addChild(out.createNode("torso").setMesh(mesh));
  await out.transform(weld(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  const file = resolve(OUT_DIR, "torso.glb");
  await io.write(file, out);
  console.log(
    `torso: body height ${H.toFixed(2)} m, chest half-width ${half.toFixed(3)} m, depth ${(zF - zB).toFixed(3)} m,`,
    `heart centre ${heart.map((v) => v.toFixed(3)).join(", ")} m; ${tris.length / 3} triangles;`,
    `heart width ${heartWidthDm.toFixed(2)} dm -> torso scaled x${fit.toFixed(3)} for CTR ${CARDIOTHORACIC_RATIO}`,
  );
  console.log(`wrote ${file} (${(statSync(file).size / 1024).toFixed(0)} KB)`);
}

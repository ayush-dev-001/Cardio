import { BufferAttribute, type BufferGeometry, Color, type Matrix4, Vector3 } from "three";

/**
 * Supply-territory shading: tints the heart muscle near each coronary artery with that artery's
 * risk colour. It shows WHICH muscle each artery typically supplies (proximity to the artery path,
 * Gaussian fall-off), not where a lesion is: the model predicts per-vessel status only.
 */

const _a = new Vector3();
const _ab = new Vector3();
const _ap = new Vector3();

/** Shortest distance from p to a polyline. */
export function distanceToPath(p: Vector3, path: Vector3[]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    _a.copy(path[i]);
    _ab.subVectors(path[i + 1], _a);
    _ap.subVectors(p, _a);
    const len2 = _ab.lengthSq();
    const t = len2 > 0 ? Math.min(1, Math.max(0, _ap.dot(_ab) / len2)) : 0;
    const d = _ap.sub(_ab.multiplyScalar(t)).length();
    if (d < best) best = d;
  }
  return best;
}

/**
 * Per-vertex territory weight of each path (row-major: vertex i, path k -> i * nPaths + k).
 * Vertices are transformed by `matrix` into the space of the paths first.
 */
export function territoryWeights(geom: BufferGeometry, matrix: Matrix4, paths: Vector3[][], sigma: number): Float32Array {
  const pos = geom.getAttribute("position");
  const out = new Float32Array(pos.count * paths.length);
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
    for (let k = 0; k < paths.length; k++) {
      const d = distanceToPath(v, paths[k]);
      out[i * paths.length + k] = Math.exp(-(d * d) / (sigma * sigma));
    }
  }
  return out;
}

/**
 * Writes vertex colours: base colour blended towards the vessels' risk colours. How much a vertex
 * is tinted follows its strongest territory weight (capped by `strength`, 0..1); which colour it
 * gets is a mix of the vessels weighted by weight^`sharpness`, so neighbouring territories meet in
 * a fairly crisp border instead of averaging into one colour. Unknown risk (null) is skipped.
 */
export function paintTerritories(
  geom: BufferGeometry,
  weights: Float32Array,
  base: Color,
  colors: (Color | null)[],
  strength: number,
  sharpness = 4,
): void {
  const n = geom.getAttribute("position").count;
  const k = colors.length;
  let attr = geom.getAttribute("color") as BufferAttribute | undefined;
  if (!attr || attr.count !== n) {
    attr = new BufferAttribute(new Float32Array(n * 3), 3);
    geom.setAttribute("color", attr);
  }
  const arr = attr.array as Float32Array;
  for (let i = 0; i < n; i++) {
    let sw = 0, r = 0, g = 0, b = 0, top = 0;
    for (let j = 0; j < k; j++) {
      const c = colors[j];
      if (!c) continue;
      const raw = weights[i * k + j];
      if (raw > top) top = raw;
      const w = Math.pow(raw, sharpness);
      sw += w;
      r += w * c.r;
      g += w * c.g;
      b += w * c.b;
    }
    const mix = top * strength;
    const inv = sw > 0 ? 1 / sw : 0;
    arr[i * 3] = base.r + (r * inv - base.r) * mix;
    arr[i * 3 + 1] = base.g + (g * inv - base.g) * mix;
    arr[i * 3 + 2] = base.b + (b * inv - base.b) * mix;
  }
  attr.needsUpdate = true;
}

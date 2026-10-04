/**
 * Parametric heart surface in heart-local coordinates.
 *
 * Long axis = y (base at y = +1, apex at y = -1.3). Angle `a` (degrees) runs around the long
 * axis: 0 = anterior (+z), +90 = patient's left (+x), 180 = posterior, -90 = patient's right.
 * Shape features: tapered ventricles with a rounded apex, an atrioventricular (coronary) groove,
 * anterior/posterior interventricular grooves, a right-ventricular bulge and atrial bulges.
 * The same function places the coronary arteries, so vessels always lie in the grooves.
 */

export type Vec3 = [number, number, number];

export const T_GROOVE = 0.27; // atrioventricular groove position along the long axis
const DEG = Math.PI / 180;

const gauss = (x: number, w: number) => Math.exp(-((x / w) ** 2));
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
/** Signed smallest difference between two angles in degrees, in (-180, 180]. */
export const angleDiff = (a: number, b: number) => {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
};

/** Radius of the surface at long-axis position t (0..1) and angle a (degrees). */
export function heartRadius(t: number, a: number): number {
  const tt = Math.min(1, Math.max(0, t));
  // base profile: dome over the atria, widest just below the AV groove, rounded apex
  let r = 0.95 * Math.pow(Math.sin(Math.PI * Math.pow(tt, 0.8)), 0.62);

  const ventricle = smoothstep(0.26, 0.38, tt) * (1 - smoothstep(0.82, 0.98, tt));
  const atria = 1 - smoothstep(0.18, 0.3, tt);

  r *= 1 - 0.08 * gauss(tt - T_GROOVE, 0.035); // AV groove
  r *= 1 + 0.12 * gauss(angleDiff(a, -45), 48) * ventricle; // right-ventricular bulge (anterior-right)
  r *= 1 + 0.05 * gauss(angleDiff(a, 120), 60) * ventricle; // left-ventricular lateral wall
  r *= 1 - 0.045 * gauss(angleDiff(a, 18), 9) * ventricle; // anterior interventricular groove
  r *= 1 - 0.045 * gauss(angleDiff(a, -180), 10) * ventricle; // posterior interventricular groove
  r *= 1 - 0.07 * gauss(angleDiff(a, -150), 55) * ventricle * smoothstep(0.4, 0.8, tt); // flat diaphragmatic surface
  r *= 1 + 0.1 * gauss(angleDiff(a, -105), 45) * atria; // right atrium / auricle
  r *= 1 + 0.08 * gauss(angleDiff(a, 140), 50) * atria; // left atrium
  return r;
}

export function heartPoint(t: number, a: number): Vec3 {
  const r = heartRadius(t, a);
  const y = 1.0 - 2.3 * t;
  return [r * Math.sin(a * DEG), y, r * Math.cos(a * DEG)];
}

const sub = (p: Vec3, q: Vec3): Vec3 => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const cross = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
export const length = (p: Vec3) => Math.hypot(p[0], p[1], p[2]);
const normalize = (p: Vec3): Vec3 => {
  const l = length(p) || 1;
  return [p[0] / l, p[1] / l, p[2] / l];
};

/** Outward unit normal (finite differences of the parametric surface). */
export function heartNormal(t: number, a: number): Vec3 {
  const e = 1e-3;
  const tc = Math.min(1 - e, Math.max(e, t));
  const dt = sub(heartPoint(tc + e, a), heartPoint(tc - e, a));
  const da = sub(heartPoint(tc, a + 0.1), heartPoint(tc, a - 0.1));
  let n = normalize(cross(da, dt));
  const p = heartPoint(tc, a);
  const radial: Vec3 = [p[0], 0, p[2]];
  if (n[0] * radial[0] + n[2] * radial[2] < 0) n = [-n[0], -n[1], -n[2]];
  return n;
}

/** Point lifted `lift` units off the surface along the normal (vessel centre-line). */
export function surfacePoint(t: number, a: number, lift = 0): Vec3 {
  const p = heartPoint(t, a);
  const n = heartNormal(t, a);
  return [p[0] + n[0] * lift, p[1] + n[1] * lift, p[2] + n[2] * lift];
}

/** Centripetal-free uniform Catmull-Rom interpolation of [t, a] control points. */
function catmullRom(points: [number, number][], samplesPerSpan: number): [number, number][] {
  if (points.length < 2) return points.slice();
  // unwrap angles so a path never jumps across +-180
  const pts = points.map((p) => [p[0], p[1]] as [number, number]);
  for (let i = 1; i < pts.length; i++) pts[i][1] = pts[i - 1][1] + angleDiff(pts[i][1], pts[i - 1][1]);
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < samplesPerSpan; s++) {
      const u = s / samplesPerSpan, u2 = u * u, u3 = u2 * u;
      const f = (k: 0 | 1) =>
        0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Sample a vessel centre-line: interpolate in surface (t, a) space, then project onto the
 * lifted surface, so the vessel hugs the heart instead of cutting through it.
 */
export function sampleVesselPath(points: [number, number][], lift: number, from: Vec3[] = [], samplesPerSpan = 12): Vec3[] {
  const surface = catmullRom(points, samplesPerSpan).map(([t, a]) => surfacePoint(t, a, lift));
  return [...from, ...surface];
}

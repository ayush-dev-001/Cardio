/**
 * Joins the shared vessel registry (shared/vessels.json, also used by the backend) with the
 * 3D anatomy config, and pre-computes vessel geometry in heart-local coordinates.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import vesselsJson from "@shared/vessels.json";
import anatomyJson from "../config/anatomy.json";
import { heartNormal, length, sampleVesselPath, type Vec3 } from "./heartSurface";

export interface VesselInfo {
  id: string;
  name: string;
  target_id: string;
  supplies: string;
}

interface SegmentConfig {
  id: string;
  name: string;
  radius: number;
  main?: boolean;
  from?: number[][];
  points: number[][];
}

export interface VesselSegment {
  id: string;
  name: string;
  radius: number;
  main: boolean;
  path: Vec3[]; // heart-local centre-line
}

export interface VesselGeometry {
  info: VesselInfo;
  segments: VesselSegment[];
  nodes: Vec3[]; // risk-coloured markers along the main segment
  focus: { point: Vec3; normal: Vec3 }; // heart-local centroid and outward direction
  labelAt: Vec3; // label anchor, pushed off the surface so labels of different vessels separate
}

export const VESSELS: VesselInfo[] = vesselsJson.vessels;
export const VESSEL_IDS: string[] = VESSELS.map((v) => v.id);
export const ANATOMY = anatomyJson;

const toPath = (s: SegmentConfig): VesselSegment => ({
  id: s.id,
  name: s.name,
  radius: s.radius,
  main: Boolean(s.main),
  path: sampleVesselPath(
    s.points.map((p) => [p[0], p[1]] as [number, number]),
    s.radius * 0.75,
    (s.from ?? []).map((p) => [p[0], p[1], p[2]] as Vec3),
  ),
});

/** Evenly spaced points (by arc length) along a poly-line, excluding the very ends. */
export function pointsAlong(path: Vec3[], n: number): Vec3[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    const d: Vec3 = [path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]];
    cum.push(cum[i - 1] + length(d));
  }
  const total = cum[cum.length - 1];
  return Array.from({ length: n }, (_, k) => {
    const target = ((k + 0.5) / n) * total;
    let i = cum.findIndex((c) => c >= target);
    i = Math.max(1, i);
    const u = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1);
    const a = path[i - 1], b = path[i];
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u] as Vec3;
  });
}

function buildVessel(info: VesselInfo): VesselGeometry {
  const cfg = (ANATOMY.vessels as Record<string, { segments: SegmentConfig[] } | undefined>)[info.id];
  if (!cfg) throw new Error(`No 3D anatomy defined for vessel ${info.id} (src/config/anatomy.json)`);
  const segments = cfg.segments.map(toPath);
  const main = segments.find((s) => s.main) ?? segments[0];
  const nodes = pointsAlong(main.path, ANATOMY.nodesPerVessel);

  // focus: centroid of the vessel's surface control points, viewed along their mean normal
  const ctrl = cfg.segments.flatMap((s) => s.points);
  const sum = (vs: Vec3[]) => vs.reduce<Vec3>((acc, v) => [acc[0] + v[0], acc[1] + v[1], acc[2] + v[2]], [0, 0, 0]);
  const allPts = segments.flatMap((s) => s.path);
  const c = sum(allPts);
  const point: Vec3 = [c[0] / allPts.length, c[1] / allPts.length, c[2] / allPts.length];
  const nsum = sum(ctrl.map((p) => heartNormal(p[0], p[1])));
  const nl = length(nsum) || 1;
  const normal: Vec3 = [nsum[0] / nl, nsum[1] / nl, nsum[2] / nl];
  const labelAt: Vec3 = [point[0] + normal[0] * 0.6, point[1] + normal[1] * 0.6, point[2] + normal[2] * 0.6];
  return { info, segments, nodes, focus: { point, normal }, labelAt };
}

export const VESSEL_GEOMETRY: VesselGeometry[] = VESSELS.map(buildVessel);

export const NEUTRAL_SEGMENTS: VesselSegment[] = (ANATOMY.neutral as SegmentConfig[]).map(toPath);

/** Heart-local -> world transform (same values as the rendered <group>). */
export function heartMatrix(): Matrix4 {
  const { position, rotationDeg, scale } = ANATOMY.heart;
  const e = new Euler(...(rotationDeg.map((d) => (d * Math.PI) / 180) as [number, number, number]));
  return new Matrix4().compose(new Vector3(...(position as Vec3)), new Quaternion().setFromEuler(e), new Vector3(scale, scale, scale));
}

/** Camera target/position that frames a vessel from outside the heart. */
export function vesselCameraPose(v: VesselGeometry, distance = 3.1): { target: Vector3; position: Vector3 } {
  const m = heartMatrix();
  const target = new Vector3(...v.focus.point).applyMatrix4(m);
  const normal = new Vector3(...v.focus.normal).transformDirection(m);
  // lean the view slightly towards the front so posterior vessels are not seen through the spine
  const dir = normal.clone().add(new Vector3(0, 0.15, 0.35)).normalize();
  return { target, position: target.clone().add(dir.multiplyScalar(distance)) };
}

import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import vesselsJson from "@shared/vessels.json";
import { ANATOMY, VESSEL_GEOMETRY, VESSEL_IDS, heartMatrix, pointsAlong, vesselCameraPose } from "./anatomy";
import { heartGeometry } from "./heartMesh";
import { heartPoint, heartRadius, surfacePoint, angleDiff } from "./heartSurface";
import { RISK_STOPS, riskColor, riskLabel } from "./riskColor";

describe("shared vessel registry <-> 3D anatomy", () => {
  it("every shared vessel has 3D anatomy and vice versa", () => {
    const shared = vesselsJson.vessels.map((v) => v.id).sort();
    expect(Object.keys(ANATOMY.vessels).sort()).toEqual(shared);
    expect([...VESSEL_IDS].sort()).toEqual(shared);
  });

  it("vessel ids map to the model target ids used by the backend", () => {
    for (const v of vesselsJson.vessels) expect(v.target_id).toBe(v.id.toLowerCase());
  });

  it("each vessel has exactly one main segment and risk nodes on it", () => {
    for (const v of VESSEL_GEOMETRY) {
      expect(v.segments.filter((s) => s.main)).toHaveLength(1);
      expect(v.nodes).toHaveLength(ANATOMY.nodesPerVessel);
    }
  });
});

describe("risk colour scale", () => {
  it("maps the end points and midpoint to the configured stops", () => {
    expect(riskColor(0)).toBe(RISK_STOPS[0].color);
    expect(riskColor(0.5)).toBe("#f59e0b");
    expect(riskColor(1)).toBe(RISK_STOPS[RISK_STOPS.length - 1].color);
  });

  it("clamps out-of-range and invalid input", () => {
    expect(riskColor(-3)).toBe(riskColor(0));
    expect(riskColor(7)).toBe(riskColor(1));
    expect(riskColor(Number.NaN)).toBe(riskColor(0));
  });

  it("gets redder as probability rises", () => {
    const red = (p: number) => parseInt(riskColor(p).slice(1, 3), 16);
    const green = (p: number) => parseInt(riskColor(p).slice(3, 5), 16);
    expect(red(0.25)).toBeGreaterThan(red(0));
    expect(green(1)).toBeLessThan(green(0.5));
    expect([riskLabel(0.1), riskLabel(0.5), riskLabel(0.9)]).toEqual(["Low", "Moderate", "High"]);
  });
});

describe("heart surface geometry", () => {
  it("has a closed shape: base on top, apex at the bottom", () => {
    expect(heartRadius(0, 0)).toBeLessThan(0.05);
    expect(heartRadius(1, 0)).toBeLessThan(0.05);
    expect(heartRadius(0.45, 0)).toBeGreaterThan(0.7);
    expect(heartPoint(0, 0)[1]).toBeGreaterThan(heartPoint(1, 0)[1]);
  });

  it("wraps angles correctly", () => {
    expect(angleDiff(170, -170)).toBe(-20);
    expect(angleDiff(-170, 170)).toBe(20);
  });

  it("mesh normals point outwards (front faces visible, clicks not passing through)", () => {
    const g = heartGeometry();
    const pos = g.getAttribute("position"), nrm = g.getAttribute("normal");
    let outward = 0;
    for (let i = 0; i < pos.count; i++) {
      const radial = new Vector3(pos.getX(i), 0, pos.getZ(i));
      if (radial.length() < 0.2) continue; // skip the poles
      if (radial.dot(new Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i))) > 0) outward++;
      else outward--;
    }
    expect(outward).toBeGreaterThan(0.95 * pos.count * 0.9);
  });
});

describe("coronary paths", () => {
  const byId = Object.fromEntries(VESSEL_GEOMETRY.map((v) => [v.info.id, v]));
  const mainPath = (id: string) => byId[id].segments.find((s) => s.main)!.path;

  it("vessels hug the heart surface (centre-line just above it)", () => {
    for (const v of VESSEL_GEOMETRY) {
      const cfg = (ANATOMY.vessels as Record<string, { segments: { points: number[][]; radius: number }[] }>)[v.info.id];
      for (const seg of cfg.segments)
        for (const [t, a] of seg.points) {
          const onSurface = heartPoint(t, a), lifted = surfacePoint(t, a, seg.radius * 0.75);
          const gap = new Vector3(...lifted).distanceTo(new Vector3(...onSurface));
          expect(gap).toBeCloseTo(seg.radius * 0.75, 5);
        }
    }
  });

  it("follows typical anatomy: LAD anterior, RCA on the right, LCX on the left", () => {
    const frac = (path: number[][], pred: (p: number[]) => boolean) => path.filter(pred).length / path.length;
    expect(frac(mainPath("LAD"), (p) => p[2] > 0)).toBeGreaterThan(0.8); // anterior (+z)
    expect(frac(mainPath("RCA"), (p) => p[0] < 0.05)).toBeGreaterThan(0.8); // patient's right (-x)
    expect(frac(mainPath("LCX"), (p) => p[0] > 0)).toBeGreaterThan(0.8); // patient's left (+x)
    // the LAD descends towards the apex
    const lad = mainPath("LAD");
    expect(lad[lad.length - 1][1]).toBeLessThan(lad[0][1] - 1.2);
  });

  it("all generated coordinates are finite", () => {
    for (const v of VESSEL_GEOMETRY) {
      for (const p of [...v.segments.flatMap((s) => s.path), ...v.nodes, v.labelAt, v.focus.point, v.focus.normal])
        expect(p.every(Number.isFinite)).toBe(true);
    }
  });

  it("evenly spaces nodes along a path", () => {
    const pts = pointsAlong([[0, 0, 0], [10, 0, 0]], 5);
    expect(pts.map((p) => p[0])).toEqual([1, 3, 5, 7, 9]);
  });

  it("vessel focus cameras sit outside the heart", () => {
    const centre = new Vector3(...(ANATOMY.heart.position as [number, number, number]));
    const heartSize = 1.3 * ANATOMY.heart.scale * 1.2;
    for (const v of VESSEL_GEOMETRY) {
      const { position, target } = vesselCameraPose(v);
      expect(position.distanceTo(centre)).toBeGreaterThan(heartSize);
      expect(target.distanceTo(centre)).toBeLessThan(heartSize * 1.5);
    }
    expect(heartMatrix().determinant()).toBeGreaterThan(0);
  });
});

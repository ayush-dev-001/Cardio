import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import vesselsJson from "@shared/vessels.json";
import landmarksJson from "../config/anatomy.landmarks.json";
import { MODEL, SCENE_ANATOMY, cameraPoseFor } from "./sceneAnatomy";

/** Node names inside a GLB (read from its JSON chunk). */
function glbNodeNames(path: string): string[] {
  const buf = readFileSync(path);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  return (json.nodes ?? []).map((n: { name?: string }) => n.name ?? "");
}

const ids = vesselsJson.vessels.map((v) => v.id);
const landmarks = landmarksJson as { vessels: Record<string, { trunk: number[][] }> };

describe("realistic anatomy model", () => {
  it("maps every shared vessel id to glTF meshes that exist in heart.glb", () => {
    const names = glbNodeNames(`public${MODEL.heart}`);
    const map = MODEL.vesselMeshes as Record<string, string[]>;
    expect(Object.keys(map).sort()).toEqual([...ids].sort());
    for (const id of ids) for (const node of map[id]) expect(names).toContain(node);
    for (const part of Object.keys(MODEL.parts)) expect(names).toContain(part);
  });

  it("has a generated trunk centre-line for every vessel", () => {
    for (const id of ids) {
      const trunk = landmarks.vessels[id]?.trunk;
      expect(trunk && trunk.length).toBeGreaterThanOrEqual(10);
      expect(trunk.flat().every(Number.isFinite)).toBe(true);
    }
  });

  it("follows typical anatomy (+x patient's left, +z anterior): LAD anterior, RCA right, LCX left", () => {
    const mean = (id: string, k: number) => landmarks.vessels[id].trunk.reduce((s, p) => s + p[k], 0) / landmarks.vessels[id].trunk.length;
    expect(mean("LAD", 2)).toBeGreaterThan(0); // anterior
    expect(mean("RCA", 0)).toBeLessThan(mean("LAD", 0)); // RCA to the patient's right of the LAD
    expect(mean("LCX", 0)).toBeGreaterThan(0); // patient's left
  });

  it("places risk nodes, separated labels and camera poses for each vessel", () => {
    const a = SCENE_ANATOMY.model;
    expect(a.vessels.map((v) => v.info.id)).toEqual(ids);
    for (const v of a.vessels) {
      expect(v.nodes.length).toBeGreaterThan(0);
      const pose = cameraPoseFor(v);
      expect(pose.position.length()).toBeGreaterThan(1.0); // camera outside the heart
    }
    for (let i = 0; i < a.vessels.length; i++)
      for (let j = i + 1; j < a.vessels.length; j++)
        expect(a.vessels[i].labelAt.distanceTo(a.vessels[j].labelAt)).toBeGreaterThan(0.3);
  });

  it("keeps a working procedural fallback with the same vessel ids", () => {
    expect(SCENE_ANATOMY.procedural.vessels.map((v) => v.info.id)).toEqual(ids);
  });
});

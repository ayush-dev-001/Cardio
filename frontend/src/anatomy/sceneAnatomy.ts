/**
 * Renderer-independent description of the vessels in the scene (world coordinates): where the
 * risk nodes sit, where the label is anchored and how the camera frames each vessel. Both the
 * realistic glTF model and the procedural fallback provide one, so labels, selection and the
 * camera behave identically whichever anatomy is shown.
 */
import { Vector3 } from "three";
import landmarksJson from "../config/anatomy.landmarks.json";
import { ANATOMY, VESSELS, VESSEL_GEOMETRY, heartMatrix, pointsAlong, type VesselInfo } from "./anatomy";
import type { Vec3 } from "./heartSurface";

export interface SceneVessel {
  info: VesselInfo;
  nodes: Vec3[];
  /** Centre line of the artery's main trunk (used for supply-territory shading). */
  path: Vec3[];
  labelAt: Vector3;
  focus: { point: Vector3; normal: Vector3 };
}

export interface SceneAnatomy {
  kind: "model" | "procedural";
  vessels: SceneVessel[];
  home: { position: Vector3; target: Vector3 };
}

export type Renderer = "model" | "procedural";
export const CONFIGURED_RENDERER: Renderer = ANATOMY.renderer === "procedural" ? "procedural" : "model";
export const MODEL = ANATOMY.model;

const landmarks = landmarksJson as { vessels: Record<string, { trunk: number[][] }> };

function modelAnatomy(): SceneAnatomy {
  const vessels = VESSELS.map((info) => {
    const lm = landmarks.vessels[info.id];
    if (!lm) throw new Error(`No 3D landmarks for vessel ${info.id} (anatomy.landmarks.json)`);
    const trunk = lm.trunk.map((p) => [p[0], p[1], p[2]] as Vec3);
    // skip the first ~10% (ostium, inside the aortic root) when placing the risk nodes
    const nodes = pointsAlong(trunk.slice(Math.floor(trunk.length * 0.1)), ANATOMY.nodesPerVessel);
    const c = trunk.reduce((a, p) => a.add(new Vector3(...p)), new Vector3()).divideScalar(trunk.length);
    const normal = c.clone().normalize(); // the heart is centred on the origin
    // label anchored at a characteristic point along the trunk (config "labelAlong"), pushed outwards
    const along = (MODEL.labelAlong as Record<string, number>)[info.id] ?? 0.5;
    const anchor = new Vector3(...trunk[Math.min(trunk.length - 1, Math.round(along * (trunk.length - 1)))]);
    return {
      info,
      nodes,
      path: trunk.slice(Math.floor(trunk.length * 0.1)),
      labelAt: anchor.add(anchor.clone().normalize().multiplyScalar(0.35)),
      focus: { point: c, normal },
    };
  });
  const cam = MODEL.camera;
  return {
    kind: "model",
    vessels,
    home: { position: new Vector3(...(cam.position as Vec3)), target: new Vector3(...(cam.target as Vec3)) },
  };
}

function proceduralAnatomy(): SceneAnatomy {
  const m = heartMatrix();
  return {
    kind: "procedural",
    vessels: VESSEL_GEOMETRY.map((v) => ({
      info: v.info,
      nodes: v.nodes,
      path: v.nodes,
      labelAt: new Vector3(...v.labelAt).applyMatrix4(m),
      focus: { point: new Vector3(...v.focus.point).applyMatrix4(m), normal: new Vector3(...v.focus.normal).transformDirection(m) },
    })),
    home: { position: new Vector3(0.55, 0.95, 4.9), target: new Vector3(0.25, 0.4, 0.1) },
  };
}

export const SCENE_ANATOMY: Record<Renderer, SceneAnatomy> = {
  model: modelAnatomy(),
  procedural: proceduralAnatomy(),
};

/** Camera target/position that frames a vessel from outside the heart. */
export function cameraPoseFor(v: SceneVessel, distance = 2.6): { target: Vector3; position: Vector3 } {
  // lean slightly towards the front so posterior vessels are not viewed through the spine
  const dir = v.focus.normal.clone().add(new Vector3(0, 0.15, 0.35)).normalize();
  return { target: v.focus.point.clone(), position: v.focus.point.clone().add(dir.multiplyScalar(distance)) };
}

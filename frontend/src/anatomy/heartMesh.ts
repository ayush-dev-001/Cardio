import { Vector3 } from "three";
import { ParametricGeometry } from "three/addons/geometries/ParametricGeometry.js";
import { heartPoint } from "./heartSurface";

/** Heart mesh. Angle runs 180 -> -180 so triangles wind counter-clockwise seen from outside
 * (outward normals; front faces visible). Verified by a unit test. */
export function heartGeometry() {
  // u -> angle around the long axis, v -> base (0) to apex (1)
  const g = new ParametricGeometry(
    (u: number, v: number, target: Vector3) => {
      const [x, y, z] = heartPoint(v, 180 - u * 360);
      target.set(x, y, z);
    },
    96,
    72,
  );
  g.computeVertexNormals();
  return g;
}

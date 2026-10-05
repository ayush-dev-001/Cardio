import { useMemo } from "react";
import { AdditiveBlending, CatmullRomCurve3, Color, DoubleSide, LatheGeometry, ShaderMaterial, TubeGeometry, Vector2, Vector3 } from "three";

/** (radius, height) profile of a stylised torso, revolved and flattened front-to-back. */
const PROFILE: [number, number][] = [
  [1.3, -3.2], [1.24, -2.5], [1.28, -1.7], [1.42, -0.9], [1.52, -0.1], [1.58, 0.7],
  [1.63, 1.35], [1.58, 1.85], [1.3, 2.15], [0.82, 2.35], [0.5, 2.5], [0.42, 2.75], [0.42, 3.3],
];
const DEPTH = 0.62; // z scale (chest is flatter front-to-back than side-to-side)

const torsoRadiusAt = (y: number) => {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [r0, y0] = PROFILE[i], [r1, y1] = PROFILE[i + 1];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return PROFILE[PROFILE.length - 1][0];
};

/** Fresnel "x-ray" shell: transparent face-on, glowing at grazing angles. Very cheap. */
export function makeShellMaterial(color: string, base: number, rim: number) {
  return new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uBase: { value: base }, uRim: { value: rim } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uBase; uniform float uRim;
      varying vec3 vN; varying vec3 vV;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        gl_FragColor = vec4(uColor, uBase + uRim * f);
      }`,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
  });
}

function ribGeometries(): TubeGeometry[] {
  const out: TubeGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const yBack = 1.75 - i * 0.3;
    const drop = 0.38 + i * 0.02;
    const frontGap = 14 + i * 4; // lower ribs end further from the sternum
    for (const side of [1, -1]) {
      const pts: Vector3[] = [];
      for (let k = 0; k <= 24; k++) {
        const deg = 172 - ((172 - frontGap) * k) / 24; // back (near spine) -> front
        const th = (deg * Math.PI) / 180;
        const y = yBack - drop * (1 - deg / 180);
        const rx = torsoRadiusAt(y) * 0.86;
        pts.push(new Vector3(side * rx * Math.sin(th), y, rx * DEPTH * 0.92 * Math.cos(th)));
      }
      out.push(new TubeGeometry(new CatmullRomCurve3(pts), 40, 0.035, 5, false));
    }
  }
  return out;
}

export function Torso() {
  const shell = useMemo(() => new LatheGeometry(PROFILE.map(([r, y]) => new Vector2(r, y)), 64), []);
  const shellMat = useMemo(() => makeShellMaterial("#7dd3fc", 0.015, 0.42), []);
  const lungMat = useMemo(() => makeShellMaterial("#fda4af", 0.01, 0.22), []);
  const ribs = useMemo(ribGeometries, []);
  const spineZ = -torsoRadiusAt(0.5) * DEPTH * 0.78;

  return (
    <group>
      <mesh geometry={shell} material={shellMat} scale={[1, 1, DEPTH]} renderOrder={10} />
      {/* lungs */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.78, 0.75, -0.05]} scale={[0.6, 1.2, 0.62]} material={lungMat} renderOrder={5}>
          <sphereGeometry args={[1, 32, 24]} />
        </mesh>
      ))}
      {/* ribs, sternum, spine */}
      {ribs.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.13} depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, 1.25, torsoRadiusAt(1.2) * DEPTH * 0.86]}>
        <boxGeometry args={[0.2, 1.3, 0.06]} />
        <meshBasicMaterial color="#e2e8f0" transparent opacity={0.13} depthWrite={false} />
      </mesh>
      {Array.from({ length: 19 }, (_, i) => (
        <mesh key={i} position={[0, -2.9 + i * 0.3, spineZ]}>
          <cylinderGeometry args={[0.11, 0.11, 0.2, 10]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.12} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

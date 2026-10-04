# Phase 3: 3D anatomy viewer

React Three Fiber scene in `frontend/src/scene/`, driven by mock probabilities until the API is
connected (Phase 6).

## What is shown
- **Torso:** a semi-transparent "x-ray" shell. It uses a cheap shader that glows where the surface
  is seen edge-on, and contains faint ribs, sternum, spine and lungs for spatial context.
- **Heart:** a procedural parametric surface (`src/anatomy/heartSurface.ts`) with base and apex, the
  groove between atria and ventricles, the front and back grooves between the ventricles, a
  right-ventricular bulge and the atria. It is oriented as in the chest: apex down, to the
  patient's left and forward, with the right ventricle facing the front. Aorta, pulmonary trunk
  and superior vena cava are drawn as neutral tubes.
- **Coronary arteries** (typical right-dominant anatomy). Each one carries 6 risk-coloured nodes:

  | Vessel | Main course | Branches drawn |
  |---|---|---|
  | LAD | front groove between the ventricles, down to the apex | diagonals D1, D2 |
  | LCX | left groove between atrium and ventricle, around to the back | obtuse marginals OM1, OM2 |
  | RCA | right groove between atrium and ventricle, to the back of the heart | acute marginal, posterior descending (PDA) |

  The left main trunk is drawn in neutral grey because it is not a prediction target.

## Risk mapping (honest by design)
Each artery and its nodes take one colour from its predicted stenosis probability, on a scale
from green (0 %) through amber (50 %) to red (100 %) (`src/anatomy/riskColor.ts`, the same scale
as the legend). The model predicts *per-vessel* stenosis status, so the whole vessel is coloured
uniformly. Nothing in the view suggests where a lesion sits within a vessel, and the disclaimer
banner says this.

## Interaction
- **Rotate:** drag. **Zoom:** scroll or pinch.
- **Hover** a vessel to highlight it and show its label.
- **Click** a vessel, or its label, to fly the camera to it. This also fires `onSelect(vesselId)`,
  which the dashboard uses for the vessel detail panel.
- **Reset:** the *Reset view* button or `Esc`. *Hide/Show labels* toggles the labels.
- Invisible, wider "hit tubes" make the thin arteries easy to click. The heart mesh blocks clicks,
  so a vessel hidden behind it cannot be picked through it.

## Config-driven (adding a vessel or branch needs no code changes)
- `shared/vessels.json`: the vessel IDs, names and supply regions, shared with the backend.
- `frontend/src/config/anatomy.json`: heart placement, plus each vessel's path as surface
  coordinates `[t, a]`:
  - `t` = 0 at the base to 1 at the apex.
  - `a` = degrees around the heart: 0 = front, +90 = patient's left, 180 = back.

  The paths are interpolated, projected onto the heart surface and lifted slightly so the vessels
  lie in the grooves.
- A test fails if any vessel in `shared/vessels.json` lacks a 3D path, or the reverse.

## Performance (no GPU required)
- Frames render on demand: only while the camera moves or the data changes, so an idle view uses
  no GPU.
- Resolution adapts to load, capped at 1.75× (`AdaptiveDpr`, `PerformanceMonitor`). There are no
  shadows, post-processing or textures, so nothing is downloaded at runtime.
- Total geometry is about 25k triangles. The production bundle is 323 KB gzipped, mostly three.js.
- Vessel labels are plain HTML elements moved by a projection step inside the render loop. This
  avoids the per-label React roots of drei's `<Html>`, which raced with React 19 StrictMode.
- On portrait (phone) screens the camera pulls back so the heart fits, and the mock panel starts
  collapsed.

## Tests (`npm test`, Vitest)
1. The shared vessel registry and the 3D anatomy contain the same vessels.
2. Colour-scale end points, clamping and direction are correct.
3. The heart surface is closed.
4. The mesh normals point outward. This guards against an inside-out mesh: during development an
   inside-out heart made the far wall visible and let clicks pass through, and the test catches it.
5. Vessels lie at the intended height above the surface.
6. The LAD is at the front, the LCX on the left, the RCA on the right, and the LAD descends to
   the apex.
7. Focus cameras stay outside the heart.

## Why procedural rather than a downloaded mesh
Using an open-licence heart model (BodyParts3D, NIH 3D, Sketchfab) would require licence
handling, and few such models have separable coronary artery meshes. The procedural model gives
exact control over vessel courses and correspondence, ships no assets, and is light on low-end
laptops. A `.glb` heart can still be dropped into `assets/3d/` later. The vessel paths would then
be refitted to its surface.

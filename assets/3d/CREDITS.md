# 3D asset credits and rebuild instructions

## Sources

| Runtime file | Source | Author | License |
|---|---|---|---|
| `frontend/public/models/heart.glb` | Sketchfab: "Cardiac anatomy: coronary arteries of the heart" (ZBrush OBJ export) | **TODO: confirm author** | **TODO: confirm license** (must allow redistribution, e.g. CC BY / CC0) |
| `frontend/public/models/torso.glb` | Sketchfab: "Low Poly Male Body Base" | Mesh-Base | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Both runtime files are derived works: the heart is segmented, its coronary tree split into
LAD / LCX / RCA, and it is decimated from 1.4M to about 125k triangles. The torso is cropped,
re-scaled and compressed.

Also downloaded but **not used** in the runtime models:
- BodyParts3D coronary vessel segments (Database Center for Life Science, CC BY-SA 2.1 JP).
- Z-Anatomy (CC BY-SA 4.0). Its `.blend` files need Blender, which is not installed.

## Rebuild

Source files are not committed (the heart OBJ is about 100 MB). Run from the repo root, with the
venv active:

```powershell
# 1. segment the sculpt into parts and label the coronary arteries
python assets/3d/pipeline/segment_heart.py "<...>/cardiac-anatomy-coronary-arteries-of-the-heart/source/archive/SubTool-0-12100944.OBJ"
# 2. export labelled parts (decimetres, heart-centred) + vessel landmarks for the viewer
python assets/3d/pipeline/export_heart_glb.py
# 3. simplify + compress the heart, crop/fit/compress the torso -> frontend/public/models/
cd frontend; npm run build:anatomy -- "<...>/low_poly_male_body_base.glb"
```

| Step | What it does |
|---|---|
| `segment_heart.py` | Maps the sculpt's polygroups to parts (heart, aorta, venae cavae, pulmonary trunk, right atrium, coronaries). Splits the coronaries into their two connected components: the RCA (patient's right) and the left tree. Splits the left tree along its own surface paths, from the left-main ostium to the LAD tip (nearest the apex) and the LCX tip (farthest from the LAD). Each branch inherits the label of the trunk it joins. |
| `export_heart_glb.py` | Scales to real size (apex to aortic root = 12 cm) and writes `frontend/src/config/anatomy.landmarks.json`: the trunk centre-lines used for the risk nodes, labels and camera focus. |
| `build-anatomy.mjs` | Simplifies each part to a triangle budget (meshoptimizer) and applies Meshopt compression. Crops the body base mesh to the torso and places the heart at its anatomical position. Scales the torso so the heart has a normal cardiothoracic ratio (0.48). |

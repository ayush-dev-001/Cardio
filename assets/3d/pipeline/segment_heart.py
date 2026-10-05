"""Split the sculpted heart into anatomical parts and label the coronary arteries.

Input : the ZBrush OBJ export of the Sketchfab model "Cardiac anatomy: coronary arteries of the
        heart" (19 polygroups). See assets/3d/CREDITS.md for source and license.
Output: assets/3d/build/heart_parts.npz (vertices + triangles per labelled part), consumed by
        build_heart.mjs which simplifies, compresses and writes the runtime GLB.

The coronary tree in the source is a single polygroup made of two connected components:
the right coronary artery (RCA) and the left coronary tree (left main -> LAD + LCX). The left
tree is split along its own geometry: a shortest-path tree is grown over the vessel surface
from the left-main ostium; the paths to the LAD tip (nearest the apex) and to the LCX tip
(farthest from the LAD tip) define the two trunks, and every other branch inherits the label
of the trunk it joins. Vertices before the bifurcation form the left main (not a target).

Model axes (verified visually): +x = patient's left, +y = superior, +z = anterior.
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra
from scipy.spatial import cKDTree

# polygroup -> part name (identified from per-group renders; see docs/phase3_3d_anatomy.md)
GROUPS = {
    "Group6196": "heart",
    "Group41382": "aorta",
    "Group6593": "coronaries",
    "Group7381": "venae_cavae",
    "Group9785": "pulmonary_trunk",
    "Group23146": "right_atrium",
}  # remaining small groups (valve rims, vein ostia) are merged into "heart"


def parse_obj(path: Path):
    verts, faces, cur = [], {}, "default"
    with open(path, "r", errors="ignore") as fh:
        for line in fh:
            if line.startswith("v "):
                verts.append(line[2:])
            elif line.startswith("g "):
                cur = line[2:].strip()
            elif line.startswith("f "):
                idx = [int(p.split("/")[0]) - 1 for p in line.split()[1:]]
                for k in range(1, len(idx) - 1):
                    faces.setdefault(cur, []).append((idx[0], idx[k], idx[k + 1]))
    return np.loadtxt(verts).astype(np.float64), {g: np.asarray(f, np.int64) for g, f in faces.items()}


def edge_graph(V, F):
    e = np.concatenate([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    w = np.linalg.norm(V[e[:, 0]] - V[e[:, 1]], axis=1)
    n = len(V)
    return coo_matrix((w, (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()


def path_to(pred, src, dst):
    out, v = [], dst
    while v != src and v >= 0:
        out.append(v)
        v = pred[v]
    out.append(src)
    return out[::-1]


def split_left_tree(V, F_left, aorta_pts, apex):
    used = np.unique(F_left.ravel())
    remap = -np.ones(len(V), np.int64)
    remap[used] = np.arange(len(used))
    P, T = V[used], remap[F_left]
    G = edge_graph(P, T)

    ostium = int(np.argmin(cKDTree(aorta_pts).query(P)[0]))
    d0, pred = dijkstra(G, indices=ostium, return_predecessors=True)
    lad_tip = int(np.argmin(np.linalg.norm(P - apex, axis=1)))
    d_lad = dijkstra(G, indices=lad_tip)
    lcx_tip = int(np.argmax(np.where(np.isfinite(d_lad), d_lad, -1)))

    lad_path = path_to(pred, ostium, lad_tip)
    lcx_path = path_to(pred, ostium, lcx_tip)
    common = 0
    while common < min(len(lad_path), len(lcx_path)) and lad_path[common] == lcx_path[common]:
        common += 1
    LM, LAD, LCX = 0, 1, 2
    label = -np.ones(len(P), np.int64)
    label[lad_path[:common]] = LM
    label[lad_path[common:]] = LAD
    label[lcx_path[common:]] = LCX
    # every other vertex inherits the label of its predecessor (processed in distance order)
    for v in np.argsort(d0):
        if label[v] < 0:
            p = pred[v]
            label[v] = label[p] if p >= 0 and label[p] >= 0 else LM
    # a triangle takes the majority label of its corners
    tri_lab = np.array([np.bincount(row, minlength=3).argmax() for row in label[T]])
    info = dict(left_main_vertices=int((label == LM).sum()), lad_vertices=int((label == LAD).sum()),
                lcx_vertices=int((label == LCX).sum()))
    trunks = {"LAD": used[lad_path], "LCX": used[lcx_path]}  # ostium -> distal tip, global vertex ids
    return {name: F_left[tri_lab == k] for k, name in [(LM, "left_main"), (LAD, "LAD"), (LCX, "LCX")]}, info, trunks


def trunk_path(V, F_part, aorta_pts):
    """Main trunk of a vessel tree: shortest surface path from the ostium to the farthest point."""
    used = np.unique(F_part.ravel())
    remap = -np.ones(len(V), np.int64)
    remap[used] = np.arange(len(used))
    P = V[used]
    G = edge_graph(P, remap[F_part])
    ostium = int(np.argmin(cKDTree(aorta_pts).query(P)[0]))
    d, pred = dijkstra(G, indices=ostium, return_predecessors=True)
    tip = int(np.argmax(np.where(np.isfinite(d), d, -1)))
    return used[path_to(pred, ostium, tip)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("obj", type=Path)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "build" / "heart_parts.npz")
    args = ap.parse_args()

    V, groups = parse_obj(args.obj)
    parts: dict[str, list[np.ndarray]] = {}
    for g, F in groups.items():
        parts.setdefault(GROUPS.get(g, "heart"), []).append(F)
    parts = {k: np.concatenate(v) for k, v in parts.items()}

    # coronaries -> RCA (larger component in this right-dominant model, on the patient's right) + left tree
    C = parts.pop("coronaries")
    n = len(V)
    e = np.concatenate([C[:, [0, 1]], C[:, [1, 2]], C[:, [2, 0]]])
    _, comp = connected_components(coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)), directed=False)
    tri_comp = comp[C[:, 0]]
    ids = np.unique(tri_comp)
    assert len(ids) == 2, f"expected 2 coronary components, got {len(ids)}"
    centre_x = {c: V[np.unique(C[tri_comp == c].ravel()), 0].mean() for c in ids}
    rca_c = min(ids, key=lambda c: centre_x[c])  # patient's right = smaller x
    parts["RCA"] = C[tri_comp == rca_c]
    left = C[tri_comp != rca_c]

    aorta_pts = V[np.unique(parts["aorta"].ravel())]
    root = aorta_pts[aorta_pts[:, 1] < np.percentile(aorta_pts[:, 1], 10)].mean(0)  # aortic root
    heart_pts = V[np.unique(parts["heart"].ravel())]
    apex = heart_pts[np.argmax(np.linalg.norm(heart_pts - root, axis=1))]
    left_parts, info, trunks = split_left_tree(V, left, aorta_pts, apex)
    parts.update(left_parts)
    trunks["RCA"] = trunk_path(V, parts["RCA"], aorta_pts)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(args.out, V=V.astype(np.float32), **{f"F_{k}": v.astype(np.int32) for k, v in parts.items()},
                        **{f"T_{k}": v.astype(np.int64) for k, v in trunks.items()})
    print("parts:", {k: len(v) for k, v in parts.items()}, info)
    print("apex", apex.round(3), "aortic root", root.round(3))


if __name__ == "__main__":
    main()

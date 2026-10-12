#!/usr/bin/env python3
"""Reduce the Tamalpais spacecraft CAD export to the lightweight visualizer GLB.

Reproduces, bit for bit, ``ConOps/model/spacecraft.glb`` in tamalpais-configuration
(sha256 917a0f87771b347d31bea8353beb03d2d0b4447fb756ce654abd2906b5ec5e33) from the
full CAD export published at ``s3://cfl-models/model/spacecraft.glb``
(sha256 9145ff5c102a7a2718968b7d4f78eff9e57f37fed44e7abc3d2bae7b2a47a781).

Pipeline:
  1. Remove parts smaller than 5 cm, plus internal electronics, cables and
     remove-before-flight clamps matched by name.
  2. Remove parts that no outside ray can hit (150 directions, 3 mm ray grid;
     a part needs at least 4 hits to stay).
  3. Rename the solar-cell (Z4J) materials to ``solar_cell_*``, so the visualizer
     recognizes the panel, and remove each cell's inward-facing side.
  4. ``gltf-transform dedup``.
  5. Remove vertex normals: viewers compute flat shading, and welding by position
     lets the simplifier go much further.
  6. ``gltf-transform`` commands: prune (removes unused data), flatten, join,
     weld, simplify (ratio 0.02, error 0.001), prune.
  7. Add a root node rotating CAD axes into the Tamalpais body frame
     (180 deg about X: +X telescope boresight, +Z toward the solar panel).


Usage:
  python scripts/reduce_model.py FULL.glb OUT.glb [--workdir DIR]

Example, from a coast-sim-orbit-visualizer clone with tamalpais-configuration
cloned next to it:
  curl -o spacecraft_full_cad.glb https://cfl-models.s3.us-west-2.amazonaws.com/model/spacecraft.glb
  python scripts/reduce_model.py spacecraft_full_cad.glb \\
      ../tamalpais-configuration/ConOps/model/spacecraft.glb

This python script is written
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import struct
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import trimesh
from trimesh.ray.ray_pyembree import RayMeshIntersector

GLTF_TRANSFORM = [
    "npx", "--yes",
    "-p", "@gltf-transform/cli@4.4.0",
    "-p", "@gltf-transform/core@4.5.1",
    "-p", "@gltf-transform/extensions@4.5.1",
    "-p", "@gltf-transform/functions@4.5.1",
    "-p", "meshoptimizer@1.0.1",
    "gltf-transform",
]

# --- Step 1: remove small and internal parts (logic from tamalpais-configuration tools/strip_spacecraft_model.py @ 9bab23b) ---

# Internal electronics by the part's OWN leaf name. [^a-z] (not \b) is used as a
# separator because underscore is a regex word char.
ELEC = re.compile(
    r"(?:^|[^a-z])(board|pcb|pca|resistor|capacitor)(?:[^a-z]|$)"
    r"|_cmp-|\bfp-|res_|cap_|yageo|_eec",
    re.I,
)
# Cables/harnesses, RF connectors, and remove-before-flight clamp rings.
NAMEKILL = re.compile(
    r"cable|coax|harness|\bf09p0|vereinigen|\bm80-|\bqch-|connector|[-_]rf[-_]|\brf\b"
    r"|clamp|\brbf\b",
    re.I,
)


def load_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    magic, _version, length = struct.unpack("<4sII", data[:12])
    if magic != b"glTF":
        raise ValueError(f"not a GLB: {path}")
    gltf = None
    binblob = b""
    off = 12
    while off < length:
        clen, ctype = struct.unpack("<I4s", data[off:off + 8])
        body = data[off + 8:off + 8 + clen]
        if ctype == b"JSON":
            gltf = json.loads(body)
        elif ctype == b"BIN\x00":
            binblob = body
        off += 8 + clen
    return gltf, binblob


def local_matrix(nd: dict) -> np.ndarray:
    if "matrix" in nd:
        return np.array(nd["matrix"], float).reshape(4, 4).T
    T = np.eye(4)
    M = np.eye(4)
    if (s := nd.get("scale")):
        M[:3, :3] = M[:3, :3] @ np.diag(s)
    if (r := nd.get("rotation")):
        x, y, z, w = r
        R = np.array([
            [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
        ])
        Rm = np.eye(4)
        Rm[:3, :3] = R
        M = Rm @ M
    if (t := nd.get("translation")):
        T[:3, 3] = t
    return T @ M


def remove_parts(gltf: dict, binblob: bytes, max_cm: float) -> tuple[dict, bytes]:
    """Remove small/internal parts, then remove unused meshes/accessors and repack."""
    nodes, accs, meshes, bvs = (
        gltf["nodes"], gltf["accessors"], gltf["meshes"], gltf["bufferViews"],
    )
    lmax = max_cm / 100.0  # meters

    world: dict[int, np.ndarray] = {}

    def set_world(idx: int, parent: np.ndarray) -> None:
        world[idx] = parent @ local_matrix(nodes[idx])
        for c in nodes[idx].get("children", []):
            set_world(c, world[idx])

    for root in gltf["scenes"][gltf.get("scene", 0)]["nodes"]:
        set_world(root, np.eye(4))

    def longest_edge(idx: int) -> float:
        nd = nodes[idx]
        mn = np.array([np.inf] * 3)
        mx = np.array([-np.inf] * 3)
        for p in meshes[nd["mesh"]].get("primitives", []):
            pos = p.get("attributes", {}).get("POSITION")
            if pos is None:
                continue
            a = accs[pos]
            lo, hi = np.array(a["min"], float), np.array(a["max"], float)
            corners = np.array([[lo[0] if i & 1 else hi[0],
                                 lo[1] if i & 2 else hi[1],
                                 lo[2] if i & 4 else hi[2], 1.0] for i in range(8)])
            wc = (world[idx] @ corners.T).T[:, :3]
            mn, mx = np.minimum(mn, wc.min(0)), np.maximum(mx, wc.max(0))
        return float((mx - mn).max()) if np.isfinite(mn).all() else np.inf

    for idx, nd in enumerate(nodes):
        if nd.get("mesh") is None:
            continue
        leaf = nd.get("name", "").split("/")[-1]
        small = longest_edge(idx) < lmax
        named = bool(ELEC.search(leaf)) or bool(NAMEKILL.search(leaf))
        if small or named:
            nd.pop("mesh")

    # Remove unused meshes -> accessors -> bufferViews, remap indices, rebuild buffer.
    used_meshes = sorted({nd["mesh"] for nd in nodes if "mesh" in nd})
    mesh_remap = {o: i for i, o in enumerate(used_meshes)}
    new_meshes = [meshes[o] for o in used_meshes]
    for nd in nodes:
        if "mesh" in nd:
            nd["mesh"] = mesh_remap[nd["mesh"]]

    used_acc: set[int] = set()
    for m in new_meshes:
        for p in m["primitives"]:
            used_acc.update(p.get("attributes", {}).values())
            if p.get("indices") is not None:
                used_acc.add(p["indices"])
    used_acc_l = sorted(used_acc)
    acc_remap = {o: i for i, o in enumerate(used_acc_l)}
    new_accs = [accs[o] for o in used_acc_l]
    for m in new_meshes:
        for p in m["primitives"]:
            if "attributes" in p:
                p["attributes"] = {k: acc_remap[v] for k, v in p["attributes"].items()}
            if p.get("indices") is not None:
                p["indices"] = acc_remap[p["indices"]]

    used_bv: set[int] = set()
    for a in new_accs:
        if a.get("bufferView") is not None:
            used_bv.add(a["bufferView"])
    for im in gltf.get("images", []):
        if im.get("bufferView") is not None:
            used_bv.add(im["bufferView"])
    used_bv_l = sorted(used_bv)
    bv_remap = {o: i for i, o in enumerate(used_bv_l)}

    new_bin = bytearray()
    new_bvs = []
    for o in used_bv_l:
        bv = bvs[o]
        start = bv.get("byteOffset", 0)
        length = bv["byteLength"]
        if len(new_bin) % 4:
            new_bin += b"\x00" * (4 - len(new_bin) % 4)
        entry = {"buffer": 0, "byteOffset": len(new_bin), "byteLength": length}
        new_bin += binblob[start:start + length]
        if "byteStride" in bv:
            entry["byteStride"] = bv["byteStride"]
        if "target" in bv:
            entry["target"] = bv["target"]
        new_bvs.append(entry)

    for a in new_accs:
        if a.get("bufferView") is not None:
            a["bufferView"] = bv_remap[a["bufferView"]]
    for im in gltf.get("images", []):
        if im.get("bufferView") is not None:
            im["bufferView"] = bv_remap[im["bufferView"]]

    gltf["meshes"] = new_meshes
    gltf["accessors"] = new_accs
    gltf["bufferViews"] = new_bvs
    gltf["buffers"] = [{"byteLength": len(new_bin)}]
    return gltf, bytes(new_bin)


def write_glb(path: Path, gltf: dict, binblob: bytes) -> None:
    js = json.dumps(gltf, separators=(",", ":")).encode()
    if len(js) % 4:
        js += b" " * (4 - len(js) % 4)
    bb = bytearray(binblob)
    if len(bb) % 4:
        bb += b"\x00" * (4 - len(bb) % 4)
    total = 12 + 8 + len(js) + 8 + len(bb)
    with path.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON"))
        f.write(js)
        f.write(struct.pack("<I4s", len(bb), b"BIN\x00"))
        f.write(bb)


# --- Steps 2-3: remove hidden parts, rename solar-cell materials, remove inward faces ---

COMPONENT_TYPES = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
                   5125: np.uint32, 5126: np.float32}
COMPONENT_COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def remove_hidden_parts_and_rename_solar_cells(src: Path, dst: Path, dirs: int = 150, step_mm: float = 3.0,
                 min_hits: int = 4) -> None:
    g, blob = load_glb(src)
    nodes, accs, bvs, meshes = g["nodes"], g["accessors"], g["bufferViews"], g["meshes"]

    def read(i: int) -> np.ndarray:
        ac = accs[i]
        bv = bvs[ac["bufferView"]]
        dt = np.dtype(COMPONENT_TYPES[ac["componentType"]])
        nc = COMPONENT_COUNTS[ac["type"]]
        off = bv.get("byteOffset", 0) + ac.get("byteOffset", 0)
        stride = bv.get("byteStride", dt.itemsize * nc)
        raw = np.frombuffer(blob, np.uint8, count=stride * (ac["count"] - 1) + dt.itemsize * nc,
                            offset=off)
        arr = np.lib.stride_tricks.as_strided(
            raw, (ac["count"], dt.itemsize * nc), (stride, 1)).copy().view(dt)
        return arr.reshape(ac["count"], nc)

    world: dict[int, np.ndarray] = {}

    def walk(i: int, parent: np.ndarray) -> None:
        world[i] = parent @ local_matrix(nodes[i])
        for c in nodes[i].get("children", []):
            walk(c, world[i])

    for r in g["scenes"][g.get("scene", 0)]["nodes"]:
        walk(r, np.eye(4))

    # Whole scene as one triangle soup, remembering which node owns each triangle.
    V, F, owner, off = [], [], [], 0
    for i, nd in enumerate(nodes):
        if "mesh" not in nd or i not in world:
            continue
        for pr in meshes[nd["mesh"]]["primitives"]:
            if pr.get("mode", 4) != 4:
                continue
            p = read(pr["attributes"]["POSITION"]).astype(float)
            idx = read(pr["indices"]).reshape(-1, 3) if "indices" in pr else np.arange(len(p)).reshape(-1, 3)
            V.append((np.c_[p, np.ones(len(p))] @ world[i].T)[:, :3])
            F.append(idx + off)
            owner.append(np.full(len(idx), i))
            off += len(p)
    V, F, owner = np.vstack(V), np.vstack(F), np.concatenate(owner)

    # Parallel rays from directions spread evenly over the sphere (Fibonacci lattice).
    mesh = trimesh.Trimesh(V, F, process=False)
    rays = RayMeshIntersector(mesh)
    c = (V.min(0) + V.max(0)) / 2
    R = np.linalg.norm(V.max(0) - V.min(0)) / 2 * 1.02
    k = np.arange(dirs) + 0.5
    phi = np.arccos(1 - 2 * k / dirs)
    th = np.pi * (1 + 5 ** 0.5) * k
    D = np.c_[np.cos(th) * np.sin(phi), np.sin(th) * np.sin(phi), np.cos(phi)]
    s = np.arange(-R, R, step_mm / 1000)
    uu, vv = np.meshgrid(s, s)
    uu, vv = uu.ravel(), vv.ravel()
    hits = np.zeros(len(nodes), int)
    for d in D:
        u = np.cross(d, [1, 0, 0] if abs(d[0]) < 0.9 else [0, 1, 0])
        u /= np.linalg.norm(u)
        v = np.cross(d, u)
        O = c - d * R * 1.5 + uu[:, None] * u + vv[:, None] * v
        tri = rays.intersects_first(O, np.repeat(d[None], len(O), 0))
        np.add.at(hits, owner[tri[tri >= 0]], 1)
    hidden = [i for i in sorted(set(owner)) if hits[i] < min_hits]
    print(f"remove hidden parts: removed {len(hidden)} of {len(set(owner))} parts no outside ray can hit")
    for i in hidden:
        nodes[i].pop("mesh")

    # Solar cells (Z4J) use 'defaultplastic'; the visualizer finds the panel by
    # /solar/i in the material name. The extras stop dedup from merging them into other materials.
    mats = g["materials"]
    renamed: dict[int, int] = {}
    for nd in nodes:
        if "mesh" in nd and re.search(r"Z4J", nd.get("name", "")):
            for pr in meshes[nd["mesh"]]["primitives"]:
                if "material" in pr and not mats[pr["material"]].get("name", "").startswith("solar"):
                    if pr["material"] not in renamed:
                        m = copy.deepcopy(mats[pr["material"]])
                        m["name"] = f"solar_cell_{len(renamed)}"
                        m["extras"] = {"role": "solar_cell"}
                        mats.append(m)
                        renamed[pr["material"]] = len(mats) - 1
                    pr["material"] = renamed[pr["material"]]

    # Each CAD cell has a face on both sides, which makes the visualizer's
    # winding-based panel normal a coin toss. Remove the face pointing toward
    # the model centre.
    centre = (V.min(0) + V.max(0)) / 2
    blob = bytearray(blob)
    for mi in sorted({nd["mesh"] for nd in nodes if "mesh" in nd and re.search(r"Z4J", nd.get("name", ""))}):
        inst = [i for i, nd in enumerate(nodes) if nd.get("mesh") == mi and i in world]
        for pr in meshes[mi]["primitives"]:
            if not mats[pr["material"]].get("name", "").startswith("solar"):
                continue
            p = read(pr["attributes"]["POSITION"]).astype(float)
            f = read(pr["indices"]).reshape(-1, 3)
            votes = []
            for i in inst:
                q = (np.c_[p, np.ones(len(p))] @ world[i].T)[:, :3]
                wn = np.cross(q[f[:, 1]] - q[f[:, 0]], q[f[:, 2]] - q[f[:, 0]])
                votes.append((wn * (q[f].mean(1) - centre)).sum(1) > 0)
            outward = np.array(votes)[0]
            new = f[outward].astype(np.uint32).ravel().tobytes()
            blob += b"\x00" * (-len(blob) % 4)
            bvs.append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(new), "target": 34963})
            blob += new
            accs.append({"bufferView": len(bvs) - 1, "componentType": 5125,
                         "count": int(outward.sum()) * 3, "type": "SCALAR"})
            pr["indices"] = len(accs) - 1
    print(f"solar cells: renamed {len(renamed)} materials, removed inward faces")
    g, nb = remove_parts(g, bytes(blob), 0.0)
    write_glb(dst, g, nb)


# --- Step 5: remove vertex normals (JSON chunk only; BIN chunk copied unchanged) ---

def remove_normals(src: Path, dst: Path) -> None:
    b = src.read_bytes()
    ln = struct.unpack_from("<I", b, 12)[0]
    g = json.loads(b[20:20 + ln])
    for m in g["meshes"]:
        for pr in m["primitives"]:
            pr["attributes"].pop("NORMAL", None)
    js = json.dumps(g, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    rest = b[20 + ln:]
    dst.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + len(rest))
                    + struct.pack("<I4s", len(js), b"JSON") + js + rest)


# --- Step 7: root node rotating CAD axes into the body frame (JSON chunk only) ---

def add_body_frame_root(src: Path, dst: Path) -> None:
    b = src.read_bytes()
    ln = struct.unpack_from("<I", b, 12)[0]
    g = json.loads(b[20:20 + ln])
    scene = g["scenes"][g.get("scene", 0)]
    g["nodes"].append({
        "name": "tamalpais_body_frame",
        "rotation": [1.0, 0.0, 0.0, 0.0],  # quaternion (x, y, z, w): 180 deg about +X
        "children": scene["nodes"],
        "extras": {"note": "CAD axes -> Tamalpais body frame: +X telescope boresight, "
                           "+Z toward the solar panel; (x, y, z) -> (x, -y, -z)"},
    })
    scene["nodes"] = [len(g["nodes"]) - 1]
    js = json.dumps(g, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    rest = b[20 + ln:]
    dst.write_bytes(struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(js) + len(rest))
                    + struct.pack("<I4s", len(js), b"JSON") + js + rest)


def gltf_transform(*args: str) -> None:
    subprocess.run([*GLTF_TRANSFORM, *args], check=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", type=Path, help="full CAD-export GLB")
    ap.add_argument("output", type=Path, help="reduced GLB to write")
    ap.add_argument("--workdir", type=Path, help="save intermediate files here (default: a temporary folder, deleted afterwards)")
    args = ap.parse_args()

    with tempfile.TemporaryDirectory() as tmp:
        w = args.workdir or Path(tmp)
        w.mkdir(parents=True, exist_ok=True)
        gltf, blob = load_glb(args.input)
        gltf, blob = remove_parts(gltf, blob, 5.0)
        write_glb(w / "1_removed.glb", gltf, blob)
        remove_hidden_parts_and_rename_solar_cells(w / "1_removed.glb", w / "2_visible.glb")
        gltf_transform("dedup", str(w / "2_visible.glb"), str(w / "3_dedup.glb"))
        remove_normals(w / "3_dedup.glb", w / "4_no_normals.glb")
        gltf_transform("prune", str(w / "4_no_normals.glb"), str(w / "5_pruned.glb"))
        gltf_transform("flatten", str(w / "5_pruned.glb"), str(w / "6_flat.glb"))
        gltf_transform("join", str(w / "6_flat.glb"), str(w / "7_join.glb"))
        gltf_transform("weld", str(w / "7_join.glb"), str(w / "8_weld.glb"))
        gltf_transform("simplify", str(w / "8_weld.glb"), str(w / "9_simplified.glb"),
                       "--ratio", "0.02", "--error", "0.001")
        gltf_transform("prune", str(w / "9_simplified.glb"), str(w / "10_pruned.glb"))
        add_body_frame_root(w / "10_pruned.glb", args.output)

    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(f"wrote {args.output} ({args.output.stat().st_size / 1e6:.2f} MB), sha256 {digest}")


if __name__ == "__main__":
    main()

# bake the Hunyuan3D knight into a small quantized buffer for textflow superknight.
# usage: bake.py tex.glb shape.ply out_prefix [target_faces]
import sys, json, struct, numpy as np, trimesh, fast_simplification, colorsys
from PIL import Image, ImageFilter
texf, shapef, out = sys.argv[1], sys.argv[2], sys.argv[3]
TARGET = int(sys.argv[4]) if len(sys.argv) > 4 else 9600
tm = trimesh.load(texf, force='mesh', process=False)
sm = trimesh.load(shapef, force='mesh', process=True)
print('tex bbox', tm.bounds.round(3).tolist(), 'shape bbox', sm.bounds.round(3).tolist())
v, f = fast_simplification.simplify(np.asarray(sm.vertices, np.float32), np.asarray(sm.faces, np.int64), target_reduction=1 - TARGET / len(sm.faces))
dm = trimesh.Trimesh(v, f, process=True)
# drop slivers/degenerates and tiny disconnected bits
parts = dm.split(only_watertight=False); big = max(len(p.faces) for p in parts)
dm = trimesh.util.concatenate([p for p in parts if len(p.faces) > big * 0.002])
dm.fix_normals()
print('decimated', len(dm.faces), 'verts', len(dm.vertices), 'watertight', dm.is_watertight)
V = np.asarray(dm.vertices, np.float64)
# ---- colour transfer: average texture colour over a small neighbourhood of each vertex
tex = tm.visual.material.baseColorTexture if hasattr(tm.visual.material, 'baseColorTexture') else tm.visual.material.image
tex = tex.convert('RGB').filter(ImageFilter.GaussianBlur(2)); TW, TH = tex.size; T = np.asarray(tex, np.float64)
UV = np.asarray(tm.visual.uv, np.float64)
rng = np.random.default_rng(1)
acc = np.zeros((len(V), 3)); cnt = 0
for k in range(6):
    jit = V + (rng.standard_normal(V.shape) * 0.004 if k else 0)
    cp, dist, tri = trimesh.proximity.closest_point(tm, jit)
    bc = trimesh.triangles.points_to_barycentric(tm.triangles[tri], cp)
    uv = (UV[tm.faces[tri]] * bc[:, :, None]).sum(1)
    px = np.clip((uv[:, 0] % 1) * (TW - 1), 0, TW - 1).astype(int); py = np.clip((1 - uv[:, 1] % 1) * (TH - 1), 0, TH - 1).astype(int)
    acc += T[py, px]; cnt += 1
C = acc / cnt
# ---- frame: mesh faces +z, his left = +x  ->  local +x forward, +y up, +z his right
L = np.stack([V[:, 2], V[:, 1], -V[:, 0]], 1)
def tolocal(p): p = np.asarray(p, np.float64); return np.array([p[2], p[1], -p[0]])
H = 1.28   # kneeling height with the head bowed, metres
s = H / (L[:, 1].max() - L[:, 1].min())
y0 = L[:, 1].min()
torso = (V[:, 1] > -0.1) & (V[:, 1] < 0.5)
cx, cz = L[torso, 0].mean(), L[torso, 2].mean()
def xf(p): p = tolocal(p) if len(np.shape(p)) == 1 else p; return np.array([(p[..., 0] - cx) * s, (p[..., 1] - y0) * s, (p[..., 2] - cz) * s]).T if np.ndim(p) > 1 else np.array([(p[0] - cx) * s, (p[1] - y0) * s, (p[2] - cz) * s])
P = xf(L)
# ---- semantic parts (in the ORIGINAL normalised mesh coords V)
sword_axis = np.array([-0.42, 0.44])   # (x, z) of the planted blade column
dsw = np.hypot(V[:, 0] - sword_axis[0], V[:, 2] - sword_axis[1])
sword = (dsw < 0.075) & (V[:, 1] < 0.36)
guard = (dsw < 0.2) & (V[:, 1] > 0.1) & (V[:, 1] < 0.22) & (np.abs(V[:, 2] - sword_axis[1]) < 0.06)
sword |= guard
head = np.hypot(np.hypot(V[:, 0] + 0.31, V[:, 1] - 0.80), V[:, 2] - 0.2) < 0.24
# arrow: points near the nock line
a0, a1 = np.array([0.36, 0.955, -0.11]), np.array([0.17, 0.715, 0.10])
ad = (a1 - a0) / np.linalg.norm(a1 - a0)
rel = V - a0; tpar = rel @ ad; perp = np.linalg.norm(rel - np.outer(tpar, ad), axis=1)
arrow = (perp < 0.05) & (tpar > -0.05) & (V[:, 1] > 0.69)
# colour classes
hsv = np.array([colorsys.rgb_to_hsv(*(c / 255)) for c in C])
h, sat, val = hsv[:, 0] * 360, hsv[:, 1], hsv[:, 2]
red = ((h < 22) | (h > 330)) & (sat > 0.32) & (val > 0.12)
brown = (h >= 18) & (h < 48) & (sat > 0.3) & ~red
cream = (sat < 0.32) & (h >= 15) & (h < 65) & (val > 0.5) & (C[:, 0] - C[:, 2] > 18)
M_STEEL, M_MAIL, M_CLOTH, M_LEATHER, M_GOLD, M_BLADE, M_VISOR, M_DUST, M_WOOD, M_FLETCH, M_LINEN = 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
mat = np.full(len(V), M_STEEL, np.uint8)
mat[val < 0.33] = M_MAIL
mat[cream] = M_LINEN
mat[brown] = M_LEATHER
mat[red] = M_CLOTH
mat[sword & ~brown] = M_BLADE
mat[arrow] = M_WOOD
# groups: 0 body, 1 legs, 2 head, 3 sword, 4 cloak, 5 arms
G = np.zeros(len(V), np.uint8)
G[(V[:, 1] < -0.3)] = 1
G[(mat == M_CLOTH) & (V[:, 1] > -0.75)] = 4
G[head] = 2
G[sword] = 3
G[arrow] = 0
names = ['body', 'legs', 'head', 'sword', 'cloak']
print('mat counts', {int(k): int((mat == k).sum()) for k in np.unique(mat)})
print('group counts', {names[k]: int((G == k).sum()) for k in range(len(names))})
# ---- quantise
pmin = P.min(0); pmax = P.max(0); scale = (pmax - pmin) / 65535.0
q = np.round((P - pmin) / scale).astype(np.uint16)
F = np.asarray(dm.faces, np.uint16)
col = np.clip(C, 0, 255).astype(np.uint8)
buf = q.tobytes() + col.tobytes() + mat.tobytes() + G.tobytes() + F.tobytes()
open(out + '.bin', 'wb').write(buf)
wound = xf(np.array([0.135, 0.665, 0.14])); nock = xf(a0)
meta = dict(nv=int(len(V)), nt=int(len(F)), pmin=pmin.round(5).tolist(), pscale=scale.tolist(), groupNames=names,
            woundL=wound.round(4).tolist(), nockL=nock.round(4).tolist(),
            swordTopL=xf(np.array([sword_axis[0], 0.36, sword_axis[1]])).round(4).tolist(),
            swordTipL=xf(np.array([sword_axis[0], -0.96, sword_axis[1]])).round(4).tolist(),
            height=H, bounds=[P.min(0).round(3).tolist(), P.max(0).round(3).tolist()])
json.dump(meta, open(out + '.json', 'w'), indent=1)
print(json.dumps(meta))
# preview colours/material
dm.visual = trimesh.visual.ColorVisuals(dm, vertex_colors=np.c_[col, np.full(len(col), 255)])
dm.export(out + '_col.ply')
pal = {1: (200, 205, 220), 2: (90, 90, 110), 3: (220, 40, 50), 4: (150, 90, 40), 6: (120, 200, 255), 9: (255, 160, 60), 11: (240, 230, 200)}
mc = np.array([pal.get(int(m), (255, 0, 255)) for m in mat], np.uint8)
dm.visual = trimesh.visual.ColorVisuals(dm, vertex_colors=np.c_[mc, np.full(len(mc), 255)])
dm.export(out + '_mat.ply')

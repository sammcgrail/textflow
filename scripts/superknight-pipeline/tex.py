import sys, time, numpy as np, trimesh, fast_simplification
from PIL import Image
src, rgba, out = sys.argv[1], sys.argv[2], sys.argv[3]
m = trimesh.load(src, force='mesh', process=False)
m.merge_vertices()
parts = m.split(only_watertight=False)
big = max(len(p.faces) for p in parts)
parts = [p for p in parts if len(p.faces) > big * 0.01]
print('components kept', len(parts), [len(p.faces) for p in parts][:10], flush=True)
m = trimesh.util.concatenate(parts)
v, f = fast_simplification.simplify(np.asarray(m.vertices, np.float32), np.asarray(m.faces, np.int64), target_reduction=1 - 60000 / len(m.faces))
m2 = trimesh.Trimesh(v, f, process=True)
print('decimated', len(m2.faces), flush=True)
m2.export(out.replace('.glb', '_shape60k.ply'))
from hy3dgen.texgen import Hunyuan3DPaintPipeline
t = time.time()
paint = Hunyuan3DPaintPipeline.from_pretrained('tencent/Hunyuan3D-2')
mt = paint(m2, image=Image.open(rgba))
print('paint', time.time() - t, flush=True)
mt.export(out)
print('TEX-DONE', flush=True)

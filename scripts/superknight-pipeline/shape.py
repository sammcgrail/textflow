# Hunyuan3D-2 shape generation on wall's RTX 4080. usage: python shape.py in.png out_prefix [seed] [model_subfolder]
import sys, time, torch
from PIL import Image
from hy3dgen.rembg import BackgroundRemover
from hy3dgen.shapegen import Hunyuan3DDiTFlowMatchingPipeline
inp, out = sys.argv[1], sys.argv[2]
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 1234
sub = sys.argv[4] if len(sys.argv) > 4 else 'hunyuan3d-dit-v2-0'
img = Image.open(inp).convert('RGB')
rgba = BackgroundRemover()(img)
rgba.save(out + '_rgba.png')
t = time.time()
pipe = Hunyuan3DDiTFlowMatchingPipeline.from_pretrained('tencent/Hunyuan3D-2', subfolder=sub)
mesh = pipe(image=rgba, num_inference_steps=50, octree_resolution=380, num_chunks=20000,
            generator=torch.manual_seed(seed), output_type='trimesh')[0]
print('gen', time.time() - t, 'faces', len(mesh.faces), flush=True)
mesh.export(out + '_raw.ply')
print('done faces', len(mesh.faces), flush=True)

// Tối ưu model xe: node scripts/optimize-car.mjs vao.glb ra.glb "regex-vật-liệu-sơn" (giữ nguyên lưới sơn, giảm lưới phần khác)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplifyPrimitive, weld, dedup, prune, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
const [,, inp, out, paint] = process.argv; const re = new RegExp(paint, 'i');
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp);
await doc.transform(dedup());
let before = 0, after = 0;
for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
  const n = prim.getIndices() ? prim.getIndices().getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3; before += n;
  const mat = prim.getMaterial();
  if (!(mat && re.test(mat.getName())) && n > 300) { simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0.3, error: 0.002, lockBorder: false }); }
  after += prim.getIndices() ? prim.getIndices().getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3;
}
await doc.transform(prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048] }));
await io.write(out, doc);
console.log(out, Math.round(before), '->', Math.round(after));

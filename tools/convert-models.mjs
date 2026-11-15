// Converts the original Blender-made FBX parts (Original_Project/Assets/_TMinus/Art/Models/Parts) into GLB for the web.
// Usage: node tools/convert-models.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

// GLTFExporter needs FileReader (browser API); Node has Blob but not FileReader.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); this.onload?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + Buffer.from(b).toString('base64'); this.onloadend?.(); this.onload?.(); }); }
};

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../../Original_Project/Assets/_TMinus/Art/Models/Parts');
const out = path.resolve(here, '../public/models');
fs.mkdirSync(out, { recursive: true });

const loader = new FBXLoader();
for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.fbx'))) {
  const buf = fs.readFileSync(path.join(src, f));
  const obj = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  obj.traverse((o) => { if (o.isMesh) { o.geometry.computeVertexNormals?.(); } });
  const box = new THREE.Box3().setFromObject(obj);
  const exporter = new GLTFExporter();
  const glb = await new Promise((res, rej) => exporter.parse(obj, res, rej, { binary: true, onlyVisible: false }));
  const name = f.replace('.fbx', '.glb');
  fs.writeFileSync(path.join(out, name), Buffer.from(glb));
  const size = box.getSize(new THREE.Vector3());
  console.log(name, (glb.byteLength / 1024).toFixed(0) + ' kB', 'size', size.toArray().map((v) => v.toFixed(2)).join(' x '));
}

import * as THREE from 'three';

// PBR materials keyed by the original Blender material names (MaterialLibrary in the Unity project).
const loader = new THREE.TextureLoader();
const base = import.meta.env.BASE_URL;
const tex = (name, repeat = [1, 1], srgb = true) => {
  const t = loader.load(`${base}images/${name}`);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

const cache = new Map();
const memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };

export const pbr = {
  Body_White: () => memo('Body_White', () => new THREE.MeshStandardMaterial({ color: '#eceae4', roughness: 0.42, metalness: 0.15, map: tex('T_Panels_A.png', [2, 4]), normalMap: tex('T_Panels_N.png', [2, 4], false), normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 1.1 })),
  Band_Black: () => memo('Band_Black', () => new THREE.MeshStandardMaterial({ color: '#0b0c10', roughness: 0.55, metalness: 0.2 })),
  Metal_Grey: () => memo('Metal_Grey', () => new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.32, metalness: 0.92, map: tex('T_Brushed_A.png', [2, 2]), normalMap: tex('T_Brushed_N.png', [2, 2], false), envMapIntensity: 1.4 })),
  Engine_Dark: () => memo('Engine_Dark', () => new THREE.MeshStandardMaterial({ color: '#1b1a19', roughness: 0.38, metalness: 0.85, emissive: '#1a0600', envMapIntensity: 1.3 })),
  Insulation_Orange: () => memo('Insulation_Orange', () => new THREE.MeshStandardMaterial({ color: '#d9692a', roughness: 0.85, metalness: 0, map: tex('T_Foam_A.png', [2, 3]), normalMap: tex('T_Foam_N.png', [2, 3], false), normalScale: new THREE.Vector2(0.6, 0.6) })),
  Board_Green: () => memo('Board_Green', () => new THREE.MeshStandardMaterial({ color: '#15703a', roughness: 0.45, metalness: 0.35, map: tex('T_PCB_A.png', [1, 1]), normalMap: tex('T_PCB_N.png', [1, 1], false) })),
};

export const mat = {
  frame: () => memo('frame', () => new THREE.MeshStandardMaterial({ color: '#b8c0ca', roughness: 0.3, metalness: 0.95, envMapIntensity: 1.5 })),
  gold: () => memo('gold', () => new THREE.MeshStandardMaterial({ color: '#d4a640', roughness: 0.28, metalness: 1 })),
  pcb: () => pbr.Board_Green(),
  chip: () => memo('chip', () => new THREE.MeshStandardMaterial({ color: '#111318', roughness: 0.4, metalness: 0.4 })),
  solar: () => memo('solar', () => new THREE.MeshStandardMaterial({ color: '#102a6b', roughness: 0.18, metalness: 0.75, envMapIntensity: 1.8 })),
  solarGrid: () => memo('solarGrid', () => new THREE.MeshStandardMaterial({ color: '#1b3f9a', roughness: 0.22, metalness: 0.8 })),
  battery: () => memo('battery', () => new THREE.MeshStandardMaterial({ color: '#2b3bff', roughness: 0.5, metalness: 0.2 })),
  copper: () => memo('copper', () => new THREE.MeshStandardMaterial({ color: '#c7733a', roughness: 0.35, metalness: 1 })),
  lens: () => memo('lens', () => new THREE.MeshStandardMaterial({ color: '#05060a', roughness: 0.04, metalness: 0.9, emissive: '#06182b' })),
  red: () => memo('red', () => new THREE.MeshStandardMaterial({ color: '#e32b1f', roughness: 0.5, metalness: 0.1, emissive: '#300500' })),
  concrete: () => memo('concrete', () => new THREE.MeshStandardMaterial({ color: '#8a8a86', roughness: 0.95, map: tex('T_Concrete_A.png', [10, 10]), normalMap: tex('T_Concrete_N.png', [10, 10], false) })),
  ground: () => memo('ground', () => new THREE.MeshStandardMaterial({ color: '#8b7a55', roughness: 1, map: tex('T_Ground_A.png', [400, 400]), normalMap: tex('T_Ground_N.png', [400, 400], false) })),
  saturnWhite: () => memo('saturnWhite', () => new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.45, metalness: 0.1 })),
  saturnBlack: () => memo('saturnBlack', () => new THREE.MeshStandardMaterial({ color: '#0e0e10', roughness: 0.55, metalness: 0.2 })),
  glow: () => memo('glow', () => new THREE.MeshBasicMaterial({ color: '#7ee8ff', transparent: true, opacity: 0.35, depthWrite: false })),
};

export function applyPbr(root, { xray = false } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const name = o.material?.name;
    const internal = /^INT_/.test(o.name);
    o.castShadow = true; o.receiveShadow = true;
    if (internal) { o.visible = xray; }
    const make = pbr[name];
    if (make) o.material = make();
    else if (o.material) { o.material = new THREE.MeshStandardMaterial({ color: '#b0b8c4', roughness: 0.4, metalness: 0.7 }); }
  });
}

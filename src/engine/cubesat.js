// CubeSat mounts (port of CubeSatModel's data part): 6 board slots (two per U), 4 long faces, 2 end faces, a rail foot and the RBF pin socket.
export const SLOTS = ['U1A', 'U1B', 'U2A', 'U2B', 'U3A', 'U3B'];
export const LONG_FACES = ['-Z', '+X', '-X', '+Z'];
export const END_FACES = ['TOP', 'BOTTOM'];
export const MOUNTS = [...SLOTS, ...LONG_FACES, ...END_FACES, 'RAIL', 'PIN'];

export function mountOptions(def) {
  switch (def.mount) {
    case 'slot': return SLOTS;
    case 'face_long': return LONG_FACES;
    case 'face_end': return def.category === 'antenna' ? ['TOP', 'BOTTOM'] : ['BOTTOM', 'TOP'];
    case 'inline': return ['RAIL'];
    case 'pin': return ['PIN'];
    default: return [];
  }
}

export function freeMountFor(def, placedParts) {
  const taken = new Set(placedParts.map((p) => p.mountId));
  return mountOptions(def).find((m) => !taken.has(m)) ?? null;
}

export const mountLabel = (mount) => ({ TOP: 'the top face', BOTTOM: 'the bottom face', RAIL: 'the rail foot', PIN: 'the pin socket' }[mount] ?? (mount?.startsWith('U') ? `slot ${mount}` : `face ${mount}`));
export const mountTypeLabel = (m) => (m === 'slot' ? 'slot' : m === 'face_long' ? 'side face' : m === 'face_end' ? 'end face' : m);

/** Installs a part on the first free mount (Install in BayController). Returns { instanceId, mountId } or { error }. */
export function installPart(design, def, forceId = null) {
  const mount = freeMountFor(def, design.parts);
  if (!mount) return { error: `No free ${mountTypeLabel(def.mount)} for the ${def.name}. Remove something first.` };
  let id = forceId && design.parts.every((p) => p.instanceId !== forceId) ? forceId : def.id;
  for (let n = 2; design.parts.some((p) => p.instanceId === id); n++) id = `${def.id}_${n}`;
  design.parts.push({ instanceId: id, partId: def.id, mountId: mount });
  return { instanceId: id, mountId: mount };
}

/** Removes a part and every cable on it. */
export function removePart(design, instanceId) {
  design.parts = design.parts.filter((p) => p.instanceId !== instanceId);
  design.cables = design.cables.filter((c) => !c.fromPort.startsWith(`${instanceId}/`) && !c.toPort.startsWith(`${instanceId}/`));
}

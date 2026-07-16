import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const OPENING_KINDS = new Set(['door', 'window', 'slidingGate']);
export const NETWORK_KINDS = new Set(['computer', 'laptop', 'printer', 'network', 'switch', 'router', 'rack', 'server']);
export const SEGMENT_KINDS = new Set(['wall', 'road', 'sidewalk']);
export const COLLIDABLE_KINDS = new Set(['wall', 'door', 'slidingGate', 'table', 'chair', 'cabinet', 'shelf', 'computer', 'switch', 'rack', 'server', 'printer']);

export const OBJECT_LABELS = {
  wall: 'Parede',
  door: 'Porta',
  window: 'Janela',
  slidingGate: 'Portão deslizante',
  road: 'Rua',
  sidewalk: 'Calçada',
  parking: 'Vaga de estacionamento',
  grass: 'Área verde',
  table: 'Mesa',
  chair: 'Cadeira',
  cabinet: 'Armário',
  shelf: 'Estante',
  computer: 'Computador',
  laptop: 'Notebook',
  printer: 'Impressora',
  network: 'Ponto de rede',
  switch: 'Switch',
  router: 'Roteador',
  rack: 'Rack',
  server: 'Servidor',
  cable: 'Cabo de rede',
  stairs: 'Escada',
};

export function objectLabel(kind) {
  return OBJECT_LABELS[kind] || 'Objeto';
}

export function defaultMeta(kind) {
  const base = {
    name: objectLabel(kind),
    sector: '',
    ip: '',
    mask: '',
    gateway: '',
    mac: '',
    switchName: '',
    port: '',
    portCount: kind === 'switch' ? 24 : '',
    notes: '',
  };
  const counters = {
    computer: 'PC-01', laptop: 'NOTE-01', printer: 'IMP-01', network: 'PTR-01',
    switch: 'SW-01', router: 'RTR-01', rack: 'RACK-01', server: 'SRV-01',
  };
  if (counters[kind]) base.name = counters[kind];
  return base;
}

function makeMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.78,
    metalness: options.metalness ?? 0,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
  });
}

function makeMesh(geometry, color, options = {}) {
  const result = new THREE.Mesh(geometry, makeMaterial(color, options));
  result.castShadow = options.castShadow !== false;
  result.receiveShadow = options.receiveShadow !== false;
  return result;
}

function copyMeta(kind, meta = {}) {
  return { ...defaultMeta(kind), ...meta };
}

export function markRoot(root) {
  root.traverse((child) => {
    child.castShadow = child.castShadow ?? true;
    child.receiveShadow = child.receiveShadow ?? true;
    child.userData.root = root;
  });
  return root;
}

function setupRoot(root, kind, options = {}) {
  root.userData.objectId = options.id || root.userData.objectId || crypto.randomUUID();
  root.userData.kind = kind;
  root.userData.meta = copyMeta(kind, options.meta);
  root.userData.color = options.color || '#888888';
  root.userData.locked = Boolean(options.locked);
  root.userData.hidden = Boolean(options.hidden);
  root.visible = !root.userData.hidden;
  markRoot(root);
  return root;
}

function clearChildren(root) {
  for (const child of [...root.children]) {
    child.traverse((part) => {
      part.geometry?.dispose?.();
      if (Array.isArray(part.material)) part.material.forEach((material) => material?.dispose?.());
      else part.material?.dispose?.();
    });
    root.remove(child);
  }
}

export function disposeRoot(root) {
  root.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
}

export function getFirstColor(root) {
  if (root?.userData?.color) return root.userData.color;
  let result = '#888888';
  root?.traverse((child) => {
    if (result === '#888888' && child.material?.color) result = `#${child.material.color.getHexString()}`;
  });
  return result;
}

export function applyObjectColor(root, color) {
  const parsed = new THREE.Color(color || '#888888');
  root.userData.color = `#${parsed.getHexString()}`;
  root.traverse((child) => {
    if (child.material?.color && !child.userData.keepColor) child.material.color.copy(parsed);
  });
}

function segmentValues(start, end) {
  const a = new THREE.Vector2(Number(start?.[0]) || 0, Number(start?.[1]) || 0);
  const b = new THREE.Vector2(Number(end?.[0]) || 0, Number(end?.[1]) || 0);
  const delta = b.clone().sub(a);
  const length = Math.max(0.001, delta.length());
  const tangent = delta.clone().multiplyScalar(1 / length);
  const normal = new THREE.Vector2(-tangent.y, tangent.x);
  const center = a.clone().add(b).multiplyScalar(0.5);
  const angle = -Math.atan2(delta.y, delta.x);
  return { a, b, delta, length, tangent, normal, center, angle };
}

export function getSegmentInfo(root) {
  const segment = root?.userData?.segment;
  if (!segment) return null;
  return segmentValues(segment.start, segment.end);
}

export function createWall(start, end, options = {}) {
  const root = setupRoot(new THREE.Group(), 'wall', { ...options, color: options.color || '#cfc6a2' });
  root.userData.segment = {
    start: [Number(start.x ?? start[0]) || 0, Number(start.z ?? start[1]) || 0],
    end: [Number(end.x ?? end[0]) || 0, Number(end.z ?? end[1]) || 0],
    height: Number(options.height) || 3,
    thickness: Number(options.thickness) || 0.16,
  };
  rebuildWall(root, options.world || null);
  return root;
}

function wallPieceGeometry(root, geometries, x, width, y, height) {
  if (width < 0.015 || height < 0.015) return;
  const thickness = root.userData.segment.thickness;
  const geometry = new THREE.BoxGeometry(width, height, thickness);
  geometry.translate(x, y, 0);
  geometries.push(geometry);
  root.userData.collisionPieces.push({ center: [x, y, 0], size: [width, height, thickness] });
}

function openingAt(attachments, position) {
  return attachments.find((item) => position >= item.min - 1e-4 && position <= item.max + 1e-4) || null;
}

export function rebuildWall(root, world = null) {
  if (!root?.userData?.segment) return;
  clearChildren(root);
  const info = getSegmentInfo(root);
  const { height, thickness } = root.userData.segment;
  root.position.set(info.center.x, 0, info.center.y);
  root.rotation.set(0, info.angle, 0);
  root.scale.set(1, 1, 1);
  root.userData.collisionPieces = [];

  const attachments = world
    ? world.children
      .filter((item) => OPENING_KINDS.has(item.userData.kind) && item.userData.hostWallId === root.userData.objectId)
      .map((item) => {
        const width = Number(item.userData.dimensions?.width) || 1;
        const offset = THREE.MathUtils.clamp(Number(item.userData.hostOffset) || width / 2, width / 2, Math.max(width / 2, info.length - width / 2));
        item.userData.hostOffset = offset;
        return {
          root: item,
          kind: item.userData.kind,
          min: Math.max(0, offset - width / 2),
          max: Math.min(info.length, offset + width / 2),
          openingHeight: Number(item.userData.dimensions?.height) || (item.userData.kind === 'window' ? 1.1 : 2.15),
          sill: item.userData.kind === 'window' ? Number(item.userData.sillHeight ?? 1.05) : 0,
        };
      })
      .sort((a, b) => a.min - b.min)
    : [];

  const boundaries = new Set([0, info.length]);
  for (const attachment of attachments) {
    boundaries.add(THREE.MathUtils.clamp(attachment.min, 0, info.length));
    boundaries.add(THREE.MathUtils.clamp(attachment.max, 0, info.length));
  }
  const sorted = [...boundaries].sort((a, b) => a - b);
  const geometries = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index];
    const right = sorted[index + 1];
    const width = right - left;
    if (width < 0.01) continue;
    const midpoint = (left + right) / 2;
    const localX = midpoint - info.length / 2;
    const opening = openingAt(attachments, midpoint);

    if (!opening) {
      wallPieceGeometry(root, geometries, localX, width, height / 2, height);
      continue;
    }

    if (opening.kind === 'window') {
      const lowerHeight = THREE.MathUtils.clamp(opening.sill, 0, height);
      const upperStart = THREE.MathUtils.clamp(opening.sill + opening.openingHeight, 0, height);
      if (lowerHeight > 0) wallPieceGeometry(root, geometries, localX, width, lowerHeight / 2, lowerHeight);
      if (upperStart < height) wallPieceGeometry(root, geometries, localX, width, upperStart + (height - upperStart) / 2, height - upperStart);
    } else {
      const openingHeight = THREE.MathUtils.clamp(opening.openingHeight, 0.2, height);
      if (openingHeight < height) wallPieceGeometry(root, geometries, localX, width, openingHeight + (height - openingHeight) / 2, height - openingHeight);
    }
  }

  // As tampas fecham as pontas da parede e também ajudam no encaixe visual dos cantos.
  for (const x of [-info.length / 2, info.length / 2]) {
    wallPieceGeometry(root, geometries, x, thickness, height / 2, height);
  }

  if (geometries.length) {
    const merged = mergeGeometries(geometries, false);
    geometries.forEach((geometry) => geometry.dispose());
    if (merged) {
      const wallMesh = makeMesh(merged, root.userData.color || '#cfc6a2');
      wallMesh.name = 'wall-merged';
      root.add(wallMesh);
    }
  }

  root.userData.dimensions = { width: info.length, height, depth: thickness };
  markRoot(root);
  if (world) updateWallAttachments(root, world);
}

function createDoorVisual(root) {
  clearChildren(root);
  const { width, height, depth } = root.userData.dimensions;
  const frameColor = '#4b382d';
  const frameThickness = Math.min(0.075, width * 0.08, height * 0.04);
  const frameDepth = Math.max(0.08, depth);
  const panelDepth = Math.min(Math.max(0.045, depth * 0.48), 0.08);

  // O marco fica totalmente dentro do vão. Assim não sobra fresta lateral ou superior.
  const left = makeMesh(new THREE.BoxGeometry(frameThickness, height, frameDepth), frameColor);
  left.userData.keepColor = true;
  left.position.set(-width / 2 + frameThickness / 2, height / 2, 0);
  root.add(left);
  const right = left.clone();
  right.material = left.material.clone();
  right.position.x = width / 2 - frameThickness / 2;
  root.add(right);
  const top = makeMesh(new THREE.BoxGeometry(Math.max(0.05, width - frameThickness * 2), frameThickness, frameDepth), frameColor);
  top.userData.keepColor = true;
  top.position.set(0, height - frameThickness / 2, 0);
  root.add(top);

  const leafWidth = Math.max(0.08, width - frameThickness * 2);
  const leafHeight = Math.max(0.08, height - frameThickness);
  const pivot = new THREE.Group();
  pivot.position.set(-width / 2 + frameThickness, 0, 0);
  const panel = makeMesh(new THREE.BoxGeometry(leafWidth, leafHeight, panelDepth), root.userData.color || '#80583a');
  panel.position.set(leafWidth / 2, leafHeight / 2, 0);
  pivot.add(panel);
  const knob = makeMesh(new THREE.SphereGeometry(0.04, 10, 8), '#d6bd69');
  knob.userData.keepColor = true;
  knob.position.set(Math.max(0.08, leafWidth - 0.15), leafHeight * 0.52, -panelDepth * 0.82);
  pivot.add(knob);
  root.add(pivot);
  root.userData.movingPart = pivot;
  markRoot(root);
}

export function createDoor(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'door', { ...options, color: options.color || '#80583a' });
  root.userData.dimensions = {
    width: Number(options.width) || 0.95,
    height: Number(options.height) || 2.15,
    depth: Number(options.depth) || 0.08,
  };
  root.userData.hostWallId = options.hostWallId || '';
  root.userData.hostOffset = Number(options.hostOffset) || 0;
  root.userData.open = Boolean(options.open);
  root.userData.openTarget = root.userData.open ? 1 : 0;
  root.position.copy(position);
  createDoorVisual(root);
  return root;
}

function createWindowVisual(root) {
  clearChildren(root);
  const { width, height, depth } = root.userData.dimensions;
  const frameThickness = Math.min(0.09, width * 0.09, height * 0.09);
  const frameColor = root.userData.color || '#54504a';
  const parts = [
    [-width / 2 + frameThickness / 2, height / 2, frameThickness, height],
    [width / 2 - frameThickness / 2, height / 2, frameThickness, height],
    [0, frameThickness / 2, Math.max(0.05, width - frameThickness * 2), frameThickness],
    [0, height - frameThickness / 2, Math.max(0.05, width - frameThickness * 2), frameThickness],
  ];
  for (const [x, y, w, h] of parts) {
    const part = makeMesh(new THREE.BoxGeometry(w, h, depth), frameColor);
    part.position.set(x, y, 0);
    root.add(part);
  }
  const glass = makeMesh(new THREE.BoxGeometry(Math.max(0.05, width - frameThickness * 2), Math.max(0.05, height - frameThickness * 2), Math.min(depth * 0.42, 0.045)), '#84c4df', {
    transparent: true,
    opacity: 0.38,
    roughness: 0.08,
  });
  glass.userData.keepColor = true;
  glass.position.y = height / 2;
  root.add(glass);
  markRoot(root);
}

export function createWindow(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'window', { ...options, color: options.color || '#54504a' });
  root.userData.dimensions = {
    width: Number(options.width) || 1.5,
    height: Number(options.height) || 1.1,
    depth: Number(options.depth) || 0.11,
  };
  root.userData.sillHeight = Number(options.sillHeight ?? 1.05);
  root.userData.hostWallId = options.hostWallId || '';
  root.userData.hostOffset = Number(options.hostOffset) || 0;
  root.position.copy(position);
  createWindowVisual(root);
  return root;
}

function createSlidingGateVisual(root) {
  clearChildren(root);
  const { width, height, depth } = root.userData.dimensions;
  const frameColor = '#3c4142';
  const postWidth = Math.min(0.13, width * 0.04);
  for (const x of [-width / 2 + postWidth / 2, width / 2 - postWidth / 2]) {
    const post = makeMesh(new THREE.BoxGeometry(postWidth, height, depth), frameColor, { metalness: 0.2 });
    post.position.set(x, height / 2, 0);
    root.add(post);
  }
  const rail = makeMesh(new THREE.BoxGeometry(width * 2.05, 0.06, Math.max(depth, 0.08)), frameColor, { metalness: 0.3 });
  rail.position.set(width * 0.45, 0.03, 0);
  root.add(rail);

  const sliding = new THREE.Group();
  const panelWidth = Math.max(0.2, width - postWidth * 2);
  const panel = makeMesh(new THREE.BoxGeometry(panelWidth, height, Math.min(depth * 0.65, 0.09)), root.userData.color || '#59666b', { metalness: 0.25 });
  panel.position.y = height / 2;
  sliding.add(panel);
  for (let x = -panelWidth / 2 + 0.2; x < panelWidth / 2; x += 0.35) {
    const bar = makeMesh(new THREE.BoxGeometry(0.045, Math.max(0.2, height - 0.12), Math.max(depth, 0.08)), '#303638', { metalness: 0.35 });
    bar.userData.keepColor = true;
    bar.position.set(x, height / 2, 0);
    sliding.add(bar);
  }
  root.add(sliding);
  root.userData.movingPart = sliding;
  markRoot(root);
}

export function createSlidingGate(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'slidingGate', { ...options, color: options.color || '#59666b' });
  root.userData.dimensions = {
    width: Number(options.width) || 3.6,
    height: Number(options.height) || 2.2,
    depth: Number(options.depth) || 0.12,
  };
  root.userData.hostWallId = options.hostWallId || '';
  root.userData.hostOffset = Number(options.hostOffset) || 0;
  root.userData.slideDirection = options.slideDirection === -1 ? -1 : 1;
  root.userData.open = Boolean(options.open);
  root.userData.openTarget = root.userData.open ? 1 : 0;
  root.position.copy(position);
  createSlidingGateVisual(root);
  return root;
}

function createSegmentRoot(kind, start, end, options = {}) {
  const root = setupRoot(new THREE.Group(), kind, options);
  root.userData.segment = {
    start: [Number(start.x ?? start[0]) || 0, Number(start.z ?? start[1]) || 0],
    end: [Number(end.x ?? end[0]) || 0, Number(end.z ?? end[1]) || 0],
    width: Number(options.width) || (kind === 'road' ? 6 : 1.5),
  };
  rebuildSegment(root);
  return root;
}

export function rebuildSegment(root) {
  clearChildren(root);
  const info = getSegmentInfo(root);
  const width = Number(root.userData.segment.width) || 1;
  root.position.set(info.center.x, 0, info.center.y);
  root.rotation.set(0, info.angle, 0);
  root.scale.set(1, 1, 1);
  const kind = root.userData.kind;
  const height = kind === 'road' ? 0.035 : 0.075;
  const color = root.userData.color || (kind === 'road' ? '#4c5052' : '#bdb9ad');
  const base = makeMesh(new THREE.BoxGeometry(info.length, height, width), color, { roughness: 0.96, castShadow: false });
  base.position.y = height / 2;
  root.add(base);

  if (kind === 'road') {
    for (let x = -info.length / 2 + 0.7; x < info.length / 2 - 0.3; x += 1.8) {
      const mark = makeMesh(new THREE.BoxGeometry(Math.min(0.95, info.length), 0.008, 0.08), '#e5dcae', { castShadow: false });
      mark.userData.keepColor = true;
      mark.position.set(x, height + 0.005, 0);
      root.add(mark);
    }
    const edgeOffset = width / 2 - 0.18;
    for (const z of [-edgeOffset, edgeOffset]) {
      const line = makeMesh(new THREE.BoxGeometry(info.length, 0.008, 0.055), '#e8e8df', { castShadow: false });
      line.userData.keepColor = true;
      line.position.set(0, height + 0.006, z);
      root.add(line);
    }
  }

  root.userData.dimensions = { width: info.length, height, depth: width };
  markRoot(root);
}

export function createRoad(start, end, options = {}) {
  return createSegmentRoot('road', start, end, { ...options, width: options.width || 6, color: options.color || '#4c5052' });
}

export function createSidewalk(start, end, options = {}) {
  return createSegmentRoot('sidewalk', start, end, { ...options, width: options.width || 1.5, color: options.color || '#bdb9ad' });
}

function createParking(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'parking', { ...options, color: options.color || '#55595b' });
  root.userData.dimensions = { width: Number(options.width) || 2.5, height: 0.025, depth: Number(options.depth) || 5 };
  const { width, depth } = root.userData.dimensions;
  const base = makeMesh(new THREE.BoxGeometry(width, 0.025, depth), root.userData.color, { castShadow: false });
  base.position.y = 0.0125;
  root.add(base);
  for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) {
    const line = makeMesh(new THREE.BoxGeometry(0.07, 0.012, depth), '#f0eee0', { castShadow: false });
    line.userData.keepColor = true;
    line.position.set(x, 0.035, 0);
    root.add(line);
  }
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createGrass(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'grass', { ...options, color: options.color || '#5c8f4f' });
  root.userData.dimensions = { width: Number(options.width) || 5, height: 0.035, depth: Number(options.depth) || 5 };
  const base = makeMesh(new THREE.BoxGeometry(root.userData.dimensions.width, 0.035, root.userData.dimensions.depth), root.userData.color, { castShadow: false });
  base.position.y = 0.0175;
  root.add(base);
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createTable(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'table', { ...options, color: options.color || '#7b6548' });
  root.userData.dimensions = { width: Number(options.width) || 1.8, height: Number(options.height) || 0.8, depth: Number(options.depth) || 0.9 };
  const { width, height, depth } = root.userData.dimensions;
  const top = makeMesh(new THREE.BoxGeometry(width, 0.1, depth), root.userData.color);
  top.position.y = height - 0.05;
  root.add(top);
  const legColor = '#54483b';
  for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) for (const z of [-depth / 2 + 0.1, depth / 2 - 0.1]) {
    const leg = makeMesh(new THREE.BoxGeometry(0.09, height - 0.1, 0.09), legColor);
    leg.userData.keepColor = true;
    leg.position.set(x, (height - 0.1) / 2, z);
    root.add(leg);
  }
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createChair(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'chair', { ...options, color: options.color || '#56616b' });
  root.userData.dimensions = { width: Number(options.width) || 0.55, height: Number(options.height) || 0.95, depth: Number(options.depth) || 0.58 };
  const { width, height, depth } = root.userData.dimensions;
  const seatY = 0.48;
  const seat = makeMesh(new THREE.BoxGeometry(width, 0.1, depth), root.userData.color);
  seat.position.y = seatY;
  root.add(seat);
  const back = makeMesh(new THREE.BoxGeometry(width, height - seatY, 0.1), root.userData.color);
  back.position.set(0, seatY + (height - seatY) / 2, depth / 2 - 0.05);
  root.add(back);
  for (const x of [-width / 2 + 0.07, width / 2 - 0.07]) for (const z of [-depth / 2 + 0.07, depth / 2 - 0.07]) {
    const leg = makeMesh(new THREE.BoxGeometry(0.06, seatY, 0.06), '#42484d');
    leg.userData.keepColor = true;
    leg.position.set(x, seatY / 2, z);
    root.add(leg);
  }
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createCabinet(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'cabinet', { ...options, color: options.color || '#8b7b63' });
  root.userData.dimensions = { width: Number(options.width) || 1.2, height: Number(options.height) || 2, depth: Number(options.depth) || 0.48 };
  const { width, height, depth } = root.userData.dimensions;
  const body = makeMesh(new THREE.BoxGeometry(width, height, depth), root.userData.color);
  body.position.y = height / 2;
  root.add(body);
  const split = makeMesh(new THREE.BoxGeometry(0.035, height * 0.9, depth + 0.01), '#5c5142');
  split.userData.keepColor = true;
  split.position.set(0, height / 2, -depth / 2 - 0.01);
  root.add(split);
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createShelf(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'shelf', { ...options, color: options.color || '#6e6253' });
  root.userData.dimensions = { width: Number(options.width) || 1.5, height: Number(options.height) || 1.9, depth: Number(options.depth) || 0.45 };
  const { width, height, depth } = root.userData.dimensions;
  for (const x of [-width / 2 + 0.04, width / 2 - 0.04]) {
    const side = makeMesh(new THREE.BoxGeometry(0.08, height, depth), root.userData.color);
    side.position.set(x, height / 2, 0);
    root.add(side);
  }
  for (let y = 0.08; y <= height; y += height / 4) {
    const shelf = makeMesh(new THREE.BoxGeometry(width, 0.08, depth), root.userData.color);
    shelf.position.y = Math.min(y, height - 0.04);
    root.add(shelf);
  }
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createComputer(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'computer', { ...options, color: options.color || '#546270' });
  root.userData.dimensions = { width: Number(options.width) || 1.25, height: Number(options.height) || 1.35, depth: Number(options.depth) || 0.72 };
  const desk = createTable(new THREE.Vector3(), { width: root.userData.dimensions.width, depth: root.userData.dimensions.depth, height: 0.76, color: '#765f45' });
  for (const child of [...desk.children]) root.add(child);
  const monitor = makeMesh(new THREE.BoxGeometry(0.62, 0.44, 0.08), root.userData.color, { metalness: 0.1 });
  monitor.position.set(0, 1.12, -0.1);
  root.add(monitor);
  const screen = makeMesh(new THREE.BoxGeometry(0.54, 0.35, 0.015), '#1c2c38', { roughness: 0.2 });
  screen.userData.keepColor = true;
  screen.position.set(0, 1.12, -0.145);
  root.add(screen);
  const stand = makeMesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), '#444b4e');
  stand.userData.keepColor = true;
  stand.position.set(0, 0.88, -0.1);
  root.add(stand);
  const tower = makeMesh(new THREE.BoxGeometry(0.26, 0.52, 0.48), '#30383d');
  tower.userData.keepColor = true;
  tower.position.set(root.userData.dimensions.width / 2 - 0.18, 0.32, 0.02);
  root.add(tower);
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createLaptop(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'laptop', { ...options, color: options.color || '#4e5a63' });
  root.userData.dimensions = { width: Number(options.width) || 0.65, height: Number(options.height) || 0.5, depth: Number(options.depth) || 0.45 };
  const base = makeMesh(new THREE.BoxGeometry(0.65, 0.04, 0.45), root.userData.color, { metalness: 0.2 });
  base.position.y = 0.76;
  root.add(base);
  const screenGroup = new THREE.Group();
  screenGroup.position.set(0, 0.78, 0.2);
  screenGroup.rotation.x = -1.05;
  const screen = makeMesh(new THREE.BoxGeometry(0.62, 0.4, 0.035), root.userData.color, { metalness: 0.2 });
  screen.position.y = 0.2;
  screenGroup.add(screen);
  const display = makeMesh(new THREE.BoxGeometry(0.54, 0.32, 0.01), '#1f3445', { roughness: 0.2 });
  display.userData.keepColor = true;
  display.position.set(0, 0.2, -0.025);
  screenGroup.add(display);
  root.add(screenGroup);
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createPrinter(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'printer', { ...options, color: options.color || '#d6d6cf' });
  root.userData.dimensions = { width: Number(options.width) || 0.72, height: Number(options.height) || 0.78, depth: Number(options.depth) || 0.66 };
  const body = makeMesh(new THREE.BoxGeometry(0.72, 0.55, 0.66), root.userData.color);
  body.position.y = 0.3;
  root.add(body);
  const top = makeMesh(new THREE.BoxGeometry(0.6, 0.16, 0.5), '#4c5456');
  top.userData.keepColor = true;
  top.position.y = 0.65;
  root.add(top);
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createNetworkPoint(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'network', { ...options, color: options.color || '#2e78cc' });
  root.userData.dimensions = { width: Number(options.width) || 0.24, height: Number(options.height) || 0.24, depth: Number(options.depth) || 0.08 };
  const plate = makeMesh(new THREE.BoxGeometry(0.24, 0.24, 0.08), root.userData.color);
  plate.position.y = 0.55;
  root.add(plate);
  for (const x of [-0.055, 0.055]) {
    const socket = makeMesh(new THREE.BoxGeometry(0.065, 0.07, 0.02), '#162c44');
    socket.userData.keepColor = true;
    socket.position.set(x, 0.55, -0.05);
    root.add(socket);
  }
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createRack(position, options = {}, kind = 'rack') {
  const root = setupRoot(new THREE.Group(), kind, { ...options, color: options.color || '#41484c' });
  root.userData.dimensions = { width: Number(options.width) || 0.9, height: Number(options.height) || 2, depth: Number(options.depth) || 0.75 };
  const { width, height, depth } = root.userData.dimensions;
  const frame = makeMesh(new THREE.BoxGeometry(width, height, depth), root.userData.color, { metalness: 0.22 });
  frame.position.y = height / 2;
  root.add(frame);
  const front = makeMesh(new THREE.BoxGeometry(width * 0.82, height * 0.86, 0.03), '#20272b', { metalness: 0.3 });
  front.userData.keepColor = true;
  front.position.set(0, height / 2, -depth / 2 - 0.02);
  root.add(front);
  for (let y = 0.32; y < height - 0.2; y += 0.22) {
    const slot = makeMesh(new THREE.BoxGeometry(width * 0.68, 0.07, 0.035), kind === 'server' ? '#3b5968' : '#2e3b42', { metalness: 0.35 });
    slot.userData.keepColor = true;
    slot.position.set(0, y, -depth / 2 - 0.045);
    root.add(slot);
  }
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createSwitch(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'switch', { ...options, color: options.color || '#263a42' });
  root.userData.dimensions = { width: Number(options.width) || 0.78, height: Number(options.height) || 0.22, depth: Number(options.depth) || 0.38 };
  const body = makeMesh(new THREE.BoxGeometry(0.78, 0.22, 0.38), root.userData.color, { metalness: 0.25 });
  body.position.y = 0.16;
  root.add(body);
  for (let index = 0; index < 12; index += 1) {
    const port = makeMesh(new THREE.BoxGeometry(0.045, 0.04, 0.012), index % 3 ? '#17262d' : '#5ca55b');
    port.userData.keepColor = true;
    port.position.set(-0.31 + index * 0.056, 0.16, -0.197);
    root.add(port);
  }
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createRouter(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'router', { ...options, color: options.color || '#e6e3d8' });
  root.userData.dimensions = { width: Number(options.width) || 0.55, height: Number(options.height) || 0.48, depth: Number(options.depth) || 0.35 };
  const body = makeMesh(new THREE.BoxGeometry(0.55, 0.12, 0.35), root.userData.color);
  body.position.y = 0.1;
  root.add(body);
  for (const x of [-0.19, 0.19]) {
    const antenna = makeMesh(new THREE.CylinderGeometry(0.018, 0.018, 0.45, 8), '#303438');
    antenna.userData.keepColor = true;
    antenna.position.set(x, 0.34, 0.12);
    root.add(antenna);
  }
  root.position.copy(position);
  markRoot(root);
  return root;
}

function createStairs(position, options = {}) {
  const root = setupRoot(new THREE.Group(), 'stairs', { ...options, color: options.color || '#989891' });
  const steps = Number(options.steps) || 9;
  root.userData.dimensions = { width: Number(options.width) || 1.6, height: Number(options.height) || 1.62, depth: Number(options.depth) || steps * 0.38 };
  for (let index = 0; index < steps; index += 1) {
    const stepHeight = (index + 1) * (root.userData.dimensions.height / steps);
    const step = makeMesh(new THREE.BoxGeometry(root.userData.dimensions.width, stepHeight, root.userData.dimensions.depth / steps), root.userData.color);
    step.position.set(0, stepHeight / 2, -index * root.userData.dimensions.depth / steps);
    root.add(step);
  }
  root.position.copy(position);
  markRoot(root);
  return root;
}

export function createCable(fromRoot, toRoot, options = {}) {
  const root = setupRoot(new THREE.Group(), 'cable', { ...options, color: options.color || '#2f9e63' });
  root.userData.fromId = fromRoot?.userData?.objectId || options.fromId || '';
  root.userData.toId = toRoot?.userData?.objectId || options.toId || '';
  root.userData.dimensions = { width: 0, height: 0, depth: 0 };
  if (options.world) updateCable(root, options.world);
  return root;
}

export function updateCable(root, world) {
  clearChildren(root);
  const from = world.children.find((item) => item.userData.objectId === root.userData.fromId);
  const to = world.children.find((item) => item.userData.objectId === root.userData.toId);
  if (!from || !to) return;
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  from.getWorldPosition(start);
  to.getWorldPosition(end);
  start.y = Math.max(0.08, start.y + 0.08);
  end.y = Math.max(0.08, end.y + 0.08);
  const middle = start.clone().lerp(end, 0.5);
  middle.y = 0.1;
  const curve = new THREE.CatmullRomCurve3([start, middle, end]);
  const tube = makeMesh(new THREE.TubeGeometry(curve, 24, 0.025, 6, false), root.userData.color || '#2f9e63', { castShadow: false });
  root.add(tube);
  markRoot(root);
}

export function updateAllCables(world) {
  for (const root of world.children) if (root.userData.kind === 'cable') updateCable(root, world);
}

export function createObject(kind, position = new THREE.Vector3(), options = {}) {
  if (kind === 'door') return createDoor(position, options);
  if (kind === 'window') return createWindow(position, options);
  if (kind === 'slidingGate') return createSlidingGate(position, options);
  if (kind === 'parking') return createParking(position, options);
  if (kind === 'grass') return createGrass(position, options);
  if (kind === 'table') return createTable(position, options);
  if (kind === 'chair') return createChair(position, options);
  if (kind === 'cabinet') return createCabinet(position, options);
  if (kind === 'shelf') return createShelf(position, options);
  if (kind === 'computer') return createComputer(position, options);
  if (kind === 'laptop') return createLaptop(position, options);
  if (kind === 'printer') return createPrinter(position, options);
  if (kind === 'network') return createNetworkPoint(position, options);
  if (kind === 'switch') return createSwitch(position, options);
  if (kind === 'router') return createRouter(position, options);
  if (kind === 'rack') return createRack(position, options, 'rack');
  if (kind === 'server') return createRack(position, options, 'server');
  if (kind === 'stairs') return createStairs(position, options);
  return null;
}

export function projectPointOnWall(point, wall) {
  const info = getSegmentInfo(wall);
  if (!info) return null;
  const p = new THREE.Vector2(point.x, point.z);
  const along = THREE.MathUtils.clamp(p.clone().sub(info.a).dot(info.tangent), 0, info.length);
  const projected = info.a.clone().add(info.tangent.clone().multiplyScalar(along));
  return {
    wall,
    info,
    offset: along,
    point: new THREE.Vector3(projected.x, 0, projected.y),
    distance: projected.distanceTo(p),
  };
}

export function findNearestWall(point, world, maxDistance = Infinity) {
  let best = null;
  for (const wall of world.children.filter((item) => item.userData.kind === 'wall')) {
    const projected = projectPointOnWall(point, wall);
    if (!projected || projected.distance > maxDistance) continue;
    if (!best || projected.distance < best.distance) best = projected;
  }
  return best;
}

function openingIntervals(wall, world, ignoreId = '') {
  return world.children
    .filter((item) => OPENING_KINDS.has(item.userData.kind) && item.userData.hostWallId === wall.userData.objectId && item.userData.objectId !== ignoreId)
    .map((item) => {
      const width = Number(item.userData.dimensions?.width) || 1;
      const offset = Number(item.userData.hostOffset) || 0;
      return { min: offset - width / 2 - 0.08, max: offset + width / 2 + 0.08 };
    });
}

export function findFreeWallOffset(wall, world, desiredOffset, width, ignoreId = '', grid = 0.1) {
  const info = getSegmentInfo(wall);
  if (!info || info.length < width + 0.1) return null;
  const minOffset = width / 2 + 0.05;
  const maxOffset = info.length - width / 2 - 0.05;
  const desired = THREE.MathUtils.clamp(desiredOffset, minOffset, maxOffset);
  const occupied = openingIntervals(wall, world, ignoreId);
  const free = (offset) => occupied.every((interval) => offset + width / 2 <= interval.min || offset - width / 2 >= interval.max);
  if (free(desired)) return desired;
  const step = Math.max(0.05, Number(grid) || 0.1);
  for (let distance = step; distance <= info.length; distance += step) {
    const left = desired - distance;
    const right = desired + distance;
    if (left >= minOffset && free(left)) return left;
    if (right <= maxOffset && free(right)) return right;
  }
  return null;
}

function refreshOpeningVisual(root) {
  if (root.userData.kind === 'door') createDoorVisual(root);
  else if (root.userData.kind === 'window') createWindowVisual(root);
  else if (root.userData.kind === 'slidingGate') createSlidingGateVisual(root);
}

function fitOpeningToWall(root, wall) {
  const wallHeight = Math.max(0.2, Number(wall.userData.segment?.height) || 3);
  const wallDepth = Math.max(0.05, Number(wall.userData.segment?.thickness) || 0.16);
  const dimensions = root.userData.dimensions || { width: 1, height: 2, depth: wallDepth };
  const nextDepth = wallDepth;
  let nextHeight = Math.min(Number(dimensions.height) || 2, wallHeight);
  if (root.userData.kind === 'window') {
    const sill = Math.max(0, Number(root.userData.sillHeight) || 0);
    nextHeight = Math.max(0.15, Math.min(nextHeight, wallHeight - sill));
  }
  const changed = Math.abs((dimensions.depth || 0) - nextDepth) > 1e-4 || Math.abs((dimensions.height || 0) - nextHeight) > 1e-4;
  root.userData.dimensions = { ...dimensions, depth: nextDepth, height: nextHeight };
  if (changed) refreshOpeningVisual(root);
}

export function updateWallAttachments(wall, world) {
  const info = getSegmentInfo(wall);
  if (!info) return;
  for (const root of world.children) {
    if (!OPENING_KINDS.has(root.userData.kind) || root.userData.hostWallId !== wall.userData.objectId) continue;
    fitOpeningToWall(root, wall);
    const width = Number(root.userData.dimensions?.width) || 1;
    const offset = THREE.MathUtils.clamp(Number(root.userData.hostOffset) || width / 2, width / 2, Math.max(width / 2, info.length - width / 2));
    root.userData.hostOffset = offset;
    const point = info.a.clone().add(info.tangent.clone().multiplyScalar(offset));
    root.position.set(point.x, 0, point.y);
    root.rotation.set(0, info.angle, 0);
  }
}

export function snapOpeningToWall(root, world, desiredPoint = root.position, options = {}) {
  if (!OPENING_KINDS.has(root.userData.kind)) return { ok: false, reason: 'not-opening' };
  const nearest = findNearestWall(desiredPoint, world, options.maxDistance ?? 1.5);
  if (!nearest) return { ok: false, reason: 'Nenhuma parede próxima.' };
  const width = Number(root.userData.dimensions?.width) || 1;
  const offset = findFreeWallOffset(nearest.wall, world, nearest.offset, width, root.userData.objectId, options.grid || 0.1);
  if (offset == null) return { ok: false, reason: 'Não há espaço livre nessa parede para esse tamanho.' };

  const previousWallId = root.userData.hostWallId;
  root.userData.hostWallId = nearest.wall.userData.objectId;
  root.userData.hostOffset = offset;
  updateWallAttachments(nearest.wall, world);
  rebuildWall(nearest.wall, world);
  if (previousWallId && previousWallId !== nearest.wall.userData.objectId) {
    const previous = world.children.find((item) => item.userData.objectId === previousWallId);
    if (previous) rebuildWall(previous, world);
  }
  return { ok: true, wall: nearest.wall, adjusted: Math.abs(offset - nearest.offset) > 0.02 };
}

export function detachOpening(root, world) {
  if (!OPENING_KINDS.has(root.userData.kind)) return;
  const oldWall = world.children.find((item) => item.userData.objectId === root.userData.hostWallId);
  root.userData.hostWallId = '';
  root.userData.hostOffset = 0;
  if (oldWall) rebuildWall(oldWall, world);
}

export function resizeObject(root, dimensions, world = null) {
  const width = Math.max(0.05, Number(dimensions.width) || root.userData.dimensions?.width || 1);
  const height = Math.max(0.02, Number(dimensions.height) || root.userData.dimensions?.height || 1);
  const depth = Math.max(0.02, Number(dimensions.depth) || root.userData.dimensions?.depth || 1);
  const kind = root.userData.kind;

  if (kind === 'wall') {
    const info = getSegmentInfo(root);
    const center = info.center;
    const half = info.tangent.clone().multiplyScalar(width / 2);
    root.userData.segment.start = [center.x - half.x, center.y - half.y];
    root.userData.segment.end = [center.x + half.x, center.y + half.y];
    root.userData.segment.height = height;
    root.userData.segment.thickness = depth;
    rebuildWall(root, world);
    return;
  }

  if (kind === 'road' || kind === 'sidewalk') {
    const info = getSegmentInfo(root);
    const center = info.center;
    const half = info.tangent.clone().multiplyScalar(width / 2);
    root.userData.segment.start = [center.x - half.x, center.y - half.y];
    root.userData.segment.end = [center.x + half.x, center.y + half.y];
    root.userData.segment.width = depth;
    rebuildSegment(root);
    return;
  }

  const previous = { ...(root.userData.dimensions || { width: 1, height: 1, depth: 1 }) };
  root.userData.dimensions = { width, height, depth };
  if (kind === 'door') createDoorVisual(root);
  else if (kind === 'window') createWindowVisual(root);
  else if (kind === 'slidingGate') createSlidingGateVisual(root);
  else {
    root.scale.x *= width / Math.max(0.001, previous.width || 1);
    root.scale.y *= height / Math.max(0.001, previous.height || 1);
    root.scale.z *= depth / Math.max(0.001, previous.depth || 1);
  }

  if (OPENING_KINDS.has(kind) && world) {
    const result = snapOpeningToWall(root, world, root.position, { maxDistance: 2.5 });
    if (!result.ok && root.userData.hostWallId) {
      const wall = world.children.find((item) => item.userData.objectId === root.userData.hostWallId);
      if (wall) rebuildWall(wall, world);
    }
  }
}

export function applySegmentTransform(root, startState, world = null) {
  if (!SEGMENT_KINDS.has(root.userData.kind) || !startState) return;
  const originalStart = new THREE.Vector2(startState.segment.start[0], startState.segment.start[1]);
  const originalEnd = new THREE.Vector2(startState.segment.end[0], startState.segment.end[1]);
  const originalCenter = originalStart.clone().add(originalEnd).multiplyScalar(0.5);
  const currentCenter = new THREE.Vector2(root.position.x, root.position.z);
  const translation = currentCenter.clone().sub(originalCenter);
  const rotationDelta = root.rotation.y - startState.rotationY;
  const rotate = (point) => point.clone().sub(originalCenter).rotateAround(new THREE.Vector2(0, 0), -rotationDelta).add(originalCenter).add(translation);
  const newStart = rotate(originalStart);
  const newEnd = rotate(originalEnd);
  root.userData.segment.start = [newStart.x, newStart.y];
  root.userData.segment.end = [newEnd.x, newEnd.y];
  root.scale.set(1, 1, 1);
  if (root.userData.kind === 'wall') rebuildWall(root, world);
  else rebuildSegment(root);
}

export function snapshotSegment(root) {
  if (!root?.userData?.segment) return null;
  return {
    segment: structuredClone(root.userData.segment),
    rotationY: root.rotation.y,
  };
}

export function setOpeningOpen(root, open) {
  if (!OPENING_KINDS.has(root.userData.kind) || root.userData.kind === 'window') return;
  root.userData.open = Boolean(open);
  root.userData.openTarget = root.userData.open ? 1 : 0;
}

export function updateOpeningAnimation(root, delta) {
  if (!['door', 'slidingGate'].includes(root.userData.kind) || !root.userData.movingPart) return;
  const current = Number(root.userData.openProgress) || 0;
  const target = Number(root.userData.openTarget) || 0;
  const next = THREE.MathUtils.damp(current, target, 8, delta);
  root.userData.openProgress = Math.abs(next - target) < 0.002 ? target : next;
  if (root.userData.kind === 'door') {
    root.userData.movingPart.rotation.y = -Math.PI * 0.5 * root.userData.openProgress;
  } else {
    const width = Number(root.userData.dimensions?.width) || 3.6;
    root.userData.movingPart.position.x = root.userData.slideDirection * width * 0.92 * root.userData.openProgress;
  }
}

export function serializeObject(root) {
  const kind = root.userData.kind;
  const data = {
    id: root.userData.objectId,
    kind,
    meta: root.userData.meta || defaultMeta(kind),
    color: getFirstColor(root),
    locked: Boolean(root.userData.locked),
    hidden: Boolean(root.userData.hidden),
    position: root.position.toArray(),
    rotation: [root.rotation.x, root.rotation.y, root.rotation.z],
    scale: root.scale.toArray(),
    dimensions: root.userData.dimensions || null,
  };
  if (root.userData.segment) data.segment = structuredClone(root.userData.segment);
  if (OPENING_KINDS.has(kind)) {
    data.hostWallId = root.userData.hostWallId || '';
    data.hostOffset = Number(root.userData.hostOffset) || 0;
    data.sillHeight = Number(root.userData.sillHeight ?? 1.05);
    data.slideDirection = Number(root.userData.slideDirection) || 1;
    data.open = false;
  }
  if (kind === 'cable') {
    data.fromId = root.userData.fromId;
    data.toId = root.userData.toId;
  }
  return data;
}

export function createObjectFromData(data, world = null) {
  const position = new THREE.Vector3().fromArray(data.position || [0, 0, 0]);
  const common = {
    id: data.id,
    meta: data.meta,
    color: data.color,
    locked: data.locked,
    hidden: data.hidden,
    hostWallId: data.hostWallId,
    hostOffset: data.hostOffset,
    sillHeight: data.sillHeight,
    slideDirection: data.slideDirection,
    open: false,
  };
  const dimensions = data.dimensions || {};
  let root = null;
  if (data.kind === 'wall') {
    const segment = data.segment || {
      start: [position.x - (data.dimensions?.width || 2) / 2, position.z],
      end: [position.x + (data.dimensions?.width || 2) / 2, position.z],
      height: data.dimensions?.height || 3,
      thickness: data.dimensions?.depth || 0.16,
    };
    root = createWall(segment.start, segment.end, { ...common, height: segment.height, thickness: segment.thickness, world: null });
  } else if (data.kind === 'road' || data.kind === 'sidewalk') {
    const segment = data.segment || {
      start: [position.x - (data.dimensions?.width || 4) / 2, position.z],
      end: [position.x + (data.dimensions?.width || 4) / 2, position.z],
      width: data.dimensions?.depth || (data.kind === 'road' ? 6 : 1.5),
    };
    root = data.kind === 'road'
      ? createRoad(segment.start, segment.end, { ...common, width: segment.width })
      : createSidewalk(segment.start, segment.end, { ...common, width: segment.width });
  } else if (data.kind === 'cable') {
    root = createCable(null, null, { ...common, fromId: data.fromId, toId: data.toId });
  } else {
    root = createObject(data.kind, position, OPENING_KINDS.has(data.kind) ? { ...common, ...dimensions } : common);
  }
  if (!root) return null;
  if (!SEGMENT_KINDS.has(data.kind) && data.kind !== 'cable') {
    root.position.fromArray(data.position || [0, 0, 0]);
    root.rotation.set(...(data.rotation || [0, 0, 0]));
    if (OPENING_KINDS.has(data.kind)) root.scale.set(1, 1, 1);
    else root.scale.fromArray(data.scale || [1, 1, 1]);
    if (data.dimensions) root.userData.dimensions = { ...data.dimensions };
  }
  root.userData.meta = copyMeta(data.kind, data.meta);
  root.userData.locked = Boolean(data.locked);
  root.userData.hidden = Boolean(data.hidden);
  root.visible = !root.userData.hidden;
  return root;
}

export function finalizeLoadedWorld(world) {
  for (const wall of world.children.filter((item) => item.userData.kind === 'wall')) rebuildWall(wall, world);
  for (const opening of world.children.filter((item) => OPENING_KINDS.has(item.userData.kind))) {
    const wall = world.children.find((item) => item.userData.objectId === opening.userData.hostWallId);
    if (wall) updateWallAttachments(wall, world);
  }
  updateAllCables(world);
}

export function worldPositionForObject(root) {
  const result = new THREE.Vector3();
  root.getWorldPosition(result);
  return result;
}

export function networkValidation(world) {
  const issues = [];
  const ipMap = new Map();
  const portMap = new Map();
  for (const root of world.children.filter((item) => NETWORK_KINDS.has(item.userData.kind))) {
    const meta = root.userData.meta || {};
    const name = meta.name || objectLabel(root.userData.kind);
    const ip = String(meta.ip || '').trim();
    if (ip) {
      if (ipMap.has(ip)) issues.push(`IP duplicado ${ip}: ${ipMap.get(ip)} e ${name}.`);
      else ipMap.set(ip, name);
    }
    const sw = String(meta.switchName || '').trim();
    const port = String(meta.port || '').trim();
    if (sw && port) {
      const key = `${sw.toLowerCase()}|${port.toLowerCase()}`;
      if (portMap.has(key)) issues.push(`Porta ocupada ${sw}/${port}: ${portMap.get(key)} e ${name}.`);
      else portMap.set(key, name);
    }
    if (['computer', 'laptop', 'printer', 'server'].includes(root.userData.kind) && !ip) issues.push(`${name} ainda não possui IP.`);
  }
  return issues;
}

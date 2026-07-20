import * as THREE from 'three';

const TEXTURE_SIZE = 1024;
const canvasCache = new Map();
const textureCache = new Map();

let activeProfile = {
  enabled: false,
  anisotropy: 1,
};

function seededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function roundedNoise(random, min, max) {
  return Math.round(min + (max - min) * random());
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  return canvas;
}

function fillNoisePixels(context, random, base, variance, density = 1) {
  const image = context.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const coarse = random() - 0.5;
    const fine = random() - 0.5;
    const value = THREE.MathUtils.clamp(base + coarse * variance + fine * variance * density, 0, 255);
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function drawPlaster(context, random) {
  fillNoisePixels(context, random, 229, 12, 0.35);
  context.globalAlpha = 0.12;
  for (let index = 0; index < 1250; index += 1) {
    const value = roundedNoise(random, 190, 245);
    context.fillStyle = `rgb(${value},${value},${value})`;
    const radius = 2 + random() * 13;
    context.beginPath();
    context.arc(random() * TEXTURE_SIZE, random() * TEXTURE_SIZE, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawConcrete(context, random) {
  fillNoisePixels(context, random, 205, 34, 0.55);
  context.globalAlpha = 0.22;
  for (let index = 0; index < 900; index += 1) {
    const value = roundedNoise(random, 145, 235);
    context.fillStyle = `rgb(${value},${value},${value})`;
    const radius = 1 + random() * 9;
    context.beginPath();
    context.arc(random() * TEXTURE_SIZE, random() * TEXTURE_SIZE, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 0.18;
  context.strokeStyle = '#565656';
  context.lineWidth = 1;
  for (let crack = 0; crack < 8; crack += 1) {
    let x = random() * TEXTURE_SIZE;
    let y = random() * TEXTURE_SIZE;
    context.beginPath();
    context.moveTo(x, y);
    for (let point = 0; point < 5; point += 1) {
      x += (random() - 0.5) * 80;
      y += (random() - 0.5) * 80;
      context.lineTo(x, y);
    }
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawAsphalt(context, random) {
  fillNoisePixels(context, random, 142, 45, 0.8);
  context.globalAlpha = 0.44;
  for (let index = 0; index < 28000; index += 1) {
    const value = roundedNoise(random, 92, 224);
    context.fillStyle = `rgb(${value},${value},${value})`;
    const radius = 0.35 + random() * 1.6;
    context.fillRect(random() * TEXTURE_SIZE, random() * TEXTURE_SIZE, radius, radius);
  }
  context.globalAlpha = 1;
}

function drawPavers(context, random) {
  context.fillStyle = '#d8d8d3';
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const cellW = 128;
  const cellH = 64;
  for (let row = -1; row < TEXTURE_SIZE / cellH + 1; row += 1) {
    const offset = row % 2 ? cellW / 2 : 0;
    for (let column = -1; column < TEXTURE_SIZE / cellW + 1; column += 1) {
      const x = column * cellW + offset;
      const y = row * cellH;
      const value = roundedNoise(random, 194, 235);
      context.fillStyle = `rgb(${value},${value},${value})`;
      context.fillRect(x + 3, y + 3, cellW - 6, cellH - 6);
      context.globalAlpha = 0.16;
      for (let speck = 0; speck < 16; speck += 1) {
        context.fillStyle = random() > 0.5 ? '#ffffff' : '#777777';
        context.fillRect(x + random() * cellW, y + random() * cellH, 1.5, 1.5);
      }
      context.globalAlpha = 1;
    }
  }
}

function drawGrass(context, random) {
  context.fillStyle = '#d6ddd0';
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  context.lineWidth = 1;
  context.globalAlpha = 0.42;
  for (let blade = 0; blade < 30000; blade += 1) {
    const value = roundedNoise(random, 115, 245);
    context.strokeStyle = `rgb(${value},${value},${value})`;
    const x = random() * TEXTURE_SIZE;
    const y = random() * TEXTURE_SIZE;
    const length = 2 + random() * 7;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (random() - 0.5) * 3, y - length);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawWood(context, random) {
  context.fillStyle = '#d2c3ad';
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y += 2) {
    const wave = Math.sin(y * 0.028) * 8 + Math.sin(y * 0.007) * 16;
    const value = roundedNoise(random, 145, 224);
    context.strokeStyle = `rgb(${value},${value},${value})`;
    context.globalAlpha = 0.18 + random() * 0.18;
    context.beginPath();
    context.moveTo(0, y);
    for (let x = 0; x <= TEXTURE_SIZE; x += 24) {
      context.lineTo(x, y + Math.sin(x * 0.018 + wave) * (1 + random() * 2));
    }
    context.stroke();
  }
  context.globalAlpha = 0.22;
  context.strokeStyle = '#62584b';
  for (let knot = 0; knot < 12; knot += 1) {
    const x = random() * TEXTURE_SIZE;
    const y = random() * TEXTURE_SIZE;
    const radius = 8 + random() * 22;
    context.beginPath();
    context.ellipse(x, y, radius * 2.4, radius, random() * 0.5, 0, Math.PI * 2);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawBrushedMetal(context, random) {
  context.fillStyle = '#d5d7d8';
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y += 1) {
    const value = roundedNoise(random, 175, 244);
    context.strokeStyle = `rgb(${value},${value},${value})`;
    context.globalAlpha = 0.12 + random() * 0.26;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(TEXTURE_SIZE, y + (random() - 0.5) * 1.2);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawCorrugatedMetal(context, random) {
  context.fillStyle = '#d4d7d8';
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const band = 48;
  for (let x = 0; x < TEXTURE_SIZE + band; x += band) {
    const gradient = context.createLinearGradient(x, 0, x + band, 0);
    gradient.addColorStop(0, '#9fa5a7');
    gradient.addColorStop(0.28, '#e4e7e7');
    gradient.addColorStop(0.55, '#b2b7b8');
    gradient.addColorStop(0.82, '#eff1f1');
    gradient.addColorStop(1, '#a2a7a8');
    context.fillStyle = gradient;
    context.fillRect(x, 0, band + 1, TEXTURE_SIZE);
  }
  context.globalAlpha = 0.15;
  for (let index = 0; index < 1600; index += 1) {
    const value = roundedNoise(random, 120, 245);
    context.fillStyle = `rgb(${value},${value},${value})`;
    context.fillRect(random() * TEXTURE_SIZE, random() * TEXTURE_SIZE, 1, 3 + random() * 8);
  }
  context.globalAlpha = 1;
}

function drawFabric(context, random) {
  context.fillStyle = '#d4d4d4';
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  context.lineWidth = 1;
  for (let line = 0; line < TEXTURE_SIZE; line += 5) {
    const valueA = roundedNoise(random, 155, 230);
    const valueB = roundedNoise(random, 165, 238);
    context.globalAlpha = 0.22;
    context.strokeStyle = `rgb(${valueA},${valueA},${valueA})`;
    context.beginPath();
    context.moveTo(line, 0);
    context.lineTo(line, TEXTURE_SIZE);
    context.stroke();
    context.strokeStyle = `rgb(${valueB},${valueB},${valueB})`;
    context.beginPath();
    context.moveTo(0, line);
    context.lineTo(TEXTURE_SIZE, line);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawPaintedMetal(context, random) {
  fillNoisePixels(context, random, 230, 11, 0.24);
  context.globalAlpha = 0.15;
  for (let index = 0; index < 6000; index += 1) {
    const value = roundedNoise(random, 185, 250);
    context.fillStyle = `rgb(${value},${value},${value})`;
    const radius = 0.4 + random() * 1.2;
    context.fillRect(random() * TEXTURE_SIZE, random() * TEXTURE_SIZE, radius, radius);
  }
  context.globalAlpha = 1;
}

function drawCeramic(context, random) {
  context.fillStyle = '#e3e3e0';
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const tile = 256;
  for (let y = 0; y < TEXTURE_SIZE; y += tile) {
    for (let x = 0; x < TEXTURE_SIZE; x += tile) {
      const value = roundedNoise(random, 210, 243);
      context.fillStyle = `rgb(${value},${value},${value})`;
      context.fillRect(x + 7, y + 7, tile - 14, tile - 14);
      context.globalAlpha = 0.08;
      for (let cloud = 0; cloud < 18; cloud += 1) {
        context.fillStyle = random() > 0.5 ? '#ffffff' : '#8a8a8a';
        context.beginPath();
        context.arc(x + random() * tile, y + random() * tile, 5 + random() * 22, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
    }
  }
}

function textureCanvas(style) {
  if (canvasCache.has(style)) return canvasCache.get(style);
  const canvas = makeCanvas();
  const context = canvas.getContext('2d', { alpha: false });
  const random = seededRandom([...style].reduce((sum, char) => sum + char.charCodeAt(0), 713));
  const drawers = {
    plaster: drawPlaster,
    concrete: drawConcrete,
    asphalt: drawAsphalt,
    pavers: drawPavers,
    grass: drawGrass,
    wood: drawWood,
    brushedMetal: drawBrushedMetal,
    corrugatedMetal: drawCorrugatedMetal,
    fabric: drawFabric,
    paintedMetal: drawPaintedMetal,
    ceramic: drawCeramic,
  };
  (drawers[style] || drawPlaster)(context, random);
  canvasCache.set(style, canvas);
  return canvas;
}

function quantizeRepeat(value) {
  return Math.max(1, Math.min(24, Math.round(value * 2) / 2));
}

function getTexturePair(style, repeatX, repeatY) {
  const rx = quantizeRepeat(repeatX);
  const ry = quantizeRepeat(repeatY);
  const key = `${style}:${rx}:${ry}:${activeProfile.anisotropy}`;
  if (textureCache.has(key)) return textureCache.get(key);
  const canvas = textureCanvas(style);
  const configure = (texture, isColor) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(rx, ry);
    texture.anisotropy = activeProfile.anisotropy;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.userData.hdShared = true;
    texture.needsUpdate = true;
    return texture;
  };
  const pair = {
    map: configure(new THREE.CanvasTexture(canvas), true),
    bumpMap: configure(new THREE.CanvasTexture(canvas), false),
  };
  textureCache.set(key, pair);
  return pair;
}

const STYLE_SETTINGS = {
  plaster: { tile: 1.35, roughness: 0.88, metalness: 0, bumpScale: 0.018 },
  concrete: { tile: 1.65, roughness: 0.9, metalness: 0, bumpScale: 0.035 },
  asphalt: { tile: 2.4, roughness: 0.98, metalness: 0, bumpScale: 0.055 },
  pavers: { tile: 1.0, roughness: 0.94, metalness: 0, bumpScale: 0.045 },
  grass: { tile: 1.2, roughness: 1, metalness: 0, bumpScale: 0.075 },
  wood: { tile: 1.1, roughness: 0.68, metalness: 0, bumpScale: 0.022 },
  brushedMetal: { tile: 1.15, roughness: 0.46, metalness: 0.62, bumpScale: 0.008 },
  corrugatedMetal: { tile: 1.15, roughness: 0.54, metalness: 0.52, bumpScale: 0.05 },
  fabric: { tile: 0.42, roughness: 0.97, metalness: 0, bumpScale: 0.032 },
  paintedMetal: { tile: 0.85, roughness: 0.34, metalness: 0.28, bumpScale: 0.01 },
  ceramic: { tile: 1.4, roughness: 0.32, metalness: 0.03, bumpScale: 0.012 },
};

function objectStyle(root, mesh, material) {
  if (!root || !mesh || !material || material.transparent || material.opacity < 0.94) return null;
  const kind = root.userData?.kind;
  const name = String(mesh.name || '').toLowerCase();
  const keepColor = Boolean(mesh.userData?.keepColor);

  if (['glassWall', 'glassPanel', 'window', 'cable', 'spawnPoint'].includes(kind)) return null;
  if (keepColor && !['carport'].includes(kind)) return null;
  const emissiveActive = material.emissive && material.emissive.getHex() !== 0 && material.emissiveIntensity > 0.05;
  if (emissiveActive || material.roughness < 0.23) return null;

  if (kind === 'wall') return 'plaster';
  if (kind === 'floorSlab') return root.userData?.meta?.finish === 'ceramic' ? 'ceramic' : 'concrete';
  if (['stairs', 'roof'].includes(kind)) return 'concrete';
  if (['road', 'parking'].includes(kind)) return 'asphalt';
  if (kind === 'sidewalk') return 'pavers';
  if (kind === 'grass') return 'grass';
  if (['table', 'cabinet', 'shelf', 'door'].includes(kind)) return 'wood';
  if (kind === 'chair') return keepColor ? null : 'fabric';
  if (kind === 'slidingGate') return 'corrugatedMetal';
  if (kind === 'carport') return name.includes('roof') ? 'corrugatedMetal' : 'brushedMetal';
  if (['car', 'motorcycle'].includes(kind)) return keepColor ? null : 'paintedMetal';
  if (['rack', 'server', 'switch'].includes(kind)) return keepColor ? null : 'brushedMetal';
  if (['computer', 'laptop', 'printer', 'network', 'router', 'documentationTerminal', 'television'].includes(kind)) {
    if (material.metalness >= 0.12) return 'brushedMetal';
    return keepColor ? null : 'paintedMetal';
  }
  return null;
}

function meshRepeat(mesh, style) {
  const geometry = mesh.geometry;
  if (!geometry) return { x: 1, y: 1 };
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const size = geometry.boundingBox?.getSize(new THREE.Vector3()) || new THREE.Vector3(1, 1, 1);
  const dimensions = [Math.abs(size.x * mesh.scale.x), Math.abs(size.y * mesh.scale.y), Math.abs(size.z * mesh.scale.z)]
    .filter((value) => Number.isFinite(value) && value > 0.001)
    .sort((a, b) => b - a);
  const tile = STYLE_SETTINGS[style]?.tile || 1;
  return {
    x: quantizeRepeat((dimensions[0] || 1) / tile),
    y: quantizeRepeat((dimensions[1] || dimensions[0] || 1) / tile),
  };
}

function captureOriginal(material) {
  material.userData ||= {};
  if (material.userData.hdOriginal) return;
  material.userData.hdOriginal = {
    map: material.map || null,
    bumpMap: material.bumpMap || null,
    bumpScale: material.bumpScale,
    roughness: material.roughness,
    metalness: material.metalness,
  };
}

function restoreMaterial(material) {
  const original = material?.userData?.hdOriginal;
  if (!original) return;
  material.map = original.map;
  material.bumpMap = original.bumpMap;
  material.bumpScale = original.bumpScale;
  material.roughness = original.roughness;
  material.metalness = original.metalness;
  delete material.userData.hdStyle;
  material.needsUpdate = true;
}

function applyStyle(mesh, material, style) {
  captureOriginal(material);
  const settings = STYLE_SETTINGS[style] || STYLE_SETTINGS.plaster;
  const repeat = meshRepeat(mesh, style);
  const textures = getTexturePair(style, repeat.x, repeat.y);
  material.map = textures.map;
  material.bumpMap = textures.bumpMap;
  material.bumpScale = settings.bumpScale;
  material.roughness = settings.roughness;
  material.metalness = settings.metalness;
  material.userData.hdStyle = style;
  material.needsUpdate = true;
}

export function configureVisualMaterials({ enabled = false, anisotropy = 1 } = {}) {
  activeProfile = {
    enabled: Boolean(enabled),
    anisotropy: Math.max(1, Math.min(16, Math.floor(Number(anisotropy) || 1))),
  };
}

export function applyVisualMaterials(root) {
  if (!root?.traverse) return;
  root.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      if (!material || !('roughness' in material)) continue;
      if (!activeProfile.enabled) {
        restoreMaterial(material);
        continue;
      }
      const style = objectStyle(root, mesh, material);
      if (style) applyStyle(mesh, material, style);
      else restoreMaterial(material);
    }
  });
}

export function applyStandaloneSurface(mesh, style = 'concrete') {
  if (!mesh?.material) return;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (!material || !('roughness' in material)) continue;
    if (!activeProfile.enabled) restoreMaterial(material);
    else applyStyle(mesh, material, style);
  }
}

import * as THREE from 'three';

export const DEFAULT_AVATAR = Object.freeze({
  bodyType: 'woman',
  skin: '#d8a178',
  hairStyle: 'short',
  hair: '#2e211d',
  shirtStyle: 'custom',
  shirt: '#397bc5',
  pants: '#24364b',
  shoes: '#242424',
});

export const AVATAR_OPTIONS = {
  bodyTypes: [
    { value: 'woman', label: 'Mulher' },
    { value: 'man', label: 'Homem' },
  ],
  skin: ['#f2d2b6', '#e5b38d', '#d08b62', '#a86645', '#75442f', '#4c2b20'],
  hair: ['#201815', '#4b2d1f', '#7a4b2d', '#b98654', '#d9c2a1', '#111111', '#713a2b'],
  shirt: ['#397bc5', '#c74c4c', '#4e9a64', '#d28a2d', '#7d5bc7', '#e3d28e', '#2c2f33'],
  shirtStyles: [
    { value: 'custom', label: 'Personalizada' },
    { value: 'brazil', label: 'Brasil' },
    { value: 'argentina', label: 'Argentina' },
    { value: 'portugal', label: 'Portugal' },
    { value: 'france', label: 'França' },
    { value: 'germany', label: 'Alemanha' },
    { value: 'spain', label: 'Espanha' },
    { value: 'italy', label: 'Itália' },
    { value: 'japan', label: 'Japão' },
  ],
  pants: ['#24364b', '#2f2f33', '#4f5d46', '#725542', '#394e70'],
  shoes: ['#242424', '#f0f0ed', '#603c2d', '#374d6b', '#8b2f2f'],
  hairStyles: [
    { value: 'none', label: 'Sem cabelo' },
    { value: 'short', label: 'Curto' },
    { value: 'long', label: 'Longo' },
    { value: 'bun', label: 'Coque' },
    { value: 'mohawk', label: 'Moicano' },
    { value: 'cap', label: 'Boné' },
  ],
};

export function sanitizeAvatar(input = {}) {
  const bodyTypeValues = new Set(AVATAR_OPTIONS.bodyTypes.map((item) => item.value));
  const styleValues = new Set(AVATAR_OPTIONS.hairStyles.map((item) => item.value));
  const shirtStyleValues = new Set(AVATAR_OPTIONS.shirtStyles.map((item) => item.value));
  const color = (value, fallback) => {
    try {
      return `#${new THREE.Color(value || fallback).getHexString()}`;
    } catch {
      return fallback;
    }
  };

  return {
    bodyType: bodyTypeValues.has(input.bodyType) ? input.bodyType : DEFAULT_AVATAR.bodyType,
    skin: color(input.skin, DEFAULT_AVATAR.skin),
    hairStyle: styleValues.has(input.hairStyle) ? input.hairStyle : DEFAULT_AVATAR.hairStyle,
    hair: color(input.hair, DEFAULT_AVATAR.hair),
    shirtStyle: shirtStyleValues.has(input.shirtStyle) ? input.shirtStyle : DEFAULT_AVATAR.shirtStyle,
    shirt: color(input.shirt, DEFAULT_AVATAR.shirt),
    pants: color(input.pants, DEFAULT_AVATAR.pants),
    shoes: color(input.shoes, DEFAULT_AVATAR.shoes),
  };
}

function material(color, roughness = 0.78) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function mesh(geometry, color, castShadow = true) {
  const result = new THREE.Mesh(geometry, material(color));
  result.castShadow = castShadow;
  result.receiveShadow = castShadow;
  return result;
}

function createNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '700 50px system-ui, Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 11;
  context.strokeStyle = 'rgba(0,0,0,.82)';
  context.strokeText(String(name || 'Visitante').slice(0, 28), 256, 64);
  context.fillStyle = '#ffffff';
  context.fillText(String(name || 'Visitante').slice(0, 28), 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.position.y = 2.48;
  sprite.scale.set(3.25, 0.82, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function makeLimb(color, length, radius = 0.11) {
  const pivot = new THREE.Group();
  const part = mesh(new THREE.CapsuleGeometry(radius, Math.max(0.1, length - radius * 2), 4, 8), color);
  part.position.y = -length / 2;
  pivot.add(part);
  return { pivot, part };
}

function addHair(head, appearance) {
  const color = appearance.hair;
  const group = new THREE.Group();
  group.name = 'hair';

  if (appearance.hairStyle === 'none') {
    head.add(group);
    return group;
  }

  if (appearance.hairStyle === 'short' || appearance.hairStyle === 'long' || appearance.hairStyle === 'bun') {
    const top = mesh(new THREE.SphereGeometry(0.296, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.53), color);
    top.position.y = 0.105;
    top.scale.set(1.02, 1, 1.04);
    group.add(top);
  }

  if (appearance.hairStyle === 'long') {
    const back = mesh(new THREE.BoxGeometry(0.49, 0.58, 0.13), color);
    back.position.set(0, -0.19, 0.205);
    back.rotation.x = -0.05;
    group.add(back);
  }

  if (appearance.hairStyle === 'bun') {
    const bun = mesh(new THREE.SphereGeometry(0.16, 14, 10), color);
    bun.position.set(0, 0.31, 0.17);
    group.add(bun);
  }

  if (appearance.hairStyle === 'mohawk') {
    for (let index = 0; index < 6; index += 1) {
      const spike = mesh(new THREE.ConeGeometry(0.072, 0.24, 8), color);
      spike.position.set(0, 0.34, -0.21 + index * 0.084);
      group.add(spike);
    }
  }

  if (appearance.hairStyle === 'cap') {
    const cap = mesh(new THREE.SphereGeometry(0.306, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.54), color);
    cap.position.y = 0.12;
    cap.scale.z = 1.04;
    group.add(cap);
    const brim = mesh(new THREE.BoxGeometry(0.38, 0.045, 0.19), color);
    brim.position.set(0, 0.055, -0.285);
    brim.rotation.x = -0.05;
    group.add(brim);
    const button = mesh(new THREE.SphereGeometry(0.035, 8, 6), color);
    button.position.set(0, 0.415, 0);
    group.add(button);
  }

  head.add(group);
  return group;
}

function shirtPalette(appearance) {
  const palettes = {
    brazil: { base: '#f4cf27', accent: '#18864b', accent2: '#2657a7' },
    argentina: { base: '#f7f7f2', accent: '#74b9e6', accent2: '#e0b83c' },
    portugal: { base: '#b51f32', accent: '#176b46', accent2: '#e9c451' },
    france: { base: '#183b73', accent: '#ffffff', accent2: '#d62f3d' },
    germany: { base: '#f2f2ef', accent: '#202020', accent2: '#c93632' },
    spain: { base: '#b8202d', accent: '#f0c72d', accent2: '#6e1831' },
    italy: { base: '#2872be', accent: '#ffffff', accent2: '#d43c46' },
    japan: { base: '#244e91', accent: '#ffffff', accent2: '#c83242' },
  };
  return palettes[appearance.shirtStyle] || { base: appearance.shirt, accent: '#ffffff', accent2: '#222222' };
}

function jerseyPatch(width, height, color, x, y, z = -0.181) {
  const patch = mesh(new THREE.BoxGeometry(width, height, 0.022), color);
  patch.position.set(x, y, z);
  return patch;
}


function drawShieldPath(context, size) {
  const x = size * 0.18;
  const y = size * 0.08;
  const w = size * 0.64;
  const h = size * 0.82;
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x + w, y);
  context.lineTo(x + w * 0.94, y + h * 0.62);
  context.quadraticCurveTo(x + w * 0.5, y + h, x + w * 0.06, y + h * 0.62);
  context.closePath();
}

function selectionBadgeTexture(style) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const palettes = {
    brazil: ['#18864b', '#f4cf27', '#2657a7', 'BRA'],
    argentina: ['#74b9e6', '#ffffff', '#d8ad38', 'ARG'],
    portugal: ['#176b46', '#b51f32', '#e9c451', 'POR'],
    france: ['#183b73', '#ffffff', '#d62f3d', 'FRA'],
    germany: ['#161616', '#c93632', '#d4ad2d', 'GER'],
    spain: ['#b8202d', '#f0c72d', '#6e1831', 'ESP'],
    italy: ['#2872be', '#ffffff', '#d43c46', 'ITA'],
    japan: ['#244e91', '#ffffff', '#c83242', 'JPN'],
  };
  const [primary, secondary, accent, code] = palettes[style] || ['#444', '#eee', '#888', 'TEAM'];

  context.clearRect(0, 0, 128, 128);
  context.save();
  drawShieldPath(context, 128);
  context.clip();

  if (style === 'argentina') {
    for (let index = 0; index < 5; index += 1) {
      context.fillStyle = index % 2 === 0 ? primary : secondary;
      context.fillRect(index * 26 - 1, 0, 27, 128);
    }
  } else if (style === 'france' || style === 'italy') {
    const colors = style === 'france'
      ? ['#183b73', '#ffffff', '#d62f3d']
      : ['#2d9a55', '#ffffff', '#d43c46'];
    colors.forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(index * 43, 0, 44, 128);
    });
  } else if (style === 'germany') {
    ['#161616', '#c93632', '#d4ad2d'].forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(0, index * 43, 128, 44);
    });
  } else if (style === 'portugal') {
    context.fillStyle = '#176b46';
    context.fillRect(0, 0, 48, 128);
    context.fillStyle = '#b51f32';
    context.fillRect(48, 0, 80, 128);
  } else if (style === 'spain') {
    context.fillStyle = '#b8202d';
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = '#f0c72d';
    context.fillRect(0, 31, 128, 66);
  } else {
    context.fillStyle = primary;
    context.fillRect(0, 0, 128, 128);
  }

  if (style === 'brazil') {
    context.fillStyle = secondary;
    context.beginPath();
    context.moveTo(64, 19);
    context.lineTo(105, 64);
    context.lineTo(64, 109);
    context.lineTo(23, 64);
    context.closePath();
    context.fill();
    context.fillStyle = accent;
    context.beginPath();
    context.arc(64, 64, 22, 0, Math.PI * 2);
    context.fill();
  } else if (style === 'japan') {
    context.fillStyle = secondary;
    context.fillRect(0, 0, 128, 128);
    context.fillStyle = accent;
    context.beginPath();
    context.arc(64, 57, 26, 0, Math.PI * 2);
    context.fill();
  }

  context.restore();

  context.lineWidth = 8;
  context.strokeStyle = accent;
  drawShieldPath(context, 128);
  context.stroke();

  context.fillStyle = '#ffffff';
  context.strokeStyle = 'rgba(0,0,0,.65)';
  context.lineWidth = 5;
  context.font = '900 27px system-ui, Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.strokeText(code, 64, 83);
  context.fillText(code, 64, 83);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createSelectionBadge(style) {
  const texture = selectionBadgeTexture(style);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.2), material);
  badge.position.set(0.17, 0.61, -0.194);
  badge.rotation.y = Math.PI;
  badge.renderOrder = 4;
  badge.userData.isSelectionBadge = true;
  return badge;
}

function addJerseyDetails(hips, appearance) {
  const style = appearance.shirtStyle;
  if (!style || style === 'custom') return;
  const palette = shirtPalette(appearance);
  const details = new THREE.Group();
  details.name = 'jersey-details';

  if (style === 'argentina') {
    for (const x of [-0.205, 0, 0.205]) details.add(jerseyPatch(0.105, 0.62, palette.accent, x, 0.48));
  } else if (style === 'france') {
    details.add(jerseyPatch(0.07, 0.62, palette.accent, -0.038, 0.48));
    details.add(jerseyPatch(0.07, 0.62, palette.accent2, 0.038, 0.48));
  } else if (style === 'germany') {
    details.add(jerseyPatch(0.5, 0.055, palette.accent, 0, 0.58));
    details.add(jerseyPatch(0.5, 0.055, palette.accent2, 0, 0.51));
    details.add(jerseyPatch(0.5, 0.055, '#d4ad2d', 0, 0.44));
  } else if (style === 'portugal') {
    details.add(jerseyPatch(0.17, 0.66, palette.accent, 0.225, 0.48));
    details.add(jerseyPatch(0.07, 0.15, palette.accent2, 0.08, 0.62));
  } else if (style === 'spain') {
    details.add(jerseyPatch(0.5, 0.07, palette.accent, 0, 0.69));
    details.add(jerseyPatch(0.07, 0.52, palette.accent, -0.255, 0.46));
    details.add(jerseyPatch(0.07, 0.52, palette.accent, 0.255, 0.46));
  } else if (style === 'italy') {
    details.add(jerseyPatch(0.5, 0.055, palette.accent, 0, 0.72));
    details.add(jerseyPatch(0.055, 0.16, '#2d9a55', -0.04, 0.61));
    details.add(jerseyPatch(0.055, 0.16, palette.accent2, 0.04, 0.61));
  } else if (style === 'japan') {
    details.add(jerseyPatch(0.5, 0.05, palette.accent, 0, 0.70));
  } else if (style === 'brazil') {
    details.add(jerseyPatch(0.5, 0.055, palette.accent, 0, 0.71));
  }

  details.add(createSelectionBadge(style));
  hips.add(details);
}

export function createAvatar(player = {}, options = {}) {
  const appearance = sanitizeAvatar(player.avatar || player.appearance || {});
  const root = new THREE.Group();
  root.name = `avatar:${player.id || 'preview'}`;

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);

  const palette = shirtPalette(appearance);
  const isWoman = appearance.bodyType === 'woman';
  const torsoWidth = isWoman ? 0.55 : 0.66;
  const shoulderX = isWoman ? 0.35 : 0.41;
  const legX = isWoman ? 0.16 : 0.18;

  const torso = mesh(new THREE.BoxGeometry(torsoWidth, 0.72, 0.34), palette.base);
  torso.position.y = 0.48;
  hips.add(torso);

  if (isWoman) {
    const waist = mesh(new THREE.BoxGeometry(0.47, 0.25, 0.32), palette.base);
    waist.position.y = 0.14;
    hips.add(waist);
    const hipShape = mesh(new THREE.BoxGeometry(0.61, 0.22, 0.34), appearance.pants);
    hipShape.position.y = -0.02;
    hips.add(hipShape);
  } else {
    const hipShape = mesh(new THREE.BoxGeometry(0.55, 0.2, 0.33), appearance.pants);
    hipShape.position.y = -0.02;
    hips.add(hipShape);
  }

  const neck = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 10), appearance.skin);
  neck.position.y = 0.91;
  hips.add(neck);

  const head = mesh(new THREE.SphereGeometry(0.27, 16, 12), appearance.skin);
  head.position.y = 1.16;
  hips.add(head);

  const nose = mesh(new THREE.ConeGeometry(0.045, 0.12, 8), appearance.skin);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 1.15, -0.27);
  hips.add(nose);

  const eyeMaterial = material('#1a1a1a', 0.5);
  for (const x of [-0.09, 0.09]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeMaterial);
    eye.position.set(x, 1.22, -0.247);
    hips.add(eye);
  }

  addHair(head, appearance);
  addJerseyDetails(hips, appearance);

  const leftArm = makeLimb(palette.base, 0.62, 0.105);
  leftArm.pivot.position.set(-shoulderX, 0.78, 0);
  leftArm.pivot.rotation.z = -0.08;
  hips.add(leftArm.pivot);

  const rightArm = makeLimb(palette.base, 0.62, 0.105);
  rightArm.pivot.position.set(shoulderX, 0.78, 0);
  rightArm.pivot.rotation.z = 0.08;
  hips.add(rightArm.pivot);

  const leftHand = mesh(new THREE.SphereGeometry(0.105, 10, 8), appearance.skin);
  leftHand.position.y = -0.62;
  leftArm.pivot.add(leftHand);

  const rightHand = mesh(new THREE.SphereGeometry(0.105, 10, 8), appearance.skin);
  rightHand.position.y = -0.62;
  rightArm.pivot.add(rightHand);

  const leftLeg = makeLimb(appearance.pants, 0.76, 0.12);
  leftLeg.pivot.position.set(-legX, 0.08, 0);
  hips.add(leftLeg.pivot);

  const rightLeg = makeLimb(appearance.pants, 0.76, 0.12);
  rightLeg.pivot.position.set(legX, 0.08, 0);
  hips.add(rightLeg.pivot);

  const leftShoe = mesh(new THREE.BoxGeometry(0.25, 0.15, 0.38), appearance.shoes);
  leftShoe.position.set(0, -0.75, -0.075);
  leftLeg.pivot.add(leftShoe);

  const rightShoe = mesh(new THREE.BoxGeometry(0.25, 0.15, 0.38), appearance.shoes);
  rightShoe.position.set(0, -0.75, -0.075);
  rightLeg.pivot.add(rightShoe);

  if (options.showName !== false) root.add(createNameSprite(player.name || 'Visitante'));

  root.position.set(Number(player.x) || 0, 0, Number(player.z) || 0);
  root.rotation.y = Number(player.ry) || 0;
  root.userData.targetPosition = root.position.clone();
  root.userData.targetRotation = root.rotation.y;
  root.userData.playerName = player.name || 'Visitante';
  root.userData.playerId = player.id || '';
  root.userData.moving = Boolean(player.moving);
  root.userData.walkPhase = Math.random() * Math.PI * 2;
  root.userData.gesture = '';
  root.userData.gestureUntil = 0;
  root.userData.rig = {
    hips,
    torso,
    head,
    leftArm: leftArm.pivot,
    rightArm: rightArm.pivot,
    leftLeg: leftLeg.pivot,
    rightLeg: rightLeg.pivot,
  };
  root.userData.appearance = appearance;
  root.userData.bodyType = appearance.bodyType;
  return root;
}

export function applyAvatarState(root, player = {}) {
  if (!root) return;
  root.userData.targetPosition.set(Number(player.x) || 0, 0, Number(player.z) || 0);
  root.userData.targetRotation = Number(player.ry) || 0;
  root.userData.moving = Boolean(player.moving);
  if (player.gesture) {
    root.userData.gesture = player.gesture;
    root.userData.gestureUntil = performance.now() + 1550;
  }
}

export function updateAvatar(root, delta, elapsed) {
  if (!root?.userData?.rig) return;
  const rig = root.userData.rig;
  const moving = Boolean(root.userData.moving);
  const speed = moving ? 9 : 3;
  root.userData.walkPhase += delta * speed;
  const phase = root.userData.walkPhase;
  const swing = moving ? Math.sin(phase) * 0.72 : Math.sin(elapsed * 1.4 + phase) * 0.035;
  const bounce = moving ? Math.abs(Math.sin(phase)) * 0.045 : Math.sin(elapsed * 1.5 + phase) * 0.01;

  rig.leftLeg.rotation.x = swing;
  rig.rightLeg.rotation.x = -swing;
  rig.leftArm.rotation.x = -swing * 0.72;
  rig.rightArm.rotation.x = swing * 0.72;
  rig.hips.position.y = 0.92 + bounce;
  rig.torso.rotation.z = moving ? Math.sin(phase * 0.5) * 0.025 : 0;

  const gestureActive = root.userData.gestureUntil > performance.now();
  if (gestureActive && root.userData.gesture === 'wave') {
    // O braço direito sobe para fora do tronco. O sinal positivo no eixo Z
    // evita que o membro atravesse o peito do avatar.
    rig.rightArm.rotation.z = 2.62;
    rig.rightArm.rotation.x = 0.18 + Math.sin(elapsed * 12) * 0.34;
    rig.rightArm.rotation.y = -0.12;
  } else if (gestureActive && root.userData.gesture === 'point') {
    // O eixo frontal do avatar é -Z; +90° em X aponta o braço para a frente.
    rig.rightArm.rotation.z = 0.12;
    rig.rightArm.rotation.x = Math.PI * 0.5;
    rig.rightArm.rotation.y = 0;
  } else {
    rig.leftArm.rotation.z = -0.08;
    rig.rightArm.rotation.z = 0.08;
    rig.rightArm.rotation.y = 0;
  }
}

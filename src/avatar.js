import * as THREE from 'three';

export const DEFAULT_AVATAR = Object.freeze({
  skin: '#d8a178',
  hairStyle: 'short',
  hair: '#2e211d',
  shirt: '#397bc5',
  pants: '#24364b',
  shoes: '#242424',
});

export const AVATAR_OPTIONS = {
  skin: ['#f2d2b6', '#e5b38d', '#d08b62', '#a86645', '#75442f', '#4c2b20'],
  hair: ['#201815', '#4b2d1f', '#7a4b2d', '#b98654', '#d9c2a1', '#111111', '#713a2b'],
  shirt: ['#397bc5', '#c74c4c', '#4e9a64', '#d28a2d', '#7d5bc7', '#e3d28e', '#2c2f33'],
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
  const styleValues = new Set(AVATAR_OPTIONS.hairStyles.map((item) => item.value));
  const color = (value, fallback) => {
    try {
      return `#${new THREE.Color(value || fallback).getHexString()}`;
    } catch {
      return fallback;
    }
  };

  return {
    skin: color(input.skin, DEFAULT_AVATAR.skin),
    hairStyle: styleValues.has(input.hairStyle) ? input.hairStyle : DEFAULT_AVATAR.hairStyle,
    hair: color(input.hair, DEFAULT_AVATAR.hair),
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

function addHair(root, appearance) {
  const color = appearance.hair;
  const group = new THREE.Group();
  group.name = 'hair';

  if (appearance.hairStyle === 'none') return group;

  if (appearance.hairStyle === 'short' || appearance.hairStyle === 'long' || appearance.hairStyle === 'bun') {
    const top = mesh(new THREE.SphereGeometry(0.285, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.53), color);
    top.position.y = 2.04;
    top.scale.z = 1.03;
    group.add(top);
  }

  if (appearance.hairStyle === 'long') {
    const back = mesh(new THREE.BoxGeometry(0.47, 0.55, 0.12), color);
    back.position.set(0, 1.78, 0.22);
    back.rotation.x = -0.05;
    group.add(back);
  }

  if (appearance.hairStyle === 'bun') {
    const bun = mesh(new THREE.SphereGeometry(0.15, 12, 10), color);
    bun.position.set(0, 2.17, 0.19);
    group.add(bun);
  }

  if (appearance.hairStyle === 'mohawk') {
    for (let index = 0; index < 5; index += 1) {
      const spike = mesh(new THREE.ConeGeometry(0.075, 0.22, 7), color);
      spike.position.set(0, 2.16, -0.2 + index * 0.1);
      group.add(spike);
    }
  }

  if (appearance.hairStyle === 'cap') {
    const cap = mesh(new THREE.SphereGeometry(0.29, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52), color);
    cap.position.y = 2.04;
    group.add(cap);
    const brim = mesh(new THREE.BoxGeometry(0.34, 0.035, 0.18), color);
    brim.position.set(0, 2.0, -0.27);
    group.add(brim);
  }

  root.add(group);
  return group;
}

export function createAvatar(player = {}, options = {}) {
  const appearance = sanitizeAvatar(player.avatar || player.appearance || {});
  const root = new THREE.Group();
  root.name = `avatar:${player.id || 'preview'}`;

  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);

  const torso = mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), appearance.shirt);
  torso.position.y = 0.48;
  hips.add(torso);

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

  addHair(hips, appearance);

  const leftArm = makeLimb(appearance.shirt, 0.62, 0.105);
  leftArm.pivot.position.set(-0.39, 0.78, 0);
  leftArm.pivot.rotation.z = -0.08;
  hips.add(leftArm.pivot);

  const rightArm = makeLimb(appearance.shirt, 0.62, 0.105);
  rightArm.pivot.position.set(0.39, 0.78, 0);
  rightArm.pivot.rotation.z = 0.08;
  hips.add(rightArm.pivot);

  const leftHand = mesh(new THREE.SphereGeometry(0.105, 10, 8), appearance.skin);
  leftHand.position.y = -0.62;
  leftArm.pivot.add(leftHand);

  const rightHand = mesh(new THREE.SphereGeometry(0.105, 10, 8), appearance.skin);
  rightHand.position.y = -0.62;
  rightArm.pivot.add(rightHand);

  const leftLeg = makeLimb(appearance.pants, 0.76, 0.12);
  leftLeg.pivot.position.set(-0.17, 0.08, 0);
  hips.add(leftLeg.pivot);

  const rightLeg = makeLimb(appearance.pants, 0.76, 0.12);
  rightLeg.pivot.position.set(0.17, 0.08, 0);
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
    rig.rightArm.rotation.z = -2.3;
    rig.rightArm.rotation.x = Math.sin(elapsed * 12) * 0.45;
  } else if (gestureActive && root.userData.gesture === 'point') {
    rig.rightArm.rotation.z = -1.55;
    rig.rightArm.rotation.x = -1.25;
  } else {
    rig.leftArm.rotation.z = -0.08;
    rig.rightArm.rotation.z = 0.08;
  }
}

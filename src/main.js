import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import './style.css';

const app = document.querySelector('#app');
app.innerHTML = `
  <section id="joinOverlay" class="overlay">
    <div class="card">
      <h1>Empresa 3D Online</h1>
      <p>Teste do multiplayer: todos que entrarem no mesmo código de sala poderão caminhar e se ver no ambiente.</p>
      <label for="hostInput">Servidor PartyKit</label>
      <input id="hostInput" autocomplete="off" placeholder="ex.: rede-empresa-online.seunome.partykit.dev" />
      <div class="row">
        <div>
          <label for="roomInput">Código da sala</label>
          <input id="roomInput" value="sala-0123" maxlength="50" />
        </div>
        <div>
          <label for="nameInput">Seu nome</label>
          <input id="nameInput" value="Visitante" maxlength="28" />
        </div>
      </div>
      <button id="joinButton">Entrar online</button>
      <div id="statusText"></div>
      <p class="small">Depois de entrar, clique no cenário para controlar a câmera. Use W, A, S e D.</p>
    </div>
  </section>

  <section id="hud">
    <div id="controlsPanel" class="panel"><strong>Controles</strong><br>W, A, S, D: andar<br>Mouse: olhar<br>ESC: liberar o mouse</div>
    <div id="connectionBadge">Desconectado</div>
    <div id="playersPanel" class="panel"><strong>Participantes</strong><ol id="playersList"></ol></div>
    <div id="crosshair"></div>
    <div id="toast"></div>
  </section>
`;

const joinOverlay = document.querySelector('#joinOverlay');
const joinButton = document.querySelector('#joinButton');
const hostInput = document.querySelector('#hostInput');
const roomInput = document.querySelector('#roomInput');
const nameInput = document.querySelector('#nameInput');
const statusText = document.querySelector('#statusText');
const hud = document.querySelector('#hud');
const playersList = document.querySelector('#playersList');
const connectionBadge = document.querySelector('#connectionBadge');
const toast = document.querySelector('#toast');

const configuredHost = (import.meta.env.VITE_PARTYKIT_HOST || '').trim();
hostInput.value = configuredHost || localStorage.getItem('partykit-host') || '';
roomInput.value = localStorage.getItem('online-room') || 'sala-0123';
nameInput.value = localStorage.getItem('player-name') || 'Visitante';
if (configuredHost) {
  hostInput.closest('label')?.remove();
  hostInput.style.display = 'none';
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaab2b0);
scene.fog = new THREE.Fog(0xaab2b0, 24, 62);

const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 140);
camera.position.set(0, 1.7, 11);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);
renderer.domElement.addEventListener('click', () => {
  if (joinOverlay.style.display === 'none' && !controls.isLocked) controls.lock();
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x59605d, 2.25));
const sun = new THREE.DirectionalLight(0xfff2ce, 3.1);
sun.position.set(-9, 16, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const colliders = [];
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(34, 34),
  new THREE.MeshStandardMaterial({ color: 0xb9b194, roughness: 1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
scene.add(new THREE.GridHelper(34, 34, 0x5d635f, 0x8c928d));

function addBox({ x, y, z, w, h, d, color, collider = false }) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.78 })
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (collider) colliders.push(mesh);
  return mesh;
}

// Ambiente de teste: sala simples para validar o multiplayer.
addBox({ x: 0, y: 1.5, z: -16, w: 32, h: 3, d: 0.28, color: 0xc8bf91, collider: true });
addBox({ x: -16, y: 1.5, z: 0, w: 0.28, h: 3, d: 32, color: 0xc8bf91, collider: true });
addBox({ x: 16, y: 1.5, z: 0, w: 0.28, h: 3, d: 32, color: 0xc8bf91, collider: true });
addBox({ x: -9.5, y: 1.5, z: 16, w: 13, h: 3, d: 0.28, color: 0xc8bf91, collider: true });
addBox({ x: 9.5, y: 1.5, z: 16, w: 13, h: 3, d: 0.28, color: 0xc8bf91, collider: true });

// Rack e mesas para dar referência espacial.
addBox({ x: 0, y: 1.15, z: -7, w: 1.5, h: 2.3, d: 0.9, color: 0x41484a, collider: true });
for (const x of [-8, -3, 3, 8]) {
  addBox({ x, y: 0.72, z: 2, w: 2.3, h: 0.12, d: 1, color: 0x7b6548, collider: true });
  addBox({ x, y: 1.25, z: 1.8, w: 0.7, h: 0.5, d: 0.1, color: 0x263136 });
}

const keys = new Set();
addEventListener('keydown', (event) => keys.add(event.code));
addEventListener('keyup', (event) => keys.delete(event.code));

const playerId = crypto.randomUUID();
const remotePlayers = new Map();
const knownPlayers = new Map();
let socket = null;
let playerName = 'Visitante';
let playerColor = Math.floor(0x2f78d0 + Math.random() * 0x4f4f4f) & 0xffffff;
let lastSentAt = 0;
let lastSentPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
let toastTimer = null;

function normalizeHost(raw) {
  return raw.trim().replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '').replace(/\/$/, '');
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.style.color = isError ? '#ffaaa1' : '#ffdda1';
}

function setConnectionBadge(message, online = false) {
  connectionBadge.textContent = message;
  connectionBadge.style.background = online ? 'rgba(30, 110, 66, .78)' : 'rgba(0, 0, 0, .65)';
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200);
}

function makeNameSprite(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = '700 52px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(0,0,0,.75)';
  ctx.strokeText(name, 256, 64);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(name, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.position.y = 2.15;
  sprite.scale.set(3.8, 0.95, 1);
  return sprite;
}

function createAvatar(player) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: player.color ?? 0x397bc5, roughness: 0.72 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: 0xe1b58d, roughness: 0.78 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.68, 5, 10), bodyMaterial);
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 18, 14), skinMaterial);
  head.position.y = 1.65;
  head.castShadow = true;
  group.add(head);
  group.add(makeNameSprite(player.name || 'Aluno'));
  group.position.set(player.x || 0, 0, player.z || 0);
  group.rotation.y = player.ry || 0;
  group.userData.targetPosition = group.position.clone();
  group.userData.targetRotation = group.rotation.y;
  scene.add(group);
  return group;
}

function upsertRemotePlayer(player) {
  if (!player || player.id === playerId) return;
  knownPlayers.set(player.id, player);
  let avatar = remotePlayers.get(player.id);
  if (!avatar) {
    avatar = createAvatar(player);
    remotePlayers.set(player.id, avatar);
    showToast(`${player.name || 'Uma pessoa'} entrou na sala`);
  }
  avatar.userData.targetPosition.set(player.x ?? 0, 0, player.z ?? 0);
  avatar.userData.targetRotation = player.ry ?? 0;
  updatePlayersList();
}

function removeRemotePlayer(id) {
  const player = knownPlayers.get(id);
  const avatar = remotePlayers.get(id);
  if (avatar) {
    scene.remove(avatar);
    avatar.traverse((object) => {
      object.geometry?.dispose?.();
      if (object.material?.map) object.material.map.dispose();
      object.material?.dispose?.();
    });
  }
  remotePlayers.delete(id);
  knownPlayers.delete(id);
  if (player) showToast(`${player.name || 'Uma pessoa'} saiu da sala`);
  updatePlayersList();
}

function updatePlayersList() {
  const players = [{ id: playerId, name: `${playerName} (você)` }, ...knownPlayers.values()];
  playersList.innerHTML = players
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((player) => `<li>${escapeHtml(player.name || 'Visitante')}</li>`)
    .join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function connect() {
  const host = normalizeHost(configuredHost || hostInput.value);
  const room = roomInput.value.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  playerName = nameInput.value.trim() || 'Visitante';
  if (!host) return setStatus('Informe o endereço gerado pelo PartyKit.', true);
  if (!room) return setStatus('Digite um código de sala.', true);

  localStorage.setItem('partykit-host', host);
  localStorage.setItem('online-room', room);
  localStorage.setItem('player-name', playerName);
  joinButton.disabled = true;
  setStatus('Conectando ao servidor...');

  const url = `wss://${host}/parties/main/${encodeURIComponent(room)}`;
  socket = new WebSocket(url);

  const timeout = setTimeout(() => {
    if (socket?.readyState !== WebSocket.OPEN) {
      socket?.close();
      setStatus('O servidor não respondeu. Confira o endereço do PartyKit.', true);
      joinButton.disabled = false;
    }
  }, 10000);

  socket.addEventListener('open', () => {
    clearTimeout(timeout);
    send({
      type: 'join',
      id: playerId,
      name: playerName,
      color: playerColor,
      x: camera.position.x,
      z: camera.position.z,
      ry: camera.rotation.y,
    });
    joinOverlay.style.display = 'none';
    hud.style.display = 'block';
    setConnectionBadge(`Online • sala ${room}`, true);
    updatePlayersList();
    controls.lock();
  });

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === 'snapshot') {
      for (const player of message.players || []) upsertRemotePlayer(player);
    } else if (message.type === 'player-joined' || message.type === 'player-moved') {
      upsertRemotePlayer(message.player);
    } else if (message.type === 'player-left') {
      removeRemotePlayer(message.id);
    }
  });

  socket.addEventListener('error', () => {
    setStatus('Não foi possível conectar. Confira o domínio do PartyKit.', true);
  });

  socket.addEventListener('close', () => {
    clearTimeout(timeout);
    joinButton.disabled = false;
    setConnectionBadge('Desconectado', false);
    if (joinOverlay.style.display === 'none') showToast('Conexão encerrada');
  });
}

joinButton.addEventListener('click', connect);
for (const input of [hostInput, roomInput, nameInput]) {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') connect();
  });
}

const playerBox = new THREE.Box3();
const colliderBox = new THREE.Box3();
function collides(position) {
  playerBox.min.set(position.x - 0.31, 0.05, position.z - 0.31);
  playerBox.max.set(position.x + 0.31, 1.8, position.z + 0.31);
  for (const collider of colliders) {
    colliderBox.setFromObject(collider);
    if (playerBox.intersectsBox(colliderBox)) return true;
  }
  return false;
}

const clock = new THREE.Clock();
const moveVector = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

function updateMovement(delta) {
  if (!controls.isLocked) return;
  const forwardInput = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
  const rightInput = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
  if (!forwardInput && !rightInput) return;

  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  right.crossVectors(forward, camera.up).normalize();
  moveVector.copy(forward).multiplyScalar(forwardInput).addScaledVector(right, rightInput);
  if (moveVector.lengthSq() > 1) moveVector.normalize();
  moveVector.multiplyScalar(4.2 * delta);

  const next = camera.position.clone();
  next.x += moveVector.x;
  if (!collides(next)) camera.position.x = next.x;
  next.copy(camera.position);
  next.z += moveVector.z;
  if (!collides(next)) camera.position.z = next.z;
  camera.position.y = 1.7;
}

function sendMovement(time) {
  if (!socket || socket.readyState !== WebSocket.OPEN || time - lastSentAt < 80) return;
  const moved = camera.position.distanceToSquared(lastSentPosition) > 0.0006;
  if (!moved && time - lastSentAt < 800) return;
  lastSentAt = time;
  lastSentPosition.copy(camera.position);
  send({
    type: 'move',
    id: playerId,
    name: playerName,
    color: playerColor,
    x: Number(camera.position.x.toFixed(3)),
    z: Number(camera.position.z.toFixed(3)),
    ry: Number(camera.rotation.y.toFixed(4)),
  });
}

function animate(time = 0) {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  updateMovement(delta);
  sendMovement(time);
  for (const avatar of remotePlayers.values()) {
    avatar.position.lerp(avatar.userData.targetPosition, 1 - Math.pow(0.0005, delta));
    const current = avatar.rotation.y;
    const target = avatar.userData.targetRotation;
    avatar.rotation.y = current + Math.atan2(Math.sin(target - current), Math.cos(target - current)) * Math.min(1, delta * 12);
  }
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import './style.css';

const PARTY_HOST = String(import.meta.env.VITE_PARTYKIT_HOST || '')
  .trim()
  .replace(/^https?:\/\//, '')
  .replace(/^wss?:\/\//, '')
  .replace(/\/$/, '');

const app = document.querySelector('#app');
app.innerHTML = `
  <section id="homeOverlay" class="overlay">
    <div class="home-card">
      <h1>Empresa 3D</h1>
      <p>Não existe cadastro nem login. Escolha construir individualmente ou entrar em uma sala informando somente seu nome e o código da sala.</p>
      <div class="home-grid">
        <article class="choice-card">
          <h2>Construir sozinho</h2>
          <p>Monte paredes, portas, móveis e pontos de rede. O rascunho fica salvo neste navegador e só vai para o online quando você clicar em publicar.</p>
          <button id="openBuilder" class="primary wide">Abrir construtor 3D</button>
        </article>
        <article class="choice-card">
          <h2>Entrar em uma sala</h2>
          <p>Os visitantes não precisam de conta. Digite um nome e o mesmo código de sala usado pela turma.</p>
          <div class="field"><label for="joinName">Seu nome</label><input id="joinName" maxlength="28" placeholder="Ex.: Ingrid" /></div>
          <div class="field"><label for="joinRoom">Código da sala</label><input id="joinRoom" maxlength="50" placeholder="Ex.: turma-0123" /></div>
          <button id="joinRoomButton" class="primary wide">Entrar na sala</button>
          <div id="onlineWarning" class="warning"></div>
        </article>
      </div>
    </div>
  </section>

  <section id="builderUi" class="hidden">
    <header id="builderTopbar">
      <span class="title">Construtor 3D</span>
      <button id="homeFromBuilder" class="secondary">Início</button>
      <button id="soloTest" class="secondary">Testar sozinho</button>
      <button id="saveProject" class="secondary">Salvar</button>
      <button id="exportProject" class="secondary">Exportar</button>
      <button id="importProject" class="secondary">Importar</button>
      <input id="importFile" type="file" accept=".json" />
      <div class="room-mini">
        <input id="publishRoom" maxlength="50" placeholder="Código da sala" />
        <button id="publishScene" class="primary">Publicar cenário</button>
      </div>
    </header>

    <aside id="toolPanel" class="sidebar">
      <h3>Adicionar</h3>
      <div class="tool-grid">
        <button data-tool="select" class="active">Selecionar</button>
        <button data-tool="wall">Parede</button>
        <button data-add="door">Porta</button>
        <button data-add="window">Janela</button>
        <button data-add="computer">Computador</button>
        <button data-add="network">Ponto de rede</button>
        <button data-add="switch">Switch</button>
        <button data-add="printer">Impressora</button>
        <button data-add="table">Mesa</button>
        <button data-add="stairs">Escada</button>
      </div>
      <h3>Editar</h3>
      <div class="tool-grid">
        <button data-transform="translate">Mover</button>
        <button data-transform="rotate">Girar</button>
        <button data-transform="scale">Escala</button>
        <button id="duplicateObject">Duplicar</button>
        <button id="deleteObject" class="delete">Apagar selecionado</button>
      </div>
      <hr />
      <h3>Planta de referência</h3>
      <button id="choosePlan" class="secondary wide">Escolher imagem</button>
      <input id="planFile" type="file" accept="image/*" />
      <div class="field"><label for="planOpacity">Opacidade</label><input id="planOpacity" type="range" min="0" max="1" step=".05" value=".55" /></div>
      <p class="note">Parede: clique uma vez no início e outra vez no final. Objetos: escolha o item e clique no piso.</p>
    </aside>

    <aside id="propertiesPanel" class="sidebar">
      <h3>Objeto selecionado</h3>
      <div id="noSelection" class="note">Clique em um objeto no cenário.</div>
      <div id="propertiesForm" class="hidden">
        <div class="field"><label for="objectName">Nome</label><input id="objectName" /></div>
        <div class="field"><label for="objectSector">Setor</label><input id="objectSector" /></div>
        <div class="field"><label for="objectIp">IP</label><input id="objectIp" /></div>
        <div class="field"><label for="objectSwitch">Switch</label><input id="objectSwitch" /></div>
        <div class="field"><label for="objectPort">Porta do switch</label><input id="objectPort" /></div>
        <div class="field"><label for="objectColor">Cor</label><input id="objectColor" type="color" /></div>
        <button id="applyProperties" class="primary wide">Aplicar informações</button>
      </div>
    </aside>
    <div id="builderStatus">Modo selecionar.</div>
  </section>

  <section id="gameUi" class="hidden">
    <div id="gameControls" class="game-panel"><strong>Controles</strong><br>W, A, S, D: andar<br>Mouse: olhar<br>Clique: interagir</div>
    <div id="playersPanel" class="game-panel"><strong>Participantes</strong><ol id="playersList"></ol></div>
    <button id="exitGame" class="danger">Sair</button>
    <div id="crosshair"></div>
    <div id="toast"></div>
  </section>

  <section id="equipmentModal">
    <div class="modal-card">
      <h2 id="modalName">Equipamento</h2>
      <p><strong>Setor:</strong> <span id="modalSector">-</span></p>
      <p><strong>IP:</strong> <span id="modalIp">-</span></p>
      <p><strong>Switch:</strong> <span id="modalSwitch">-</span></p>
      <p><strong>Porta:</strong> <span id="modalPort">-</span></p>
      <button id="closeModal" class="secondary wide">Fechar</button>
    </div>
  </section>
`;

const $ = (selector) => document.querySelector(selector);
const homeOverlay = $('#homeOverlay');
const builderUi = $('#builderUi');
const gameUi = $('#gameUi');
const builderStatus = $('#builderStatus');
const joinName = $('#joinName');
const joinRoom = $('#joinRoom');
const publishRoom = $('#publishRoom');
const playersList = $('#playersList');
const toast = $('#toast');

joinName.value = localStorage.getItem('empresa3d-name') || '';
joinRoom.value = localStorage.getItem('empresa3d-room') || 'turma-0123';
publishRoom.value = localStorage.getItem('empresa3d-room') || 'turma-0123';
if (!PARTY_HOST) {
  $('#onlineWarning').textContent = 'O construtor funciona normalmente. Para entrar online, o responsável pelo projeto precisa configurar VITE_PARTYKIT_HOST na Vercel.';
  $('#joinRoomButton').disabled = true;
  $('#publishScene').disabled = true;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaeb5b2);
scene.fog = new THREE.Fog(0xaeb5b2, 45, 120);

const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 220);
camera.position.set(15, 15, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.domElement.className = 'webgl';
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.prepend(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 0, 0);
orbit.enableDamping = true;
orbit.enabled = false;

const pointerControls = new PointerLockControls(camera, renderer.domElement);
const transform = new TransformControls(camera, renderer.domElement);
transform.setTranslationSnap(.25);
transform.setRotationSnap(THREE.MathUtils.degToRad(15));
transform.setScaleSnap(.1);
scene.add(transform.getHelper());
transform.addEventListener('dragging-changed', (event) => { orbit.enabled = !event.value && appMode === 'builder'; });
transform.addEventListener('objectChange', () => {
  if (selected?.userData.kind === 'door' && appMode === 'builder') {
    selected.userData.closedRotation = selected.rotation.y;
    selected.userData.open = false;
  }
  syncPropertiesForm();
});

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a605c, 2.4));
const sun = new THREE.DirectionalLight(0xfff2c9, 3.1);
sun.position.set(-12, 18, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0xaaa48a, roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
floor.userData.isFloor = true;
scene.add(floor);
const grid = new THREE.GridHelper(80, 80, 0x373b38, 0x7b817b);
scene.add(grid);

const world = new THREE.Group();
scene.add(world);
const referenceLayer = new THREE.Group();
scene.add(referenceLayer);
const avatarLayer = new THREE.Group();
scene.add(avatarLayer);

let appMode = 'home';
let currentTool = 'select';
let selected = null;
let wallStart = null;
let referencePlane = null;
let socket = null;
let localPlayer = null;
let lastMoveSent = 0;
let toastTimer = null;
const remotePlayers = new Map();
const keys = new Set();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const centerPointer = new THREE.Vector2(0, 0);

function makeMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: .76 });
}

function markRoot(root) {
  root.traverse((child) => {
    child.castShadow = true;
    child.receiveShadow = true;
    child.userData.root = root;
  });
}

function defaultName(kind) {
  return ({
    wall: 'Parede', door: 'Porta', window: 'Janela', computer: 'PC-01', network: 'PTR-01',
    switch: 'SW-01', printer: 'IMP-01', table: 'Mesa', stairs: 'Escada',
  })[kind] || 'Objeto';
}

function registerObject(root, kind, meta = {}) {
  root.userData.objectId = root.userData.objectId || crypto.randomUUID();
  root.userData.kind = kind;
  root.userData.meta = {
    name: meta.name || defaultName(kind),
    sector: meta.sector || '',
    ip: meta.ip || '',
    switchName: meta.switchName || '',
    port: meta.port || '',
  };
  markRoot(root);
  world.add(root);
  selectObject(root);
  return root;
}

function createWall(a, b, id = null) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.max(.25, Math.hypot(dx, dz));
  const root = new THREE.Mesh(new THREE.BoxGeometry(length, 3, .2), makeMaterial(0xc6bd8c));
  root.position.set((a.x + b.x) / 2, 1.5, (a.z + b.z) / 2);
  root.rotation.y = -Math.atan2(dz, dx);
  if (id) root.userData.objectId = id;
  root.userData.baseSize = [length, 3, .2];
  return registerObject(root, 'wall');
}

function createDoor(position, id = null) {
  const root = new THREE.Group();
  const panel = new THREE.Mesh(new THREE.BoxGeometry(.92, 2.2, .1), makeMaterial(0x785438));
  panel.position.set(.46, 1.1, 0);
  root.add(panel);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.045, 12, 10), makeMaterial(0xd0b56a));
  knob.position.set(.78, 1.08, .08);
  root.add(knob);
  root.position.copy(position);
  if (id) root.userData.objectId = id;
  root.userData.open = false;
  root.userData.closedRotation = root.rotation.y;
  return registerObject(root, 'door');
}

function createWindow(position, id = null) {
  const root = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.1, .12), makeMaterial(0x5b5547));
  frame.position.y = 1.55;
  root.add(frame);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, .88, .14),
    new THREE.MeshStandardMaterial({ color: 0x8fc5dc, transparent: true, opacity: .42, roughness: .1 }),
  );
  glass.position.y = 1.55;
  root.add(glass);
  root.position.copy(position);
  if (id) root.userData.objectId = id;
  return registerObject(root, 'window');
}

function createComputer(position, id = null) {
  const root = new THREE.Group();
  const desk = new THREE.Mesh(new THREE.BoxGeometry(1.3, .1, .7), makeMaterial(0x765f45));
  desk.position.y = .72;
  root.add(desk);
  const monitor = new THREE.Mesh(new THREE.BoxGeometry(.62, .46, .09), makeMaterial(0x263036));
  monitor.position.set(0, 1.16, -.1);
  root.add(monitor);
  const stand = new THREE.Mesh(new THREE.BoxGeometry(.08, .28, .08), makeMaterial(0x444b4e));
  stand.position.set(0, .92, -.1);
  root.add(stand);
  root.position.copy(position);
  if (id) root.userData.objectId = id;
  return registerObject(root, 'computer');
}

function createNetwork(position, id = null) {
  const root = new THREE.Mesh(new THREE.BoxGeometry(.24, .24, .08), makeMaterial(0x2e78cc));
  root.position.copy(position);
  root.position.y = .55;
  if (id) root.userData.objectId = id;
  root.userData.baseSize = [.24, .24, .08];
  return registerObject(root, 'network');
}

function createSwitch(position, id = null) {
  const root = new THREE.Group();
  const rack = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.9, .72), makeMaterial(0x444a4c));
  rack.position.y = .95;
  root.add(rack);
  const switchMesh = new THREE.Mesh(new THREE.BoxGeometry(.72, .2, .13), makeMaterial(0x20343b));
  switchMesh.position.set(0, 1.25, .41);
  root.add(switchMesh);
  root.position.copy(position);
  if (id) root.userData.objectId = id;
  return registerObject(root, 'switch');
}

function createPrinter(position, id = null) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(.72, .56, .66), makeMaterial(0xd7d7d0));
  body.position.y = .34;
  root.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(.6, .16, .5), makeMaterial(0x4c5456));
  top.position.y = .7;
  root.add(top);
  root.position.copy(position);
  if (id) root.userData.objectId = id;
  return registerObject(root, 'printer');
}

function createTable(position, id = null) {
  const root = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, .12, .9), makeMaterial(0x7b6548));
  top.position.y = .78;
  root.add(top);
  for (const x of [-.75, .75]) for (const z of [-.32, .32]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.1, .75, .1), makeMaterial(0x55483a));
    leg.position.set(x, .38, z);
    root.add(leg);
  }
  root.position.copy(position);
  if (id) root.userData.objectId = id;
  return registerObject(root, 'table');
}

function createStairs(position, id = null) {
  const root = new THREE.Group();
  for (let index = 0; index < 9; index += 1) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, (index + 1) * .18, .38),
      makeMaterial(index % 2 ? 0x8d8d85 : 0x999990),
    );
    step.position.set(0, (index + 1) * .09, -index * .38);
    root.add(step);
  }
  root.position.copy(position);
  if (id) root.userData.objectId = id;
  return registerObject(root, 'stairs');
}

function createByKind(kind, position, id = null) {
  if (kind === 'door') return createDoor(position, id);
  if (kind === 'window') return createWindow(position, id);
  if (kind === 'computer') return createComputer(position, id);
  if (kind === 'network') return createNetwork(position, id);
  if (kind === 'switch') return createSwitch(position, id);
  if (kind === 'printer') return createPrinter(position, id);
  if (kind === 'table') return createTable(position, id);
  if (kind === 'stairs') return createStairs(position, id);
  return null;
}

function firstColor(root) {
  let result = '#888888';
  root.traverse((child) => {
    if (result === '#888888' && child.material?.color) result = `#${child.material.color.getHexString()}`;
  });
  return result;
}

function applyColor(root, color) {
  const parsed = new THREE.Color(color);
  root.traverse((child) => {
    if (child.material?.color) child.material.color.copy(parsed);
  });
}

function selectObject(root) {
  selected = root;
  transform.detach();
  if (root && appMode === 'builder') transform.attach(root);
  $('#noSelection').classList.toggle('hidden', Boolean(root));
  $('#propertiesForm').classList.toggle('hidden', !root);
  syncPropertiesForm();
}

function syncPropertiesForm() {
  if (!selected) return;
  const meta = selected.userData.meta || {};
  $('#objectName').value = meta.name || '';
  $('#objectSector').value = meta.sector || '';
  $('#objectIp').value = meta.ip || '';
  $('#objectSwitch').value = meta.switchName || '';
  $('#objectPort').value = meta.port || '';
  $('#objectColor').value = firstColor(selected);
}

function serializeWorld() {
  return world.children.map((root) => ({
    id: root.userData.objectId,
    kind: root.userData.kind,
    meta: root.userData.meta,
    position: root.position.toArray(),
    rotation: [root.rotation.x, root.rotation.y, root.rotation.z],
    scale: root.scale.toArray(),
    color: firstColor(root),
    baseSize: root.userData.baseSize || null,
    open: Boolean(root.userData.open),
  }));
}

function clearWorld() {
  transform.detach();
  selected = null;
  while (world.children.length) {
    const root = world.children[0];
    root.traverse((child) => {
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    });
    world.remove(root);
  }
  selectObject(null);
}

function createFromData(data) {
  const position = new THREE.Vector3().fromArray(data.position || [0, 0, 0]);
  let root;
  if (data.kind === 'wall') {
    const length = data.baseSize?.[0] || 2;
    root = createWall(
      new THREE.Vector3(position.x - length / 2, 0, position.z),
      new THREE.Vector3(position.x + length / 2, 0, position.z),
      data.id,
    );
  } else {
    root = createByKind(data.kind, position, data.id);
  }
  if (!root) return null;
  root.position.fromArray(data.position || [0, 0, 0]);
  root.rotation.set(...(data.rotation || [0, 0, 0]));
  root.scale.fromArray(data.scale || [1, 1, 1]);
  root.userData.meta = { ...(root.userData.meta || {}), ...(data.meta || {}) };
  if (data.color) applyColor(root, data.color);
  if (data.kind === 'door') {
    root.userData.closedRotation = root.rotation.y;
    root.userData.open = Boolean(data.open);
    if (root.userData.open) root.rotation.y = root.userData.closedRotation - Math.PI / 2;
  }
  return root;
}

function loadWorld(data) {
  clearWorld();
  for (const item of Array.isArray(data) ? data : []) createFromData(item);
  selectObject(null);
}

function saveLocal() {
  localStorage.setItem('empresa3d-project', JSON.stringify(serializeWorld()));
  setBuilderStatus('Projeto salvo neste navegador.');
}

function restoreLocal() {
  const saved = localStorage.getItem('empresa3d-project');
  if (!saved) return;
  try { loadWorld(JSON.parse(saved)); } catch { localStorage.removeItem('empresa3d-project'); }
}

function setBuilderStatus(message) { builderStatus.textContent = message; }
function setTool(tool) {
  currentTool = tool;
  wallStart = null;
  document.querySelectorAll('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
}

function groundPoint(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(floor, false)[0]?.point?.clone() || null;
}

function pickedRoot(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(world.children, true)[0];
  return hit?.object?.userData?.root || null;
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (appMode !== 'builder' || transform.dragging || event.button !== 0) return;
  if (currentTool === 'wall') {
    const point = groundPoint(event);
    if (!point) return;
    point.set(Math.round(point.x * 4) / 4, 0, Math.round(point.z * 4) / 4);
    if (!wallStart) {
      wallStart = point;
      setBuilderStatus('Agora clique no ponto final da parede.');
    } else {
      createWall(wallStart, point);
      wallStart = null;
      setBuilderStatus('Parede criada. Clique novamente para iniciar outra.');
    }
    return;
  }
  if (currentTool.startsWith('add:')) {
    const point = groundPoint(event);
    if (!point) return;
    point.set(Math.round(point.x * 4) / 4, 0, Math.round(point.z * 4) / 4);
    createByKind(currentTool.slice(4), point);
    setTool('select');
    setBuilderStatus('Objeto adicionado.');
    return;
  }
  selectObject(pickedRoot(event));
});

function showHome() {
  appMode = 'home';
  document.exitPointerLock?.();
  orbit.enabled = false;
  transform.detach();
  homeOverlay.classList.remove('hidden');
  builderUi.classList.add('hidden');
  gameUi.classList.add('hidden');
  grid.visible = true;
  referenceLayer.visible = true;
  disconnectSocket();
}

function openBuilder() {
  appMode = 'builder';
  homeOverlay.classList.add('hidden');
  builderUi.classList.remove('hidden');
  gameUi.classList.add('hidden');
  grid.visible = true;
  referenceLayer.visible = true;
  orbit.enabled = true;
  camera.position.set(15, 15, 18);
  orbit.target.set(0, 0, 0);
  orbit.update();
  if (selected) transform.attach(selected);
  setBuilderStatus('Modo selecionar.');
}

function openEquipment(meta) {
  $('#modalName').textContent = meta.name || 'Equipamento';
  $('#modalSector').textContent = meta.sector || '-';
  $('#modalIp').textContent = meta.ip || '-';
  $('#modalSwitch').textContent = meta.switchName || '-';
  $('#modalPort').textContent = meta.port || '-';
  $('#equipmentModal').classList.add('open');
  document.exitPointerLock?.();
}

function closeEquipment() {
  $('#equipmentModal').classList.remove('open');
  if (appMode === 'game') renderer.domElement.requestPointerLock?.();
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
  const context = canvas.getContext('2d');
  context.font = '700 52px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.lineWidth = 10;
  context.strokeStyle = 'rgba(0,0,0,.75)';
  context.strokeText(name, 256, 64);
  context.fillStyle = '#fff';
  context.fillText(name, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.position.y = 2.12;
  sprite.scale.set(3.6, .9, 1);
  return sprite;
}

function makeAvatar(player) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(.34, .68, 5, 10),
    makeMaterial(player.color ?? 0x397bc5),
  );
  body.position.y = .95;
  root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.25, 16, 12), makeMaterial(0xe1b58d));
  head.position.y = 1.65;
  root.add(head);
  root.add(makeNameSprite(player.name || 'Visitante'));
  root.position.set(player.x || 0, 0, player.z || 0);
  root.userData.targetPosition = root.position.clone();
  root.userData.targetRotation = player.ry || 0;
  avatarLayer.add(root);
  return root;
}

function updatePlayersList() {
  const items = [];
  if (localPlayer) items.push(`${localPlayer.name} (você)`);
  for (const player of remotePlayers.values()) items.push(player.userData.playerName || 'Visitante');
  playersList.innerHTML = items.sort().map((name) => `<li>${escapeHtml(name)}</li>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function upsertRemote(player) {
  if (!player || player.id === localPlayer?.id) return;
  let avatar = remotePlayers.get(player.id);
  if (!avatar) {
    avatar = makeAvatar(player);
    avatar.userData.playerName = player.name || 'Visitante';
    remotePlayers.set(player.id, avatar);
    showToast(`${player.name || 'Uma pessoa'} entrou`);
  }
  avatar.userData.targetPosition.set(player.x || 0, 0, player.z || 0);
  avatar.userData.targetRotation = player.ry || 0;
  updatePlayersList();
}

function removeRemote(id) {
  const avatar = remotePlayers.get(id);
  if (!avatar) return;
  avatarLayer.remove(avatar);
  remotePlayers.delete(id);
  updatePlayersList();
}

function clearAvatars() {
  while (avatarLayer.children.length) avatarLayer.remove(avatarLayer.children[0]);
  remotePlayers.clear();
  updatePlayersList();
}

function send(message) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function disconnectSocket() {
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  clearAvatars();
  localPlayer = null;
}

function websocketUrl(room) {
  return `wss://${PARTY_HOST}/parties/main/${encodeURIComponent(room)}`;
}

function joinOnline(name, room) {
  if (!PARTY_HOST) return;
  disconnectSocket();
  localStorage.setItem('empresa3d-name', name);
  localStorage.setItem('empresa3d-room', room);
  localPlayer = {
    id: crypto.randomUUID(),
    name,
    color: Math.floor(Math.random() * 0xffffff),
  };
  socket = new WebSocket(websocketUrl(room));
  socket.addEventListener('open', () => {
    send({ type: 'join', player: localPlayer });
    startGame();
    showToast(`Sala: ${room}`);
  });
  socket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'snapshot') {
      if (Array.isArray(message.scene)) loadWorld(message.scene);
      for (const player of message.players || []) upsertRemote(player);
    } else if (message.type === 'player_joined') {
      upsertRemote(message.player);
    } else if (message.type === 'player_moved') {
      upsertRemote(message.player);
    } else if (message.type === 'player_left') {
      removeRemote(message.id);
    } else if (message.type === 'door') {
      const door = world.children.find((root) => root.userData.objectId === message.objectId && root.userData.kind === 'door');
      if (door) setDoorOpen(door, message.open, false);
    } else if (message.type === 'scene_published') {
      if (Array.isArray(message.scene)) loadWorld(message.scene);
      showToast('O cenário foi atualizado.');
    }
  });
  socket.addEventListener('error', () => {
    alert('Não foi possível entrar na sala. Confirme se o PartyKit está publicado e se VITE_PARTYKIT_HOST está correto.');
    showHome();
  });
}

function publishCurrentScene(room) {
  if (!PARTY_HOST) return;
  const normalizedRoom = room.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!normalizedRoom) {
    setBuilderStatus('Digite um código de sala.');
    return;
  }
  localStorage.setItem('empresa3d-room', normalizedRoom);
  const publishingSocket = new WebSocket(websocketUrl(normalizedRoom));
  publishingSocket.addEventListener('open', () => {
    publishingSocket.send(JSON.stringify({ type: 'publish_scene', scene: serializeWorld() }));
  });
  publishingSocket.addEventListener('message', (event) => {
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === 'published') {
      setBuilderStatus(`Cenário publicado na sala ${normalizedRoom}.`);
      publishingSocket.close();
    }
  });
  publishingSocket.addEventListener('error', () => setBuilderStatus('Erro ao publicar. Verifique o PartyKit.'));
}

function startSoloGame() {
  localPlayer = { id: crypto.randomUUID(), name: 'Você' };
  disconnectSocket();
  localPlayer = { id: crypto.randomUUID(), name: 'Você' };
  startGame();
}

function startGame() {
  for (const root of world.children) {
    if (root.userData.kind === 'door') {
      root.userData.open = false;
      root.userData.closedRotation = root.rotation.y;
    }
  }
  appMode = 'game';
  homeOverlay.classList.add('hidden');
  builderUi.classList.add('hidden');
  gameUi.classList.remove('hidden');
  grid.visible = false;
  referenceLayer.visible = false;
  orbit.enabled = false;
  transform.detach();
  camera.position.set(0, 1.7, 12);
  camera.rotation.set(0, 0, 0);
  updatePlayersList();
  setTimeout(() => renderer.domElement.requestPointerLock?.(), 80);
}

function setDoorOpen(door, open, broadcast = true) {
  door.userData.closedRotation ??= door.rotation.y;
  door.userData.open = open;
  door.rotation.y = door.userData.closedRotation + (open ? -Math.PI / 2 : 0);
  if (broadcast) send({ type: 'door', objectId: door.userData.objectId, open });
}

function collides(position) {
  const playerBox = new THREE.Box3(
    new THREE.Vector3(position.x - .32, .1, position.z - .32),
    new THREE.Vector3(position.x + .32, 1.85, position.z + .32),
  );
  for (const root of world.children) {
    const kind = root.userData.kind;
    if (kind !== 'wall' && !(kind === 'door' && !root.userData.open)) continue;
    const box = new THREE.Box3().setFromObject(root);
    if (box.intersectsBox(playerBox)) return true;
  }
  return false;
}

function gameInteraction() {
  raycaster.setFromCamera(centerPointer, camera);
  const hit = raycaster.intersectObjects(world.children, true)[0];
  if (!hit || hit.distance > 4.2) return;
  const root = hit.object.userData.root;
  if (!root) return;
  if (root.userData.kind === 'door') {
    setDoorOpen(root, !root.userData.open, true);
  } else if (['computer', 'network', 'switch', 'printer'].includes(root.userData.kind)) {
    openEquipment(root.userData.meta || {});
  }
}

$('#openBuilder').addEventListener('click', openBuilder);
$('#homeFromBuilder').addEventListener('click', showHome);
$('#soloTest').addEventListener('click', startSoloGame);
$('#saveProject').addEventListener('click', saveLocal);
$('#publishScene').addEventListener('click', () => publishCurrentScene(publishRoom.value));
$('#joinRoomButton').addEventListener('click', () => {
  const name = joinName.value.trim() || 'Visitante';
  const room = joinRoom.value.trim().replace(/[^a-zA-Z0-9_-]/g, '-');
  if (!room) return alert('Digite o código da sala.');
  joinOnline(name, room);
});
$('#exitGame').addEventListener('click', showHome);
$('#closeModal').addEventListener('click', closeEquipment);

$('#exportProject').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(serializeWorld(), null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'empresa-3d.json';
  link.click();
  URL.revokeObjectURL(link.href);
});
$('#importProject').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      loadWorld(JSON.parse(String(reader.result)));
      saveLocal();
    } catch {
      alert('O arquivo selecionado não é um projeto válido.');
    }
  };
  reader.readAsText(file);
});

$('#choosePlan').addEventListener('click', () => $('#planFile').click());
$('#planFile').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  new THREE.TextureLoader().load(objectUrl, (texture) => {
    while (referenceLayer.children.length) referenceLayer.remove(referenceLayer.children[0]);
    const ratio = texture.image.width / texture.image.height;
    referencePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(22 * ratio, 22),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: Number($('#planOpacity').value), side: THREE.DoubleSide }),
    );
    referencePlane.rotation.x = -Math.PI / 2;
    referencePlane.position.y = .025;
    referenceLayer.add(referencePlane);
    URL.revokeObjectURL(objectUrl);
  });
});
$('#planOpacity').addEventListener('input', (event) => {
  if (referencePlane) referencePlane.material.opacity = Number(event.target.value);
});

document.querySelectorAll('[data-tool]').forEach((button) => button.addEventListener('click', () => {
  setTool(button.dataset.tool);
  setBuilderStatus(button.dataset.tool === 'wall' ? 'Clique no início e no final da parede.' : 'Modo selecionar.');
}));
document.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', () => {
  currentTool = `add:${button.dataset.add}`;
  wallStart = null;
  document.querySelectorAll('[data-tool]').forEach((item) => item.classList.remove('active'));
  setBuilderStatus(`Clique no piso para adicionar ${defaultName(button.dataset.add)}.`);
}));
document.querySelectorAll('[data-transform]').forEach((button) => button.addEventListener('click', () => transform.setMode(button.dataset.transform)));

$('#deleteObject').addEventListener('click', () => {
  if (!selected) return;
  transform.detach();
  world.remove(selected);
  selectObject(null);
});
$('#duplicateObject').addEventListener('click', () => {
  if (!selected) return;
  const data = serializeWorld().find((item) => item.id === selected.userData.objectId);
  if (!data) return;
  data.id = crypto.randomUUID();
  data.position[0] += 1;
  createFromData(data);
});
$('#applyProperties').addEventListener('click', () => {
  if (!selected) return;
  selected.userData.meta = {
    name: $('#objectName').value,
    sector: $('#objectSector').value,
    ip: $('#objectIp').value,
    switchName: $('#objectSwitch').value,
    port: $('#objectPort').value,
  };
  applyColor(selected, $('#objectColor').value);
  setBuilderStatus('Informações aplicadas.');
});

renderer.domElement.addEventListener('click', () => {
  if (appMode === 'game') {
    if (!pointerControls.isLocked) pointerControls.lock();
    else gameInteraction();
  }
});

addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (event.code === 'Escape' && appMode === 'game' && !$('#equipmentModal').classList.contains('open')) showHome();
});
addEventListener('keyup', (event) => keys.delete(event.code));

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), .05);
  if (appMode === 'builder') orbit.update();
  if (appMode === 'game' && pointerControls.isLocked) {
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    if (forward || side) {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      direction.y = 0;
      direction.normalize();
      const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
      const movement = direction.multiplyScalar(forward).add(right.multiplyScalar(side)).normalize().multiplyScalar(4.2 * delta);
      const next = camera.position.clone().add(movement);
      next.y = 1.7;
      if (!collides(next)) camera.position.copy(next);
    }
    const now = performance.now();
    if (socket?.readyState === WebSocket.OPEN && now - lastMoveSent > 100) {
      const direction = new THREE.Vector3();
      camera.getWorldDirection(direction);
      send({
        type: 'move',
        player: {
          ...localPlayer,
          x: camera.position.x,
          z: camera.position.z,
          ry: Math.atan2(direction.x, direction.z),
        },
      });
      lastMoveSent = now;
    }
  }
  for (const avatar of remotePlayers.values()) {
    avatar.position.lerp(avatar.userData.targetPosition, .22);
    avatar.rotation.y = THREE.MathUtils.lerp(avatar.rotation.y, avatar.userData.targetRotation, .22);
  }
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

restoreLocal();
showHome();
animate();

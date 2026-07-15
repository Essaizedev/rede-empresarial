import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { normalizeBlueprint } from "./data.js";

const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.32;

export class Game {
  constructor(root, options) {
    this.root = root;
    this.blueprint = normalizeBlueprint(options.blueprint);
    this.online = Boolean(options.online);
    this.client = options.client || null;
    this.initialDoors = options.doors || {};
    this.initialPlayers = options.players || [];
    this.playerName = options.playerName || "Visitante";
    this.roomCode = options.roomCode || "";
    this.onExit = options.onExit;

    this.keys = Object.create(null);
    this.wallColliders = [];
    this.objectColliders = [];
    this.doorObjects = new Map();
    this.doorStates = new Map();
    this.interactables = [];
    this.remotePlayers = new Map();
    this.lastMoveSent = 0;
    this.lastPositionSent = new THREE.Vector3(999, 999, 999);
    this.running = true;

    this.renderShell();
    this.initThree();
    this.buildWorld();
    this.bindEvents();
    this.bindMultiplayer();
    this.animate();
  }

  renderShell() {
    this.root.innerHTML = `
      <section class="game-shell">
        <div id="game-canvas"></div>
        <div class="game-hud">
          <div class="hud-card">
            <strong>${escapeHtml(this.blueprint.name)}</strong>
            <span>${this.online ? `Sala ${escapeHtml(this.roomCode)}` : "Modo individual"}</span>
          </div>
          <div class="hud-card controls-hint">WASD: andar · Mouse: olhar · Clique: interagir · ESC: soltar mouse</div>
          <button id="game-exit" class="secondary">Sair</button>
        </div>
        <div class="crosshair">+</div>
        <div id="online-list" class="online-list ${this.online ? "" : "hidden"}">
          <strong>Online</strong>
          <div id="online-players"></div>
        </div>
        <div id="game-start" class="game-start">
          <div class="dialog-card">
            <h1>${escapeHtml(this.online ? `Entrar na sala ${this.roomCode}` : "Testar a planta")}</h1>
            <p>Clique abaixo para capturar o mouse. Use W, A, S e D para caminhar.</p>
            <button id="game-enter" class="primary">Entrar na empresa</button>
          </div>
        </div>
        <div id="equipment-modal" class="modal hidden">
          <div class="dialog-card equipment-card">
            <h2 id="eq-name">Equipamento</h2>
            <dl>
              <div><dt>Tipo</dt><dd id="eq-type"></dd></div>
              <div><dt>Setor</dt><dd id="eq-sector"></dd></div>
              <div><dt>IP</dt><dd id="eq-ip"></dd></div>
              <div><dt>Switch</dt><dd id="eq-switch"></dd></div>
              <div><dt>Porta</dt><dd id="eq-port"></dd></div>
            </dl>
            <button id="eq-close" class="primary">Fechar e continuar</button>
          </div>
        </div>
        <div id="game-message" class="toast hidden"></div>
      </section>
    `;
    this.mount = this.root.querySelector("#game-canvas");
    this.startOverlay = this.root.querySelector("#game-start");
    this.modal = this.root.querySelector("#equipment-modal");
    this.onlinePlayersElement = this.root.querySelector("#online-players");
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xb9c3c8);
    this.scene.fog = new THREE.Fog(0xb9c3c8, 35, 90);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.05, 180);
    this.camera.position.set(this.blueprint.spawn.x, PLAYER_HEIGHT, this.blueprint.spawn.z);
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = THREE.MathUtils.degToRad(this.blueprint.spawn.yaw || 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.setSize(this.mount.clientWidth, this.mount.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.mount.appendChild(this.renderer.domElement);

    this.controls = new PointerLockControls(this.camera, this.renderer.domElement);
    this.scene.add(this.camera);

    this.scene.add(new THREE.HemisphereLight(0xf8f5de, 0x66727a, 1.35));
    const sun = new THREE.DirectionalLight(0xfff3ce, 2.1);
    sun.position.set(-18, 24, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -35;
    sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35;
    sun.shadow.camera.bottom = -35;
    this.scene.add(sun);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 4.5;
  }

  buildWorld() {
    this.clearWorld();

    const floorGeometry = new THREE.PlaneGeometry(this.blueprint.floor.width, this.blueprint.floor.depth);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: this.blueprint.floor.color, roughness: 0.92 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.world.add(floor);

    const grid = new THREE.GridHelper(
      Math.max(this.blueprint.floor.width, this.blueprint.floor.depth),
      Math.max(10, Math.round(Math.max(this.blueprint.floor.width, this.blueprint.floor.depth))),
      0x7c796c,
      0xaaa596
    );
    grid.position.y = 0.008;
    grid.material.opacity = 0.18;
    grid.material.transparent = true;
    this.world.add(grid);

    for (const wall of this.blueprint.walls) this.buildWall(wall);
    for (const stairs of this.blueprint.stairs) this.buildStairs(stairs);
    for (const item of this.blueprint.equipment) this.buildEquipment(item);

    for (const [id, open] of Object.entries(this.initialDoors || {})) {
      if (this.doorObjects.has(id)) this.setDoorState(id, Boolean(open), false);
    }
  }

  clearWorld() {
    if (!this.world) return;
    while (this.world.children.length) {
      const object = this.world.children.pop();
      object.traverse?.((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
        else child.material?.dispose?.();
      });
    }
    this.wallColliders = [];
    this.objectColliders = [];
    this.doorObjects.clear();
    this.doorStates.clear();
    this.interactables = [];
  }

  buildWall(wall) {
    const dx = wall.bx - wall.ax;
    const dz = wall.bz - wall.az;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) return;
    const ux = dx / length;
    const uz = dz / length;
    const doors = this.blueprint.doors
      .filter((door) => door.wallId === wall.id)
      .map((door) => ({ door, center: door.t * length }))
      .sort((a, b) => a.center - b.center);

    let cursor = 0;
    for (const entry of doors) {
      const half = Math.min(entry.door.width / 2, length / 2 - 0.05);
      const start = Math.max(cursor, entry.center - half);
      const end = Math.min(length, entry.center + half);
      if (start > cursor + 0.02) this.createWallSegment(wall, cursor, start, wall.height, wall.height / 2);
      if (wall.height > entry.door.height + 0.04) {
        this.createWallSegment(wall, start, end, wall.height - entry.door.height, entry.door.height + (wall.height - entry.door.height) / 2, false);
      }
      this.createDoor(wall, entry.door, entry.center, ux, uz, length);
      cursor = Math.max(cursor, end);
    }
    if (cursor < length - 0.02) this.createWallSegment(wall, cursor, length, wall.height, wall.height / 2);
  }

  createWallSegment(wall, start, end, height, y, collidable = true) {
    const length = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az);
    const ux = (wall.bx - wall.ax) / length;
    const uz = (wall.bz - wall.az) / length;
    const mid = (start + end) / 2;
    const x = wall.ax + ux * mid;
    const z = wall.az + uz * mid;
    const segmentLength = end - start;
    const geometry = new THREE.BoxGeometry(segmentLength, height, wall.thickness);
    const material = new THREE.MeshStandardMaterial({ color: 0xc8be8d, roughness: 0.88 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = Math.atan2(-uz, ux);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.world.add(mesh);

    if (collidable) {
      this.wallColliders.push({
        ax: wall.ax + ux * start,
        az: wall.az + uz * start,
        bx: wall.ax + ux * end,
        bz: wall.az + uz * end,
        padding: wall.thickness / 2
      });
    }
  }

  createDoor(wall, door, centerDistance, ux, uz, wallLength) {
    const half = Math.min(door.width / 2, wallLength / 2 - 0.05);
    const hingeDistance = centerDistance + (door.hinge === "left" ? -half : half);
    const hingeX = wall.ax + ux * hingeDistance;
    const hingeZ = wall.az + uz * hingeDistance;
    const wallAngle = Math.atan2(-uz, ux);

    const pivot = new THREE.Group();
    pivot.position.set(hingeX, 0, hingeZ);
    pivot.rotation.y = wallAngle;

    const geometry = new THREE.BoxGeometry(door.width, door.height, 0.075);
    const material = new THREE.MeshStandardMaterial({ color: 0x7b5637, roughness: 0.7 });
    const leaf = new THREE.Mesh(geometry, material);
    leaf.position.set(door.hinge === "left" ? half : -half, door.height / 2, 0);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    leaf.userData.interactive = { type: "door", id: door.id };
    pivot.add(leaf);

    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xc2aa6b, metalness: 0.55, roughness: 0.25 })
    );
    knob.position.set(door.hinge === "left" ? door.width - 0.17 : -door.width + 0.17, door.height * 0.52, -0.075);
    leaf.add(knob);

    this.world.add(pivot);
    this.interactables.push(leaf);
    const record = {
      id: door.id,
      door,
      pivot,
      leaf,
      closedAngle: wallAngle,
      targetAngle: wallAngle,
      currentAngle: wallAngle,
      segment: {
        ax: wall.ax + ux * (centerDistance - half),
        az: wall.az + uz * (centerDistance - half),
        bx: wall.ax + ux * (centerDistance + half),
        bz: wall.az + uz * (centerDistance + half),
        padding: 0.06
      }
    };
    this.doorObjects.set(door.id, record);
    this.doorStates.set(door.id, false);
  }

  buildStairs(item) {
    const group = new THREE.Group();
    group.position.set(item.x, 0, item.z);
    group.rotation.y = THREE.MathUtils.degToRad(-item.rotation);
    const stepDepth = item.depth / item.steps;
    for (let i = 0; i < item.steps; i += 1) {
      const height = item.height * (i + 1) / item.steps;
      const geometry = new THREE.BoxGeometry(item.width, height, stepDepth + 0.01);
      const material = new THREE.MeshStandardMaterial({ color: i % 2 ? 0x8f8e85 : 0x9d9c93, roughness: 0.92 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(0, height / 2, -item.depth / 2 + stepDepth * (i + 0.5));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.world.add(group);
  }

  buildEquipment(item) {
    const group = new THREE.Group();
    group.position.set(item.x, 0, item.z);
    group.rotation.y = THREE.MathUtils.degToRad(-item.rotation);
    group.userData.equipment = item;

    const interactiveMaterial = new THREE.MeshStandardMaterial({ color: equipmentColor(item.type), roughness: 0.62, metalness: 0.1 });
    let clickable;

    if (item.type === "pc") {
      const desk = meshBox(1.2, 0.75, 0.65, 0x80684b);
      desk.position.y = 0.38;
      group.add(desk);
      clickable = meshBox(0.66, 0.46, 0.10, 0x253039, interactiveMaterial);
      clickable.position.set(0, 1.12, -0.18);
      group.add(clickable);
      const stand = meshBox(0.08, 0.28, 0.08, 0x555b5d);
      stand.position.set(0, 0.86, -0.18);
      group.add(stand);
    } else if (item.type === "switch") {
      clickable = meshBox(1.05, 0.24, 0.55, 0x30434d, interactiveMaterial);
      clickable.position.y = 0.65;
      group.add(clickable);
      for (let i = 0; i < 8; i += 1) {
        const port = meshBox(0.07, 0.07, 0.02, 0x7fb789);
        port.position.set(-0.36 + i * 0.105, 0.65, -0.29);
        group.add(port);
      }
    } else if (item.type === "point") {
      clickable = meshBox(0.28, 0.28, 0.08, 0x2671cb, interactiveMaterial);
      clickable.position.y = 0.55;
      group.add(clickable);
    } else if (item.type === "printer") {
      clickable = meshBox(0.7, 0.55, 0.55, 0x706886, interactiveMaterial);
      clickable.position.y = 0.48;
      group.add(clickable);
    } else if (item.type === "router") {
      clickable = meshBox(0.72, 0.14, 0.48, 0x4c8061, interactiveMaterial);
      clickable.position.y = 0.75;
      group.add(clickable);
      for (const x of [-0.25, 0.25]) {
        const antenna = meshBox(0.035, 0.7, 0.035, 0x222927);
        antenna.position.set(x, 1.05, 0.12);
        group.add(antenna);
      }
    } else if (item.type === "server") {
      clickable = meshBox(0.8, 2.0, 0.75, 0x4d5357, interactiveMaterial);
      clickable.position.y = 1;
      group.add(clickable);
    } else {
      clickable = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 24), interactiveMaterial);
      clickable.position.y = 2.5;
      group.add(clickable);
    }

    clickable.userData.interactive = { type: "equipment", item };
    clickable.castShadow = true;
    clickable.receiveShadow = true;
    this.interactables.push(clickable);
    this.objectColliders.push({ x: item.x, z: item.z, radius: item.type === "server" ? 0.55 : 0.38 });
    this.world.add(group);
  }

  bindEvents() {
    this.keyDown = (event) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
        event.preventDefault();
        this.keys[event.code] = true;
      }
    };
    this.keyUp = (event) => { this.keys[event.code] = false; };
    window.addEventListener("keydown", this.keyDown, { passive: false });
    window.addEventListener("keyup", this.keyUp);

    this.resizeHandler = () => this.resize();
    window.addEventListener("resize", this.resizeHandler);
    this.resize();

    this.root.querySelector("#game-enter").addEventListener("click", () => {
      this.startOverlay.classList.add("hidden");
      this.controls.lock();
    });
    this.controls.addEventListener("unlock", () => {
      if (!this.modal.classList.contains("hidden")) return;
      if (this.running) this.startOverlay.classList.remove("hidden");
    });
    this.controls.addEventListener("lock", () => this.startOverlay.classList.add("hidden"));

    this.renderer.domElement.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || !this.controls.isLocked) return;
      this.interact();
    });

    this.root.querySelector("#eq-close").addEventListener("click", () => {
      this.modal.classList.add("hidden");
      this.controls.lock();
    });
    this.root.querySelector("#game-exit").addEventListener("click", () => this.exit());
  }

  bindMultiplayer() {
    if (!this.client) return;
    for (const player of this.initialPlayers) this.addOrUpdateRemotePlayer(player);
    this.refreshOnlineList();

    this.onPlayerJoined = (event) => this.addOrUpdateRemotePlayer(event.detail.player);
    this.onPlayerMove = (event) => {
      if (event.detail.id === this.client.id) return;
      const existing = this.remotePlayers.get(event.detail.id);
      if (!existing) return;
      existing.target.set(event.detail.x, event.detail.y - PLAYER_HEIGHT, event.detail.z);
      existing.targetYaw = event.detail.yaw;
    };
    this.onPlayerLeft = (event) => this.removeRemotePlayer(event.detail.id);
    this.onDoor = (event) => this.setDoorState(event.detail.id, event.detail.open, false);
    this.onBlueprint = (event) => {
      this.blueprint = normalizeBlueprint(event.detail.blueprint);
      this.initialDoors = event.detail.doors || {};
      this.buildWorld();
      this.camera.position.set(this.blueprint.spawn.x, PLAYER_HEIGHT, this.blueprint.spawn.z);
      this.showMessage("A planta da sala foi atualizada.");
    };
    this.onError = (event) => this.showMessage(event.detail.message || "Erro no servidor online.");

    this.client.addEventListener("player-joined", this.onPlayerJoined);
    this.client.addEventListener("player-move", this.onPlayerMove);
    this.client.addEventListener("player-left", this.onPlayerLeft);
    this.client.addEventListener("door", this.onDoor);
    this.client.addEventListener("blueprint-updated", this.onBlueprint);
    this.client.addEventListener("error", this.onError);
  }

  interact() {
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const intersections = this.raycaster.intersectObjects(this.interactables, true);
    if (!intersections.length) return;
    let object = intersections[0].object;
    while (object && !object.userData.interactive) object = object.parent;
    const data = object?.userData?.interactive;
    if (!data) return;

    if (data.type === "door") {
      const open = !this.doorStates.get(data.id);
      this.setDoorState(data.id, open, true);
    } else if (data.type === "equipment") {
      this.showEquipment(data.item);
    }
  }

  setDoorState(id, open, broadcast) {
    const record = this.doorObjects.get(id);
    if (!record) return;
    this.doorStates.set(id, Boolean(open));
    record.targetAngle = record.closedAngle + (open ? THREE.MathUtils.degToRad(record.door.openAngle) : 0);
    if (broadcast) this.client?.sendDoor(id, open);
  }

  showEquipment(item) {
    this.controls.unlock();
    this.root.querySelector("#eq-name").textContent = item.name;
    this.root.querySelector("#eq-type").textContent = typeLabel(item.type);
    this.root.querySelector("#eq-sector").textContent = item.sector;
    this.root.querySelector("#eq-ip").textContent = item.ip;
    this.root.querySelector("#eq-switch").textContent = item.switch;
    this.root.querySelector("#eq-port").textContent = item.port;
    this.modal.classList.remove("hidden");
  }

  updateMovement(delta) {
    if (!this.controls.isLocked) return;
    let forward = 0;
    let side = 0;
    if (this.keys.KeyW || this.keys.ArrowUp) forward += 1;
    if (this.keys.KeyS || this.keys.ArrowDown) forward -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) side += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) side -= 1;
    if (!forward && !side) return;

    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();
    const right = new THREE.Vector3().crossVectors(direction, this.camera.up).normalize();
    const move = direction.multiplyScalar(forward).add(right.multiplyScalar(side));
    if (move.lengthSq() > 1) move.normalize();
    move.multiplyScalar(Math.min(delta, 0.05) * 3.8);

    const current = this.camera.position;
    const candidateX = { x: current.x + move.x, z: current.z };
    if (!this.collides(candidateX.x, candidateX.z)) current.x = candidateX.x;
    const candidateZ = { x: current.x, z: current.z + move.z };
    if (!this.collides(candidateZ.x, candidateZ.z)) current.z = candidateZ.z;
    current.y = PLAYER_HEIGHT + this.getGroundHeight(current.x, current.z);
  }

  collides(x, z) {
    const halfW = this.blueprint.floor.width / 2;
    const halfD = this.blueprint.floor.depth / 2;
    if (x < -halfW + PLAYER_RADIUS || x > halfW - PLAYER_RADIUS || z < -halfD + PLAYER_RADIUS || z > halfD - PLAYER_RADIUS) return true;

    for (const segment of this.wallColliders) {
      if (pointSegmentDistance(x, z, segment.ax, segment.az, segment.bx, segment.bz) < PLAYER_RADIUS + segment.padding) return true;
    }
    for (const [id, record] of this.doorObjects) {
      if (this.doorStates.get(id)) continue;
      const segment = record.segment;
      if (pointSegmentDistance(x, z, segment.ax, segment.az, segment.bx, segment.bz) < PLAYER_RADIUS + segment.padding) return true;
    }
    for (const object of this.objectColliders) {
      if (Math.hypot(x - object.x, z - object.z) < PLAYER_RADIUS + object.radius) return true;
    }
    return false;
  }

  getGroundHeight(x, z) {
    let height = 0;
    for (const stairs of this.blueprint.stairs) {
      const angle = THREE.MathUtils.degToRad(stairs.rotation);
      const dx = x - stairs.x;
      const dz = z - stairs.z;
      const localX = dx * Math.cos(angle) - dz * Math.sin(angle);
      const localZ = dx * Math.sin(angle) + dz * Math.cos(angle);
      if (Math.abs(localX) <= stairs.width / 2 && Math.abs(localZ) <= stairs.depth / 2) {
        const t = (localZ + stairs.depth / 2) / stairs.depth;
        height = Math.max(height, THREE.MathUtils.clamp(t, 0, 1) * stairs.height);
      }
    }
    return height;
  }

  updateDoors(delta) {
    for (const record of this.doorObjects.values()) {
      const difference = shortestAngle(record.targetAngle - record.currentAngle);
      record.currentAngle += difference * Math.min(1, delta * 7);
      record.pivot.rotation.y = record.currentAngle;
    }
  }

  addOrUpdateRemotePlayer(player) {
    if (!player || player.id === this.client?.id) return;
    let remote = this.remotePlayers.get(player.id);
    if (!remote) {
      const group = new THREE.Group();
      const material = new THREE.MeshStandardMaterial({ color: player.color || 0x4f8cff, roughness: 0.72 });
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.72, 5, 10), material);
      body.position.y = 0.85;
      body.castShadow = true;
      group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xd7ad8e, roughness: 0.8 }));
      head.position.y = 1.52;
      head.castShadow = true;
      group.add(head);
      const label = createNameSprite(player.name || "Visitante");
      label.position.y = 2.0;
      group.add(label);
      group.position.set(player.x || 0, (player.y || PLAYER_HEIGHT) - PLAYER_HEIGHT, player.z || 0);
      this.scene.add(group);
      remote = {
        id: player.id,
        name: player.name || "Visitante",
        group,
        target: group.position.clone(),
        targetYaw: player.yaw || 0
      };
      this.remotePlayers.set(player.id, remote);
    } else {
      remote.name = player.name || remote.name;
      remote.target.set(player.x || 0, (player.y || PLAYER_HEIGHT) - PLAYER_HEIGHT, player.z || 0);
      remote.targetYaw = player.yaw || 0;
    }
    this.refreshOnlineList();
  }

  removeRemotePlayer(id) {
    const remote = this.remotePlayers.get(id);
    if (!remote) return;
    this.scene.remove(remote.group);
    this.remotePlayers.delete(id);
    this.refreshOnlineList();
  }

  updateRemotePlayers(delta) {
    for (const remote of this.remotePlayers.values()) {
      remote.group.position.lerp(remote.target, Math.min(1, delta * 10));
      remote.group.rotation.y += shortestAngle(remote.targetYaw - remote.group.rotation.y) * Math.min(1, delta * 10);
    }
  }

  refreshOnlineList() {
    if (!this.onlinePlayersElement) return;
    const names = [this.playerName, ...[...this.remotePlayers.values()].map((player) => player.name)];
    this.onlinePlayersElement.innerHTML = names.map((name) => `<span>● ${escapeHtml(name)}</span>`).join("");
  }

  sendMovement(now) {
    if (!this.client || now - this.lastMoveSent < 100) return;
    const position = this.camera.position;
    const moved = position.distanceToSquared(this.lastPositionSent) > 0.0004;
    if (!moved && now - this.lastMoveSent < 900) return;
    this.lastMoveSent = now;
    this.lastPositionSent.copy(position);
    this.client.sendMove({
      x: position.x,
      y: position.y,
      z: position.z,
      yaw: this.camera.rotation.y
    });
  }

  animate = () => {
    if (!this.running) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    const delta = Math.min(this.clock.getDelta(), 0.05);
    this.updateMovement(delta);
    this.updateDoors(delta);
    this.updateRemotePlayers(delta);
    this.sendMovement(performance.now());
    this.renderer.render(this.scene, this.camera);
  };

  resize() {
    if (!this.renderer) return;
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  showMessage(message) {
    const toast = this.root.querySelector("#game-message");
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(this.messageTimer);
    this.messageTimer = setTimeout(() => toast.classList.add("hidden"), 3500);
  }

  exit() {
    this.running = false;
    this.controls.unlock();
    cancelAnimationFrame(this.animationFrame);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("resize", this.resizeHandler);
    if (this.client) {
      this.client.removeEventListener("player-joined", this.onPlayerJoined);
      this.client.removeEventListener("player-move", this.onPlayerMove);
      this.client.removeEventListener("player-left", this.onPlayerLeft);
      this.client.removeEventListener("door", this.onDoor);
      this.client.removeEventListener("blueprint-updated", this.onBlueprint);
      this.client.removeEventListener("error", this.onError);
      this.client.close();
    }
    this.renderer.dispose();
    this.root.innerHTML = "";
    this.onExit?.();
  }
}

function meshBox(width, height, depth, color, suppliedMaterial = null) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const material = suppliedMaterial || new THREE.MeshStandardMaterial({ color, roughness: 0.75 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function equipmentColor(type) {
  return ({
    pc: 0x26323a,
    switch: 0x30434d,
    point: 0x2671cb,
    printer: 0x706886,
    router: 0x4c8061,
    server: 0x4d5357,
    "access-point": 0xb77e42
  })[type] || 0x555555;
}

function typeLabel(type) {
  return ({
    pc: "Computador",
    switch: "Switch",
    point: "Ponto de rede",
    printer: "Impressora",
    router: "Roteador",
    server: "Servidor",
    "access-point": "Access point"
  })[type] || "Equipamento";
}

function pointSegmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  const x = ax + dx * t;
  const z = az + dz * t;
  return Math.hypot(px - x, pz - z);
}

function shortestAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function createNameSprite(name) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(20,23,24,.78)";
  ctx.roundRect(4, 4, 312, 72, 18);
  ctx.fill();
  ctx.fillStyle = "white";
  ctx.font = "bold 30px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(name).slice(0, 24), 160, 40);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.1, 0.52, 1);
  return sprite;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

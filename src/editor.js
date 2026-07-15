import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  BACKGROUND_KEY,
  createDefaultBlueprint,
  deepClone,
  downloadBlueprint,
  normalizeBlueprint,
  readBlueprintFile,
  saveBlueprint,
  uid
} from "./data.js";

const EQUIPMENT_TYPES = ["pc", "switch", "point", "printer", "router", "server", "access-point"];
const DEFAULT_SNAP = 0.25;

export class Builder {
  constructor(root, options = {}) {
    this.root = root;
    this.options = options;
    this.blueprint = normalizeBlueprint(options.blueprint || createDefaultBlueprint());
    this.tool = "select";
    this.mode = "translate";
    this.selected = null;
    this.snapEnabled = true;
    this.snapSize = DEFAULT_SNAP;
    this.wallStart = null;
    this.pointerDown = null;
    this.hoverPoint = null;
    this.objectByKey = new Map();
    this.pickables = [];
    this.selectionHelper = null;
    this.endpointHandles = [];
    this.history = [];
    this.future = [];
    const savedBackground = localStorage.getItem(BACKGROUND_KEY);
    this.backgroundUrl = savedBackground === "__none__" ? "" : (savedBackground || "/planta-referencia.png");
    this.destroyed = false;

    this.renderShell();
    this.initThree();
    this.bindEvents();
    this.rebuildScene();
    this.renderInspector();
    this.animate();
  }

  renderShell() {
    this.root.innerHTML = `
      <section class="builder-shell builder-3d">
        <header class="builder-topbar">
          <div class="builder-title">
            <strong>Construtor 3D</strong>
            <span class="muted">Desenhe e edite a empresa diretamente em 3D.</span>
          </div>
          <div class="top-actions">
            <button data-action="home" class="secondary">Início</button>
            <button data-action="new" class="secondary">Nova</button>
            <button data-action="undo" class="secondary" title="Ctrl+Z">Desfazer</button>
            <button data-action="redo" class="secondary" title="Ctrl+Y">Refazer</button>
            <button data-action="background" class="secondary">Planta do Paint</button>
            <button data-action="save" class="secondary">Salvar</button>
            <button data-action="export" class="secondary">Exportar</button>
            <button data-action="import" class="secondary">Importar</button>
            <button data-action="play" class="primary">Jogar/Testar</button>
            <button data-action="publish" class="accent">Publicar sala</button>
          </div>
          <input id="builder-import" type="file" accept="application/json" hidden />
          <input id="builder-background" type="file" accept="image/*" hidden />
        </header>

        <div class="builder-workspace builder-workspace-3d">
          <aside class="toolbox toolbox-3d">
            ${this.toolButton("select", "Selecionar", "↖")}
            ${this.toolButton("wall", "Parede", "▰")}
            ${this.toolButton("door", "Porta", "🚪")}
            ${this.toolButton("pc", "Computador", "🖥")}
            ${this.toolButton("switch", "Switch", "▤")}
            ${this.toolButton("point", "Ponto de rede", "●")}
            ${this.toolButton("printer", "Impressora", "▣")}
            ${this.toolButton("router", "Roteador", "⌁")}
            ${this.toolButton("server", "Servidor", "▥")}
            ${this.toolButton("access-point", "Access point", "◉")}
            ${this.toolButton("stairs", "Escada", "▱")}
            ${this.toolButton("spawn", "Início", "★")}
          </aside>

          <main class="viewport-3d-wrap">
            <div id="builder-viewport"></div>
            <div class="viewport-toolbar">
              <button data-view="perspective" class="view-button active">Perspectiva</button>
              <button data-view="top" class="view-button">Vista superior</button>
              <button data-mode="translate" class="view-button active">Mover</button>
              <button data-mode="rotate" class="view-button">Girar</button>
              <button data-action="duplicate" class="view-button">Duplicar</button>
              <button data-action="delete" class="view-button danger-soft">Apagar</button>
            </div>
            <div class="viewport-help" id="viewport-help">
              Selecione uma ferramenta. Para criar uma parede, clique no início e no fim sobre a grade.
            </div>
            <div class="coordinate-badge" id="coordinate-badge">X 0,00 · Z 0,00</div>
          </main>

          <aside class="inspector inspector-3d">
            <h2>Propriedades</h2>
            <div id="inspector-content"></div>
          </aside>
        </div>
      </section>
    `;

    this.mount = this.root.querySelector("#builder-viewport");
    this.inspector = this.root.querySelector("#inspector-content");
    this.help = this.root.querySelector("#viewport-help");
    this.coords = this.root.querySelector("#coordinate-badge");
  }

  toolButton(tool, label, icon) {
    return `<button class="tool-button" data-tool="${tool}" title="${label}"><span>${icon}</span><small>${label}</small></button>`;
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbcc5c7);
    this.scene.fog = new THREE.Fog(0xbcc5c7, 55, 150);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 250);
    this.camera.position.set(18, 17, 20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mount.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 95;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.025;
    this.controls.target.set(0, 0, 0);

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    const helper = this.transform.getHelper?.() || this.transform;
    this.scene.add(helper);
    this.transform.setMode(this.mode);
    this.transform.setTranslationSnap(this.snapEnabled ? this.snapSize : null);
    this.transform.setRotationSnap(THREE.MathUtils.degToRad(15));
    this.transform.addEventListener("dragging-changed", (event) => {
      this.controls.enabled = !event.value;
      if (event.value) this.pushHistory();
      else {
        this.commitTransform();
        saveBlueprint(this.blueprint);
      }
    });
    this.transform.addEventListener("objectChange", () => this.syncTransformToBlueprint());

    this.scene.add(new THREE.HemisphereLight(0xfaf7df, 0x617078, 1.45));
    const sun = new THREE.DirectionalLight(0xfff2c8, 2.1);
    sun.position.set(-20, 30, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    this.scene.add(sun);

    this.floorGroup = new THREE.Group();
    this.worldGroup = new THREE.Group();
    this.overlayGroup = new THREE.Group();
    this.scene.add(this.floorGroup, this.worldGroup, this.overlayGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.clock = new THREE.Clock();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.mount);
    this.resize();
  }

  bindEvents() {
    this.root.querySelectorAll("[data-tool]").forEach((button) => {
      button.addEventListener("click", () => this.setTool(button.dataset.tool));
    });

    this.root.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => this.setTransformMode(button.dataset.mode));
    });

    this.root.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => this.setView(button.dataset.view));
    });

    this.root.querySelector("[data-action='home']").addEventListener("click", () => this.options.onBack?.());
    this.root.querySelector("[data-action='new']").addEventListener("click", () => this.newBlueprint());
    this.root.querySelector("[data-action='undo']").addEventListener("click", () => this.undo());
    this.root.querySelector("[data-action='redo']").addEventListener("click", () => this.redo());
    this.root.querySelector("[data-action='duplicate']").addEventListener("click", () => this.duplicateSelected());
    this.root.querySelector("[data-action='delete']").addEventListener("click", () => this.deleteSelected());
    this.root.querySelector("[data-action='save']").addEventListener("click", () => {
      saveBlueprint(this.blueprint);
      this.toast("Projeto salvo neste navegador.");
    });
    this.root.querySelector("[data-action='export']").addEventListener("click", () => downloadBlueprint(this.blueprint));
    this.root.querySelector("[data-action='play']").addEventListener("click", () => {
      saveBlueprint(this.blueprint);
      this.options.onPlay?.(deepClone(this.blueprint));
    });
    this.root.querySelector("[data-action='publish']").addEventListener("click", () => {
      saveBlueprint(this.blueprint);
      this.options.onPublish?.(deepClone(this.blueprint));
    });

    const importInput = this.root.querySelector("#builder-import");
    this.root.querySelector("[data-action='import']").addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", async () => {
      const [file] = importInput.files;
      if (!file) return;
      try {
        this.pushHistory();
        this.blueprint = await readBlueprintFile(file);
        this.selected = null;
        saveBlueprint(this.blueprint);
        this.rebuildScene();
        this.renderInspector();
        this.toast("Projeto importado.");
      } catch {
        alert("Esse arquivo não é um projeto válido.");
      }
      importInput.value = "";
    });

    const backgroundInput = this.root.querySelector("#builder-background");
    this.root.querySelector("[data-action='background']").addEventListener("click", () => backgroundInput.click());
    backgroundInput.addEventListener("change", () => this.importBackground(backgroundInput));

    this.canvasPointerDown = (event) => this.onPointerDown(event);
    this.canvasPointerMove = (event) => this.onPointerMove(event);
    this.canvasPointerUp = (event) => this.onPointerUp(event);
    this.renderer.domElement.addEventListener("pointerdown", this.canvasPointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.canvasPointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.canvasPointerUp);
    this.renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());

    this.keyHandler = (event) => {
      if (isEditingField()) return;
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
        event.preventDefault();
        event.shiftKey ? this.redo() : this.undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.code === "KeyY") {
        event.preventDefault();
        this.redo();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace")) {
        event.preventDefault();
        this.deleteSelected();
        return;
      }
      if (event.key === "Escape") {
        this.wallStart = null;
        this.clearPreview();
        this.setTool("select");
      }
      if (event.code === "KeyG") this.setTransformMode("translate");
      if (event.code === "KeyR") this.setTransformMode("rotate");
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  setTool(tool) {
    this.tool = tool;
    this.wallStart = null;
    this.clearPreview();
    this.transform.detach();
    delete this.transform.userData.wallHandle;
    this.root.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
    this.help.textContent = helpForTool(tool);
    this.renderer.domElement.style.cursor = tool === "select" ? "default" : "crosshair";
    if (tool === "select") this.attachTransformForSelection();
  }

  setTransformMode(mode) {
    this.mode = mode;
    this.transform.setMode(mode);
    this.root.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  }

  setView(view) {
    this.root.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    const size = Math.max(this.blueprint.floor.width, this.blueprint.floor.depth);
    if (view === "top") {
      this.camera.position.set(0.001, size * 1.12, 0.001);
      this.controls.target.set(0, 0, 0);
    } else {
      this.camera.position.set(size * .65, size * .58, size * .72);
      this.controls.target.set(0, 0, 0);
    }
    this.controls.update();
  }

  newBlueprint() {
    if (!confirm("Criar um projeto novo? Salve ou exporte o atual antes de continuar.")) return;
    this.pushHistory();
    this.blueprint = createDefaultBlueprint();
    this.blueprint.walls = [];
    this.blueprint.doors = [];
    this.blueprint.equipment = [];
    this.blueprint.stairs = [];
    this.selected = null;
    saveBlueprint(this.blueprint);
    this.rebuildScene();
    this.renderInspector();
  }

  pushHistory() {
    this.history.push(deepClone(this.blueprint));
    if (this.history.length > 40) this.history.shift();
    this.future.length = 0;
  }

  undo() {
    const previous = this.history.pop();
    if (!previous) return;
    this.future.push(deepClone(this.blueprint));
    this.blueprint = normalizeBlueprint(previous);
    this.selected = null;
    this.rebuildScene();
    this.renderInspector();
    saveBlueprint(this.blueprint);
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.history.push(deepClone(this.blueprint));
    this.blueprint = normalizeBlueprint(next);
    this.selected = null;
    this.rebuildScene();
    this.renderInspector();
    saveBlueprint(this.blueprint);
  }

  importBackground(input) {
    const [file] = input.files;
    if (!file) return;
    if (file.size > 4_000_000) {
      alert("Escolha uma imagem com até 4 MB para manter o projeto leve.");
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.backgroundUrl = String(reader.result);
      try { localStorage.setItem(BACKGROUND_KEY, this.backgroundUrl); } catch {}
      this.rebuildFloor();
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  rebuildScene() {
    this.transform.detach();
    delete this.transform.userData.wallHandle;
    this.previewObject = null;
    disposeGroup(this.worldGroup);
    disposeGroup(this.overlayGroup);
    this.objectByKey.clear();
    this.pickables = [];
    this.endpointHandles = [];
    this.rebuildFloor();

    for (const wall of this.blueprint.walls) this.buildWall(wall);
    for (const stairs of this.blueprint.stairs) this.buildStairs(stairs);
    for (const equipment of this.blueprint.equipment) this.buildEquipment(equipment);
    this.buildSpawn();
    this.applySelectionVisuals();
  }

  rebuildFloor() {
    disposeGroup(this.floorGroup);
    const floorGeometry = new THREE.PlaneGeometry(this.blueprint.floor.width, this.blueprint.floor.depth);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: this.blueprint.floor.color,
      roughness: 0.94,
      transparent: Boolean(this.backgroundUrl),
      opacity: this.backgroundUrl ? 0.58 : 1
    });
    this.floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.y = 0;
    this.floorMesh.receiveShadow = true;
    this.floorMesh.userData.ground = true;
    this.floorGroup.add(this.floorMesh);

    if (this.backgroundUrl) {
      const texture = new THREE.TextureLoader().load(this.backgroundUrl);
      texture.colorSpace = THREE.SRGBColorSpace;
      const reference = new THREE.Mesh(
        new THREE.PlaneGeometry(this.blueprint.floor.width, this.blueprint.floor.depth),
        new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.62, depthWrite: false })
      );
      reference.rotation.x = -Math.PI / 2;
      reference.position.y = 0.018;
      reference.renderOrder = 1;
      this.floorGroup.add(reference);
    }

    const gridSize = Math.max(this.blueprint.floor.width, this.blueprint.floor.depth);
    const grid = new THREE.GridHelper(gridSize, Math.max(10, Math.round(gridSize / this.snapSize)), 0x5e625d, 0x94978f);
    grid.position.y = 0.026;
    grid.material.transparent = true;
    grid.material.opacity = 0.32;
    grid.renderOrder = 2;
    this.floorGroup.add(grid);
  }

  buildWall(wall) {
    const group = new THREE.Group();
    group.userData.entity = { kind: "wall", id: wall.id };
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
      if (start > cursor + 0.02) this.createWallSegment(group, wall, cursor, start, wall.height, wall.height / 2);
      if (wall.height > entry.door.height + 0.04) {
        this.createWallSegment(group, wall, start, end, wall.height - entry.door.height, entry.door.height + (wall.height - entry.door.height) / 2);
      }
      this.createDoor(group, wall, entry.door, entry.center, ux, uz, length);
      cursor = Math.max(cursor, end);
    }
    if (cursor < length - 0.02) this.createWallSegment(group, wall, cursor, length, wall.height, wall.height / 2);

    this.worldGroup.add(group);
    this.objectByKey.set(keyOf("wall", wall.id), group);
  }

  createWallSegment(group, wall, start, end, height, y) {
    const length = Math.hypot(wall.bx - wall.ax, wall.bz - wall.az);
    const ux = (wall.bx - wall.ax) / length;
    const uz = (wall.bz - wall.az) / length;
    const mid = (start + end) / 2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(end - start, height, wall.thickness),
      new THREE.MeshStandardMaterial({ color: 0xc7bd8c, roughness: 0.88 })
    );
    mesh.position.set(wall.ax + ux * mid, y, wall.az + uz * mid);
    mesh.rotation.y = Math.atan2(-uz, ux);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.entity = { kind: "wall", id: wall.id };
    group.add(mesh);
    this.pickables.push(mesh);
  }

  createDoor(parent, wall, door, centerDistance, ux, uz, wallLength) {
    const half = Math.min(door.width / 2, wallLength / 2 - 0.05);
    const centerX = wall.ax + ux * centerDistance;
    const centerZ = wall.az + uz * centerDistance;
    const wallAngle = Math.atan2(-uz, ux);
    const group = new THREE.Group();
    group.position.set(centerX, 0, centerZ);
    group.rotation.y = wallAngle;
    group.userData.entity = { kind: "door", id: door.id };

    const frameMaterial = new THREE.MeshStandardMaterial({ color: 0x4e493d, roughness: .76 });
    const frameTop = new THREE.Mesh(new THREE.BoxGeometry(door.width + .12, .12, wall.thickness + .05), frameMaterial);
    frameTop.position.y = door.height + .06;
    group.add(frameTop);
    for (const side of [-1, 1]) {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(.10, door.height, wall.thickness + .05), frameMaterial);
      jamb.position.set(side * (door.width / 2 + .01), door.height / 2, 0);
      group.add(jamb);
    }

    const leaf = new THREE.Mesh(
      new THREE.BoxGeometry(door.width - .06, door.height - .05, .075),
      new THREE.MeshStandardMaterial({ color: 0x795438, roughness: .70 })
    );
    leaf.position.y = door.height / 2;
    leaf.userData.entity = { kind: "door", id: door.id };
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);
    this.pickables.push(leaf);

    parent.add(group);
    this.objectByKey.set(keyOf("door", door.id), group);
  }

  buildEquipment(item) {
    const group = createEquipmentModel(item.type);
    group.position.set(item.x, 0, item.z);
    group.rotation.y = THREE.MathUtils.degToRad(-item.rotation);
    group.userData.entity = { kind: "equipment", id: item.id };
    group.traverse((child) => {
      if (child.isMesh) {
        child.userData.entity = { kind: "equipment", id: item.id };
        child.castShadow = true;
        child.receiveShadow = true;
        this.pickables.push(child);
      }
    });
    this.worldGroup.add(group);
    this.objectByKey.set(keyOf("equipment", item.id), group);
  }

  buildStairs(item) {
    const group = new THREE.Group();
    group.position.set(item.x, 0, item.z);
    group.rotation.y = THREE.MathUtils.degToRad(-item.rotation);
    group.userData.entity = { kind: "stairs", id: item.id };
    const stepDepth = item.depth / item.steps;
    for (let index = 0; index < item.steps; index += 1) {
      const height = item.height * (index + 1) / item.steps;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(item.width, height, stepDepth + .01),
        new THREE.MeshStandardMaterial({ color: index % 2 ? 0x8f8e85 : 0x9d9c93, roughness: .92 })
      );
      mesh.position.set(0, height / 2, -item.depth / 2 + stepDepth * (index + .5));
      mesh.userData.entity = { kind: "stairs", id: item.id };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      this.pickables.push(mesh);
    }
    this.worldGroup.add(group);
    this.objectByKey.set(keyOf("stairs", item.id), group);
  }

  buildSpawn() {
    const group = new THREE.Group();
    group.position.set(this.blueprint.spawn.x, 0, this.blueprint.spawn.z);
    group.rotation.y = THREE.MathUtils.degToRad(-this.blueprint.spawn.yaw);
    group.userData.entity = { kind: "spawn", id: "spawn" };
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(.42, .42, .08, 24),
      new THREE.MeshStandardMaterial({ color: 0xe2c94e, roughness: .55 })
    );
    marker.position.y = .05;
    marker.userData.entity = { kind: "spawn", id: "spawn" };
    group.add(marker);
    const arrow = new THREE.Mesh(
      new THREE.ConeGeometry(.20, .55, 4),
      new THREE.MeshStandardMaterial({ color: 0x5c4b15 })
    );
    arrow.rotation.x = Math.PI / 2;
    arrow.position.set(0, .18, -.55);
    arrow.userData.entity = { kind: "spawn", id: "spawn" };
    group.add(arrow);
    this.pickables.push(marker, arrow);
    this.overlayGroup.add(group);
    this.objectByKey.set(keyOf("spawn", "spawn"), group);
  }

  applySelectionVisuals() {
    this.selectionHelper = null;
    this.endpointHandles = [];
    if (!this.selected) return;
    const object = this.objectByKey.get(keyOf(this.selected.kind, this.selected.id));
    if (!object) return;

    if (this.selected.kind === "wall") {
      const wall = this.getSelectedData();
      for (const [part, x, z, color] of [
        ["start", wall.ax, wall.az, 0x3b82f6],
        ["end", wall.bx, wall.bz, 0xf59e0b]
      ]) {
        const handle = new THREE.Mesh(
          new THREE.SphereGeometry(.18, 16, 12),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .2 })
        );
        handle.position.set(x, .22, z);
        handle.userData.entity = { kind: "wall-handle", id: wall.id, part };
        this.overlayGroup.add(handle);
        this.pickables.push(handle);
        this.endpointHandles.push(handle);
      }
    }

    this.selectionHelper = new THREE.BoxHelper(object, 0x2d76ff);
    this.overlayGroup.add(this.selectionHelper);
    this.attachTransformForSelection();
  }

  attachTransformForSelection() {
    this.transform.detach();
    delete this.transform.userData.wallHandle;
    if (!this.selected) return;
    const object = this.objectByKey.get(keyOf(this.selected.kind, this.selected.id));
    if (!object) return;
    if (["equipment", "stairs", "spawn"].includes(this.selected.kind)) {
      this.transform.attach(object);
      this.transform.setMode(this.mode);
      this.transform.showY = false;
      this.transform.setSpace("world");
    } else if (this.selected.kind === "door") {
      this.transform.attach(object);
      this.transform.setMode("translate");
      this.transform.showY = false;
      this.transform.showX = true;
      this.transform.showZ = true;
    }
  }

  onPointerDown(event) {
    if (event.button !== 0 || this.transform.dragging) return;
    this.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now() };
  }

  onPointerMove(event) {
    const point = this.intersectGround(event);
    if (point) {
      this.hoverPoint = point;
      this.coords.textContent = `X ${point.x.toFixed(2).replace(".", ",")} · Z ${point.z.toFixed(2).replace(".", ",")}`;
      if (this.tool === "wall" && this.wallStart) this.updateWallPreview(this.wallStart, point, event.shiftKey);
    }
  }

  onPointerUp(event) {
    if (event.button !== 0 || this.transform.dragging) return;
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return;

    if (this.tool === "select") {
      const hit = this.pickEntity(event);
      if (!hit) this.select(null);
      else if (hit.kind === "wall-handle") this.selectWallHandle(hit);
      else this.select(hit);
      return;
    }

    const ground = this.intersectGround(event);
    if (!ground) return;

    if (this.tool === "wall") {
      if (!this.wallStart) {
        this.wallStart = ground;
        this.help.textContent = "Agora clique no ponto final da parede. Segure Shift para forçar linha reta.";
      } else {
        const end = snapAxis(this.wallStart, ground, event.shiftKey);
        if (distance2D(this.wallStart, end) >= .45) {
          this.pushHistory();
          const wall = {
            id: uid("parede"),
            ax: this.wallStart.x,
            az: this.wallStart.z,
            bx: end.x,
            bz: end.z,
            height: 3,
            thickness: .18
          };
          this.blueprint.walls.push(wall);
          this.selected = { kind: "wall", id: wall.id };
          this.wallStart = event.altKey ? end : null;
          saveBlueprint(this.blueprint);
          this.rebuildScene();
          this.renderInspector();
        }
        if (!this.wallStart) this.setTool("select");
      }
      return;
    }

    if (this.tool === "door") {
      const nearest = this.findNearestWall(ground, .85);
      if (!nearest) {
        this.toast("Clique próximo de uma parede.");
        return;
      }
      this.pushHistory();
      const length = wallLength(nearest.wall);
      const width = Math.max(.7, Math.min(1.2, length - .3));
      const halfT = width / 2 / length;
      const door = {
        id: uid("porta"),
        wallId: nearest.wall.id,
        t: THREE.MathUtils.clamp(nearest.t, halfT + .01, 1 - halfT - .01),
        width,
        height: 2.25,
        hinge: "left",
        openAngle: -95,
        label: "Porta"
      };
      this.blueprint.doors.push(door);
      this.selected = { kind: "door", id: door.id };
      saveBlueprint(this.blueprint);
      this.rebuildScene();
      this.renderInspector();
      this.setTool("select");
      return;
    }

    if (EQUIPMENT_TYPES.includes(this.tool)) {
      this.pushHistory();
      const item = {
        id: uid(this.tool),
        type: this.tool,
        x: ground.x,
        z: ground.z,
        rotation: 0,
        ...equipmentDefaults(this.tool, this.blueprint.equipment)
      };
      this.blueprint.equipment.push(item);
      this.selected = { kind: "equipment", id: item.id };
      saveBlueprint(this.blueprint);
      this.rebuildScene();
      this.renderInspector();
      this.setTool("select");
      return;
    }

    if (this.tool === "stairs") {
      this.pushHistory();
      const item = { id: uid("escada"), x: ground.x, z: ground.z, width: 1.5, depth: 3.5, height: 2.8, steps: 12, rotation: 0 };
      this.blueprint.stairs.push(item);
      this.selected = { kind: "stairs", id: item.id };
      saveBlueprint(this.blueprint);
      this.rebuildScene();
      this.renderInspector();
      this.setTool("select");
      return;
    }

    if (this.tool === "spawn") {
      this.pushHistory();
      this.blueprint.spawn.x = ground.x;
      this.blueprint.spawn.z = ground.z;
      this.selected = { kind: "spawn", id: "spawn" };
      saveBlueprint(this.blueprint);
      this.rebuildScene();
      this.renderInspector();
      this.setTool("select");
    }
  }

  intersectGround(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, point)) return null;
    return {
      x: this.snapEnabled ? snap(point.x, this.snapSize) : point.x,
      z: this.snapEnabled ? snap(point.z, this.snapSize) : point.z
    };
  }

  pickEntity(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    for (const hit of hits) {
      let object = hit.object;
      while (object && !object.userData.entity) object = object.parent;
      if (object?.userData?.entity) return object.userData.entity;
    }
    return null;
  }

  select(entity) {
    this.selected = entity ? { kind: entity.kind, id: entity.id } : null;
    this.rebuildScene();
    this.renderInspector();
  }

  selectWallHandle(hit) {
    this.selected = { kind: "wall", id: hit.id, part: hit.part };
    this.rebuildScene();
    const handle = this.endpointHandles.find((item) => item.userData.entity.part === hit.part);
    if (handle) {
      this.transform.attach(handle);
      this.transform.setMode("translate");
      this.transform.showY = false;
      this.transform.userData.wallHandle = { id: hit.id, part: hit.part };
    }
    this.renderInspector();
  }

  syncTransformToBlueprint() {
    const object = this.transform.object;
    if (!object) return;
    const handleInfo = this.transform.userData.wallHandle;
    if (handleInfo) {
      const wall = this.blueprint.walls.find((item) => item.id === handleInfo.id);
      if (!wall) return;
      const x = this.snapEnabled ? snap(object.position.x, this.snapSize) : object.position.x;
      const z = this.snapEnabled ? snap(object.position.z, this.snapSize) : object.position.z;
      object.position.x = x;
      object.position.z = z;
      if (handleInfo.part === "start") { wall.ax = x; wall.az = z; }
      else { wall.bx = x; wall.bz = z; }
      this.selectionHelper?.update();
      return;
    }

    const entity = object.userData.entity;
    if (!entity) return;
    if (entity.kind === "equipment") {
      const item = this.blueprint.equipment.find((entry) => entry.id === entity.id);
      if (!item) return;
      item.x = object.position.x;
      item.z = object.position.z;
      item.rotation = normalizeDegrees(-THREE.MathUtils.radToDeg(object.rotation.y));
    } else if (entity.kind === "stairs") {
      const item = this.blueprint.stairs.find((entry) => entry.id === entity.id);
      if (!item) return;
      item.x = object.position.x;
      item.z = object.position.z;
      item.rotation = normalizeDegrees(-THREE.MathUtils.radToDeg(object.rotation.y));
    } else if (entity.kind === "spawn") {
      this.blueprint.spawn.x = object.position.x;
      this.blueprint.spawn.z = object.position.z;
      this.blueprint.spawn.yaw = normalizeDegrees(-THREE.MathUtils.radToDeg(object.rotation.y));
    } else if (entity.kind === "door") {
      const door = this.blueprint.doors.find((entry) => entry.id === entity.id);
      if (!door) return;
      const nearest = this.findNearestWall({ x: object.position.x, z: object.position.z }, 999, door.wallId);
      if (nearest) door.t = nearest.t;
    }
    this.selectionHelper?.update();
    this.renderInspectorValuesOnly();
  }

  commitTransform() {
    delete this.transform.userData.wallHandle;
    if (this.selected?.kind === "door" || this.selected?.kind === "wall") this.rebuildScene();
    else this.renderInspector();
  }

  updateWallPreview(start, end, forceAxis) {
    this.clearPreview();
    const finish = snapAxis(start, end, forceAxis);
    const dx = finish.x - start.x;
    const dz = finish.z - start.z;
    const length = Math.hypot(dx, dz);
    if (length < .05) return;
    const preview = new THREE.Mesh(
      new THREE.BoxGeometry(length, 3, .18),
      new THREE.MeshStandardMaterial({ color: 0x3f83e8, transparent: true, opacity: .42 })
    );
    preview.position.set((start.x + finish.x) / 2, 1.5, (start.z + finish.z) / 2);
    preview.rotation.y = Math.atan2(-dz, dx);
    this.previewObject = preview;
    this.overlayGroup.add(preview);
  }

  clearPreview() {
    if (!this.previewObject) return;
    this.overlayGroup.remove(this.previewObject);
    this.previewObject.geometry?.dispose();
    this.previewObject.material?.dispose();
    this.previewObject = null;
  }

  findNearestWall(point, maxDistance = .8, requiredWallId = null) {
    let best = null;
    for (const wall of this.blueprint.walls) {
      if (requiredWallId && wall.id !== requiredWallId) continue;
      const result = projectPointOnSegment(point.x, point.z, wall.ax, wall.az, wall.bx, wall.bz);
      if (result.distance <= maxDistance && (!best || result.distance < best.distance)) best = { wall, ...result };
    }
    return best;
  }

  getSelectedData() {
    if (!this.selected) return null;
    if (this.selected.kind === "wall") return this.blueprint.walls.find((item) => item.id === this.selected.id) || null;
    if (this.selected.kind === "door") return this.blueprint.doors.find((item) => item.id === this.selected.id) || null;
    if (this.selected.kind === "equipment") return this.blueprint.equipment.find((item) => item.id === this.selected.id) || null;
    if (this.selected.kind === "stairs") return this.blueprint.stairs.find((item) => item.id === this.selected.id) || null;
    if (this.selected.kind === "spawn") return this.blueprint.spawn;
    return null;
  }

  renderInspector() {
    const selected = this.getSelectedData();
    if (!selected) {
      this.inspector.innerHTML = `
        <div class="badge">Projeto</div>
        ${field("Nome da empresa", "project-name", this.blueprint.name)}
        ${numberField("Largura do piso (m)", "floor-width", this.blueprint.floor.width, .5, 8, 100)}
        ${numberField("Profundidade do piso (m)", "floor-depth", this.blueprint.floor.depth, .5, 8, 100)}
        <label>Cor do piso<input id="floor-color" type="color" value="${this.blueprint.floor.color}" /></label>
        <label class="check-row"><input id="snap-enabled" type="checkbox" ${this.snapEnabled ? "checked" : ""}/> Encaixar na grade</label>
        ${numberField("Passo da grade (m)", "snap-size", this.snapSize, .05, .05, 2)}
        <button id="remove-background" class="secondary full" ${this.backgroundUrl ? "" : "disabled"}>Remover planta de fundo</button>
        <div class="coords">Escolha uma ferramenta à esquerda. Você pode orbitar com o mouse, usar a roda para aproximar e clicar em objetos para editar.</div>
      `;
      this.bindProjectInspector();
      return;
    }

    const kind = this.selected.kind;
    if (kind === "wall") this.renderWallInspector(selected);
    else if (kind === "door") this.renderDoorInspector(selected);
    else if (kind === "equipment") this.renderEquipmentInspector(selected);
    else if (kind === "stairs") this.renderStairsInspector(selected);
    else if (kind === "spawn") this.renderSpawnInspector(selected);
  }

  bindProjectInspector() {
    this.bindInput("project-name", "input", (value) => { this.blueprint.name = String(value).slice(0, 80); });
    this.bindInput("floor-width", "change", (value) => { this.pushHistory(); this.blueprint.floor.width = clamp(value, 8, 100); this.rebuildFloor(); saveBlueprint(this.blueprint); });
    this.bindInput("floor-depth", "change", (value) => { this.pushHistory(); this.blueprint.floor.depth = clamp(value, 8, 100); this.rebuildFloor(); saveBlueprint(this.blueprint); });
    this.bindInput("floor-color", "input", (value) => { this.blueprint.floor.color = value; this.rebuildFloor(); saveBlueprint(this.blueprint); });
    this.inspector.querySelector("#snap-enabled").addEventListener("change", (event) => {
      this.snapEnabled = event.target.checked;
      this.transform.setTranslationSnap(this.snapEnabled ? this.snapSize : null);
    });
    this.bindInput("snap-size", "change", (value) => {
      this.snapSize = clamp(value, .05, 2);
      this.transform.setTranslationSnap(this.snapEnabled ? this.snapSize : null);
      this.rebuildFloor();
    });
    this.inspector.querySelector("#remove-background").addEventListener("click", () => {
      this.backgroundUrl = "";
      localStorage.setItem(BACKGROUND_KEY, "__none__");
      this.rebuildFloor();
      this.renderInspector();
    });
  }

  renderWallInspector(wall) {
    this.inspector.innerHTML = `
      <div class="badge">Parede</div>
      ${numberField("Início X", "wall-ax", wall.ax, .05, -100, 100)}
      ${numberField("Início Z", "wall-az", wall.az, .05, -100, 100)}
      ${numberField("Final X", "wall-bx", wall.bx, .05, -100, 100)}
      ${numberField("Final Z", "wall-bz", wall.bz, .05, -100, 100)}
      ${numberField("Altura (m)", "wall-height", wall.height, .05, 1.8, 8)}
      ${numberField("Espessura (m)", "wall-thickness", wall.thickness, .01, .08, .8)}
      <div class="coords">Comprimento: ${wallLength(wall).toFixed(2)} m. Clique nas esferas azul e laranja para mover as pontas com o manipulador.</div>
      <button id="delete-item" class="danger full">Apagar parede</button>
    `;
    ["ax", "az", "bx", "bz", "height", "thickness"].forEach((property) => this.bindInput(`wall-${property}`, "change", (value) => {
      this.pushHistory(); wall[property] = Number(value); saveBlueprint(this.blueprint); this.rebuildScene(); this.renderInspector();
    }));
    this.inspector.querySelector("#delete-item").addEventListener("click", () => this.deleteSelected());
  }

  renderDoorInspector(door) {
    this.inspector.innerHTML = `
      <div class="badge">Porta</div>
      ${field("Nome", "door-label", door.label)}
      ${numberField("Posição na parede (%)", "door-t", Math.round(door.t * 100), 1, 1, 99)}
      ${numberField("Largura (m)", "door-width", door.width, .05, .65, 3.5)}
      ${numberField("Altura (m)", "door-height", door.height, .05, 1.8, 3.2)}
      <label>Dobradiça<select id="door-hinge"><option value="left" ${door.hinge === "left" ? "selected" : ""}>Esquerda</option><option value="right" ${door.hinge === "right" ? "selected" : ""}>Direita</option></select></label>
      ${numberField("Ângulo de abertura", "door-angle", door.openAngle, 5, -160, 160)}
      <div class="coords">A porta pertence à parede. No modo de jogo, o vão é criado automaticamente.</div>
      <button id="delete-item" class="danger full">Apagar porta</button>
    `;
    this.bindInput("door-label", "input", (value) => { door.label = String(value).slice(0, 60); });
    this.bindInput("door-t", "change", (value) => { this.pushHistory(); door.t = clamp(value / 100, .02, .98); saveBlueprint(this.blueprint); this.rebuildScene(); this.renderInspector(); });
    for (const property of ["width", "height"]) this.bindInput(`door-${property}`, "change", (value) => { this.pushHistory(); door[property] = Number(value); saveBlueprint(this.blueprint); this.rebuildScene(); this.renderInspector(); });
    this.inspector.querySelector("#door-hinge").addEventListener("change", (event) => { this.pushHistory(); door.hinge = event.target.value; saveBlueprint(this.blueprint); });
    this.bindInput("door-angle", "change", (value) => { this.pushHistory(); door.openAngle = Number(value); saveBlueprint(this.blueprint); });
    this.inspector.querySelector("#delete-item").addEventListener("click", () => this.deleteSelected());
  }

  renderEquipmentInspector(item) {
    this.inspector.innerHTML = `
      <div class="badge">${typeLabel(item.type)}</div>
      ${field("Nome", "eq-name", item.name)}
      ${field("Setor", "eq-sector", item.sector)}
      ${field("IP", "eq-ip", item.ip)}
      ${field("Switch", "eq-switch", item.switch)}
      ${field("Porta do switch", "eq-port", item.port)}
      ${numberField("X", "eq-x", item.x, .05, -100, 100)}
      ${numberField("Z", "eq-z", item.z, .05, -100, 100)}
      ${numberField("Rotação", "eq-rotation", item.rotation, 5, -360, 360)}
      <button id="duplicate-item" class="secondary full">Duplicar</button>
      <button id="delete-item" class="danger full inspector-gap">Apagar equipamento</button>
    `;
    for (const [id, property] of [["eq-name", "name"], ["eq-sector", "sector"], ["eq-ip", "ip"], ["eq-switch", "switch"], ["eq-port", "port"]]) {
      this.bindInput(id, "input", (value) => { item[property] = String(value).slice(0, 80); saveBlueprint(this.blueprint); });
    }
    for (const property of ["x", "z", "rotation"]) this.bindInput(`eq-${property}`, "change", (value) => { this.pushHistory(); item[property] = Number(value); saveBlueprint(this.blueprint); this.rebuildScene(); this.renderInspector(); });
    this.inspector.querySelector("#duplicate-item").addEventListener("click", () => this.duplicateSelected());
    this.inspector.querySelector("#delete-item").addEventListener("click", () => this.deleteSelected());
  }

  renderStairsInspector(item) {
    this.inspector.innerHTML = `
      <div class="badge">Escada</div>
      ${numberField("X", "stairs-x", item.x, .05, -100, 100)}
      ${numberField("Z", "stairs-z", item.z, .05, -100, 100)}
      ${numberField("Largura", "stairs-width", item.width, .05, .8, 5)}
      ${numberField("Comprimento", "stairs-depth", item.depth, .05, 1.5, 10)}
      ${numberField("Altura", "stairs-height", item.height, .05, 1, 6)}
      ${numberField("Degraus", "stairs-steps", item.steps, 1, 3, 30)}
      ${numberField("Rotação", "stairs-rotation", item.rotation, 5, -360, 360)}
      <button id="delete-item" class="danger full">Apagar escada</button>
    `;
    for (const property of ["x", "z", "width", "depth", "height", "steps", "rotation"]) this.bindInput(`stairs-${property}`, "change", (value) => { this.pushHistory(); item[property] = property === "steps" ? Math.round(value) : Number(value); saveBlueprint(this.blueprint); this.rebuildScene(); this.renderInspector(); });
    this.inspector.querySelector("#delete-item").addEventListener("click", () => this.deleteSelected());
  }

  renderSpawnInspector(spawn) {
    this.inspector.innerHTML = `
      <div class="badge">Início da visita</div>
      ${numberField("X", "spawn-x", spawn.x, .05, -100, 100)}
      ${numberField("Z", "spawn-z", spawn.z, .05, -100, 100)}
      ${numberField("Direção", "spawn-yaw", spawn.yaw, 5, -360, 360)}
      <div class="coords">Este é o ponto em que o visitante começa no modo de jogo.</div>
    `;
    for (const property of ["x", "z", "yaw"]) this.bindInput(`spawn-${property}`, "change", (value) => { this.pushHistory(); spawn[property] = Number(value); saveBlueprint(this.blueprint); this.rebuildScene(); this.renderInspector(); });
  }

  renderInspectorValuesOnly() {
    const selected = this.getSelectedData();
    if (!selected) return;
    const map = this.selected.kind === "equipment" ? { "eq-x": selected.x, "eq-z": selected.z, "eq-rotation": selected.rotation }
      : this.selected.kind === "stairs" ? { "stairs-x": selected.x, "stairs-z": selected.z, "stairs-rotation": selected.rotation }
      : this.selected.kind === "spawn" ? { "spawn-x": selected.x, "spawn-z": selected.z, "spawn-yaw": selected.yaw }
      : {};
    for (const [id, value] of Object.entries(map)) {
      const input = this.inspector.querySelector(`#${id}`);
      if (input && document.activeElement !== input) input.value = Number(value).toFixed(2);
    }
  }

  bindInput(id, eventName, callback) {
    const input = this.inspector.querySelector(`#${id}`);
    input?.addEventListener(eventName, (event) => callback(event.target.type === "number" ? Number(event.target.value) : event.target.value));
  }

  duplicateSelected() {
    const selected = this.getSelectedData();
    if (!selected || !["equipment", "stairs"].includes(this.selected.kind)) return;
    this.pushHistory();
    const copy = deepClone(selected);
    copy.id = uid(this.selected.kind === "equipment" ? copy.type : "escada");
    copy.x += .75;
    copy.z += .75;
    if (this.selected.kind === "equipment") this.blueprint.equipment.push(copy);
    else this.blueprint.stairs.push(copy);
    this.selected = { kind: this.selected.kind, id: copy.id };
    saveBlueprint(this.blueprint);
    this.rebuildScene();
    this.renderInspector();
  }

  deleteSelected() {
    if (!this.selected) return;
    this.pushHistory();
    const { kind, id } = this.selected;
    if (kind === "wall") {
      this.blueprint.walls = this.blueprint.walls.filter((item) => item.id !== id);
      this.blueprint.doors = this.blueprint.doors.filter((item) => item.wallId !== id);
    } else if (kind === "door") this.blueprint.doors = this.blueprint.doors.filter((item) => item.id !== id);
    else if (kind === "equipment") this.blueprint.equipment = this.blueprint.equipment.filter((item) => item.id !== id);
    else if (kind === "stairs") this.blueprint.stairs = this.blueprint.stairs.filter((item) => item.id !== id);
    else return;
    this.selected = null;
    saveBlueprint(this.blueprint);
    this.rebuildScene();
    this.renderInspector();
  }

  resize() {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate = () => {
    if (this.destroyed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    this.controls.update();
    this.selectionHelper?.update();
    this.renderer.render(this.scene, this.camera);
  };

  toast(message) { this.options.onToast?.(message); }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    window.removeEventListener("keydown", this.keyHandler);
    this.renderer.domElement.removeEventListener("pointerdown", this.canvasPointerDown);
    this.renderer.domElement.removeEventListener("pointermove", this.canvasPointerMove);
    this.renderer.domElement.removeEventListener("pointerup", this.canvasPointerUp);
    this.transform.detach();
    this.renderer.dispose();
    disposeGroup(this.floorGroup);
    disposeGroup(this.worldGroup);
    disposeGroup(this.overlayGroup);
    this.root.innerHTML = "";
  }
}

function createEquipmentModel(type) {
  const group = new THREE.Group();
  const box = (w, h, d, color, x = 0, y = h / 2, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .72 }));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  if (type === "pc") {
    box(1.15, .74, .62, 0x80684b);
    box(.65, .46, .10, 0x253039, 0, 1.10, -.16);
    box(.08, .28, .08, 0x555b5d, 0, .85, -.16);
  } else if (type === "switch") {
    box(1.05, .24, .55, 0x30434d, 0, .65, 0);
    for (let i = 0; i < 8; i += 1) box(.07, .07, .02, 0x7fb789, -.36 + i * .105, .65, -.29);
  } else if (type === "point") {
    box(.28, .28, .08, 0x2671cb, 0, .55, 0);
  } else if (type === "printer") {
    box(.7, .55, .55, 0x706886, 0, .48, 0);
    box(.52, .08, .38, 0xdedede, 0, .79, 0);
  } else if (type === "router") {
    box(.72, .14, .48, 0x4c8061, 0, .75, 0);
    box(.035, .7, .035, 0x222927, -.25, 1.05, .12);
    box(.035, .7, .035, 0x222927, .25, 1.05, .12);
  } else if (type === "server") {
    box(.80, 2.0, .75, 0x4d5357, 0, 1, 0);
    for (let i = 0; i < 5; i += 1) box(.62, .05, .02, 0x99b29f, 0, .35 + i * .32, -.39);
  } else {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.33, .33, .12, 24), new THREE.MeshStandardMaterial({ color: 0xb77e42, roughness: .62 }));
    mesh.position.y = 2.5;
    group.add(mesh);
  }
  return group;
}

function equipmentDefaults(type, equipment) {
  const number = equipment.filter((item) => item.type === type).length + 1;
  const labels = {
    pc: "PC",
    switch: "SW",
    point: "PTR",
    printer: "IMP",
    router: "RTR",
    server: "SRV",
    "access-point": "AP"
  };
  return {
    name: `${labels[type] || "EQ"}-${String(number).padStart(2, "0")}`,
    sector: "Não informado",
    ip: "Não informado",
    switch: type === "switch" ? "Switch principal" : "Não informado",
    port: type === "switch" ? "24 portas" : "Não informado"
  };
}

function typeLabel(type) {
  return ({ pc: "Computador", switch: "Switch", point: "Ponto de rede", printer: "Impressora", router: "Roteador", server: "Servidor", "access-point": "Access point" })[type] || "Equipamento";
}

function helpForTool(tool) {
  return ({
    select: "Clique em um objeto para selecioná-lo. Use o manipulador para mover ou girar.",
    wall: "Clique no início e depois no fim da parede. Shift força horizontal ou vertical. Alt continua desenhando.",
    door: "Clique próximo de uma parede para inserir uma porta e abrir o vão automaticamente.",
    stairs: "Clique sobre o piso para colocar uma escada.",
    spawn: "Clique no piso para definir onde os visitantes começam.",
    pc: "Clique no piso para colocar um computador.",
    switch: "Clique no piso para colocar um switch.",
    point: "Clique no piso para colocar um ponto de rede.",
    printer: "Clique no piso para colocar uma impressora.",
    router: "Clique no piso para colocar um roteador.",
    server: "Clique no piso para colocar um servidor.",
    "access-point": "Clique no piso para colocar um access point."
  })[tool] || "Clique no piso para inserir o objeto.";
}

function field(label, id, value) {
  return `<label>${label}<input id="${id}" value="${escapeHtml(value)}" /></label>`;
}

function numberField(label, id, value, step, min, max) {
  return `<label>${label}<input id="${id}" type="number" value="${Number(value)}" step="${step}" min="${min}" max="${max}" /></label>`;
}

function disposeGroup(group) {
  if (!group) return;
  while (group.children.length) {
    const object = group.children.pop();
    object.traverse?.((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
      else child.material?.dispose?.();
    });
  }
}

function keyOf(kind, id) { return `${kind}:${id}`; }
function wallLength(wall) { return Math.hypot(wall.bx - wall.ax, wall.bz - wall.az); }
function snap(value, step) { return Math.round(value / step) * step; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value))); }
function normalizeDegrees(value) { let result = value % 360; if (result > 180) result -= 360; if (result < -180) result += 360; return Math.round(result * 100) / 100; }
function distance2D(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
function snapAxis(start, end, force) {
  if (!force) return end;
  const dx = Math.abs(end.x - start.x);
  const dz = Math.abs(end.z - start.z);
  return dx >= dz ? { x: end.x, z: start.z } : { x: start.x, z: end.z };
}
function projectPointOnSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz || 1;
  const t = THREE.MathUtils.clamp(((px - ax) * dx + (pz - az) * dz) / lengthSq, 0, 1);
  const x = ax + dx * t;
  const z = az + dz * t;
  return { t, x, z, distance: Math.hypot(px - x, pz - z) };
}
function isEditingField() { return ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName); }
function escapeHtml(value) { return String(value ?? "").replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]); }

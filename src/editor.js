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

const SNAP_DEFAULT = 0.25;
const EQUIPMENT_TYPES = new Set(["pc", "switch", "point", "printer", "router", "server", "access-point"]);

export class Builder {
  constructor(root, options = {}) {
    this.root = root;
    this.options = options;
    this.blueprint = normalizeBlueprint(options.blueprint || createDefaultBlueprint());
    this.tool = "select";
    this.transformMode = "translate";
    this.snapEnabled = true;
    this.snapSize = SNAP_DEFAULT;
    this.wallStart = null;
    this.selected = null;
    this.objectByKey = new Map();
    this.pickables = [];
    this.destroyed = false;
    this.backgroundUrl = localStorage.getItem(BACKGROUND_KEY) || "";
    this.pointerDown = null;

    try {
      this.renderShell();
      this.initThree();
      // A animação começa antes das ferramentas. Assim o piso não fica invisível
      // caso algum controle secundário apresente erro.
      this.animate();
      this.bindEvents();
      this.rebuildScene();
      this.renderInspector();
    } catch (error) {
      console.error("Falha ao iniciar o construtor 3D:", error);
      this.showFatalError(error);
    }
  }

  renderShell() {
    this.root.innerHTML = `
      <section class="builder-shell builder-3d">
        <header class="builder-topbar">
          <div class="builder-title">
            <strong>Construtor 3D</strong>
            <span class="muted">Crie paredes e equipamentos diretamente sobre o piso.</span>
          </div>
          <div class="top-actions">
            <button data-action="home" class="secondary">Início</button>
            <button data-action="new" class="secondary">Nova</button>
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
            <div class="viewport-help" id="viewport-help">Selecione Parede e clique duas vezes sobre a grade.</div>
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
    return `<button class="tool-button ${tool === "select" ? "active" : ""}" data-tool="${tool}" title="${label}"><span>${icon}</span><small>${label}</small></button>`;
  }

  initThree() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbcc5c7);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.05, 300);
    this.camera.position.set(18, 17, 20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "default" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.setClearColor(0xbcc5c7, 1);
    this.renderer.domElement.style.position = "absolute";
    this.renderer.domElement.style.inset = "0";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.mount.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 0);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 110;

    this.transform = new TransformControls(this.camera, this.renderer.domElement);
    const helper = this.transform.getHelper?.() || this.transform;
    this.scene.add(helper);
    this.transform.setMode(this.transformMode);
    this.transform.setTranslationSnap(this.snapSize);
    this.transform.setRotationSnap(THREE.MathUtils.degToRad(15));
    this.transform.addEventListener("dragging-changed", (event) => {
      this.controls.enabled = !event.value;
      if (!event.value) {
        this.syncSelectedTransform();
        saveBlueprint(this.blueprint);
        this.renderInspector();
      }
    });
    this.transform.addEventListener("objectChange", () => this.syncSelectedTransform(false));

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x566068, 1.8));
    const sun = new THREE.DirectionalLight(0xfff1c7, 2.3);
    sun.position.set(-18, 28, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(sun);

    this.floorGroup = new THREE.Group();
    this.worldGroup = new THREE.Group();
    this.scene.add(this.floorGroup, this.worldGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // Piso de emergência: aparece mesmo antes de carregar o projeto.
    const fallback = new THREE.Mesh(
      new THREE.PlaneGeometry(32, 24),
      new THREE.MeshBasicMaterial({ color: 0xc8c1a8, side: THREE.DoubleSide })
    );
    fallback.rotation.x = -Math.PI / 2;
    fallback.userData.ground = true;
    this.floorGroup.add(fallback);
    const fallbackGrid = new THREE.GridHelper(32, 64, 0x4f5550, 0x858b84);
    fallbackGrid.position.y = 0.02;
    this.floorGroup.add(fallbackGrid);

    this.resize = this.resize.bind(this);
    window.addEventListener("resize", this.resize);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(this.mount);
    requestAnimationFrame(this.resize);
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

    this.root.querySelector("[data-action='home']")?.addEventListener("click", () => this.options.onBack?.());
    this.root.querySelector("[data-action='new']")?.addEventListener("click", () => this.newBlueprint());
    this.root.querySelector("[data-action='save']")?.addEventListener("click", () => {
      saveBlueprint(this.blueprint);
      this.toast("Projeto salvo neste navegador.");
    });
    this.root.querySelector("[data-action='export']")?.addEventListener("click", () => downloadBlueprint(this.blueprint));
    this.root.querySelector("[data-action='play']")?.addEventListener("click", () => {
      saveBlueprint(this.blueprint);
      this.options.onPlay?.(deepClone(this.blueprint));
    });
    this.root.querySelector("[data-action='publish']")?.addEventListener("click", () => {
      saveBlueprint(this.blueprint);
      this.options.onPublish?.(deepClone(this.blueprint));
    });
    this.root.querySelector("[data-action='duplicate']")?.addEventListener("click", () => this.duplicateSelected());
    this.root.querySelector("[data-action='delete']")?.addEventListener("click", () => this.deleteSelected());

    const importInput = this.root.querySelector("#builder-import");
    this.root.querySelector("[data-action='import']")?.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", async () => {
      const file = importInput.files?.[0];
      if (!file) return;
      try {
        this.blueprint = await readBlueprintFile(file);
        this.selected = null;
        saveBlueprint(this.blueprint);
        this.rebuildScene();
        this.renderInspector();
      } catch (error) {
        alert("O arquivo selecionado não é um projeto válido.");
      }
      importInput.value = "";
    });

    const backgroundInput = this.root.querySelector("#builder-background");
    this.root.querySelector("[data-action='background']")?.addEventListener("click", () => backgroundInput.click());
    backgroundInput.addEventListener("change", () => this.importBackground(backgroundInput));

    this.canvasPointerDown = (event) => {
      if (event.button !== 0 || this.transform.dragging) return;
      this.pointerDown = { x: event.clientX, y: event.clientY };
    };
    this.canvasPointerMove = (event) => this.onPointerMove(event);
    this.canvasPointerUp = (event) => this.onPointerUp(event);
    this.renderer.domElement.addEventListener("pointerdown", this.canvasPointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.canvasPointerMove);
    this.renderer.domElement.addEventListener("pointerup", this.canvasPointerUp);
    this.renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  rebuildScene() {
    this.transform.detach();
    disposeGroup(this.floorGroup);
    disposeGroup(this.worldGroup);
    this.objectByKey.clear();
    this.pickables = [];
    this.buildFloor();
    this.blueprint.walls.forEach((wall) => this.buildWall(wall));
    this.blueprint.stairs.forEach((stairs) => this.buildStairs(stairs));
    this.blueprint.equipment.forEach((item) => this.buildEquipment(item));
    this.buildSpawn();
    this.attachTransformForSelection();
    this.resize();
  }

  buildFloor() {
    const width = this.blueprint.floor.width;
    const depth = this.blueprint.floor.depth;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ color: this.blueprint.floor.color, roughness: 0.94, side: THREE.DoubleSide })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.userData.ground = true;
    this.floorMesh = floor;
    this.floorGroup.add(floor);

    if (this.backgroundUrl) {
      new THREE.TextureLoader().load(
        this.backgroundUrl,
        (texture) => {
          if (this.destroyed) return;
          texture.colorSpace = THREE.SRGBColorSpace;
          const reference = new THREE.Mesh(
            new THREE.PlaneGeometry(width, depth),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide })
          );
          reference.rotation.x = -Math.PI / 2;
          reference.position.y = 0.012;
          this.floorGroup.add(reference);
        },
        undefined,
        () => console.warn("Não foi possível carregar a planta de referência.")
      );
    }

    const size = Math.max(width, depth);
    const divisions = Math.max(16, Math.round(size / this.snapSize));
    const grid = new THREE.GridHelper(size, divisions, 0x535953, 0x8b9189);
    grid.position.y = 0.028;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    this.floorGroup.add(grid);
  }

  buildWall(wall) {
    const dx = wall.bx - wall.ax;
    const dz = wall.bz - wall.az;
    const length = Math.hypot(dx, dz);
    if (length < 0.05) return;
    const ux = dx / length;
    const uz = dz / length;
    const angle = Math.atan2(-dz, dx);
    const group = new THREE.Group();
    group.userData.entity = { kind: "wall", id: wall.id };

    const doors = this.blueprint.doors
      .filter((door) => door.wallId === wall.id)
      .map((door) => ({ door, center: clamp(door.t, 0.02, 0.98) * length }))
      .sort((a, b) => a.center - b.center);

    let cursor = 0;
    for (const entry of doors) {
      const half = Math.min(entry.door.width / 2, Math.max(0.1, length / 2 - 0.04));
      const start = Math.max(cursor, entry.center - half);
      const end = Math.min(length, entry.center + half);
      if (start > cursor + 0.02) this.createWallSegment(group, wall, cursor, start, ux, uz, angle, wall.height, wall.height / 2);
      if (wall.height > entry.door.height + 0.04) {
        this.createWallSegment(group, wall, start, end, ux, uz, angle, wall.height - entry.door.height, entry.door.height + (wall.height - entry.door.height) / 2);
      }
      this.createDoor(group, wall, entry.door, entry.center, ux, uz, angle);
      cursor = Math.max(cursor, end);
    }
    if (cursor < length - 0.02) this.createWallSegment(group, wall, cursor, length, ux, uz, angle, wall.height, wall.height / 2);

    this.worldGroup.add(group);
    this.objectByKey.set(keyOf("wall", wall.id), group);
  }

  createWallSegment(group, wall, start, end, ux, uz, angle, height, y) {
    const segmentLength = end - start;
    if (segmentLength <= 0.02) return;
    const mid = (start + end) / 2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(segmentLength, height, wall.thickness),
      new THREE.MeshStandardMaterial({ color: 0xc7bd8c, roughness: 0.88 })
    );
    mesh.position.set(wall.ax + ux * mid, y, wall.az + uz * mid);
    mesh.rotation.y = angle;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.entity = { kind: "wall", id: wall.id };
    group.add(mesh);
    this.pickables.push(mesh);
  }

  createDoor(group, wall, door, center, ux, uz, angle) {
    const root = new THREE.Group();
    root.position.set(wall.ax + ux * center, 0, wall.az + uz * center);
    root.rotation.y = angle;
    root.userData.entity = { kind: "door", id: door.id };

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(door.width, door.height, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x755335, roughness: 0.78 })
    );
    panel.position.y = door.height / 2;
    panel.castShadow = true;
    panel.userData.entity = { kind: "door", id: door.id };
    root.add(panel);
    group.add(root);
    this.pickables.push(panel);
    this.objectByKey.set(keyOf("door", door.id), root);
  }

  buildEquipment(item) {
    const root = createEquipmentModel(item.type);
    root.position.set(item.x, 0, item.z);
    root.rotation.y = THREE.MathUtils.degToRad(-item.rotation);
    root.userData.entity = { kind: "equipment", id: item.id };
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
      child.userData.entity = { kind: "equipment", id: item.id };
      this.pickables.push(child);
    });
    this.worldGroup.add(root);
    this.objectByKey.set(keyOf("equipment", item.id), root);
  }

  buildStairs(item) {
    const root = new THREE.Group();
    root.position.set(item.x, 0, item.z);
    root.rotation.y = THREE.MathUtils.degToRad(-item.rotation);
    root.userData.entity = { kind: "stairs", id: item.id };
    const stepDepth = item.depth / item.steps;
    const stepHeight = item.height / item.steps;
    for (let i = 0; i < item.steps; i += 1) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(item.width, stepHeight * (i + 1), stepDepth),
        new THREE.MeshStandardMaterial({ color: i % 2 ? 0x898a84 : 0x989990, roughness: 0.94 })
      );
      mesh.position.set(0, stepHeight * (i + 1) / 2, -item.depth / 2 + stepDepth * (i + 0.5));
      mesh.userData.entity = { kind: "stairs", id: item.id };
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
      this.pickables.push(mesh);
    }
    this.worldGroup.add(root);
    this.objectByKey.set(keyOf("stairs", item.id), root);
  }

  buildSpawn() {
    const root = new THREE.Group();
    root.position.set(this.blueprint.spawn.x, 0, this.blueprint.spawn.z);
    root.rotation.y = THREE.MathUtils.degToRad(-this.blueprint.spawn.yaw);
    root.userData.entity = { kind: "spawn", id: "spawn" };
    const marker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: 0xe2c94e })
    );
    marker.position.y = 0.05;
    marker.userData.entity = { kind: "spawn", id: "spawn" };
    root.add(marker);
    this.pickables.push(marker);
    this.worldGroup.add(root);
    this.objectByKey.set(keyOf("spawn", "spawn"), root);
  }

  setTool(tool) {
    this.tool = tool;
    this.wallStart = null;
    this.root.querySelectorAll("[data-tool]").forEach((button) => button.classList.toggle("active", button.dataset.tool === tool));
    this.help.textContent = helpForTool(tool);
    this.renderer.domElement.style.cursor = tool === "select" ? "default" : "crosshair";
    if (tool !== "select") this.transform.detach();
    else this.attachTransformForSelection();
  }

  setTransformMode(mode) {
    this.transformMode = mode;
    this.transform.setMode(mode);
    this.root.querySelectorAll("[data-mode]").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  }

  setView(view) {
    const size = Math.max(this.blueprint.floor.width, this.blueprint.floor.depth);
    if (view === "top") this.camera.position.set(0.001, size * 1.15, 0.001);
    else this.camera.position.set(size * 0.65, size * 0.58, size * 0.72);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
    this.root.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  }

  onPointerMove(event) {
    const point = this.intersectGround(event);
    if (!point) return;
    this.coords.textContent = `X ${point.x.toFixed(2).replace(".", ",")} · Z ${point.z.toFixed(2).replace(".", ",")}`;
  }

  onPointerUp(event) {
    if (event.button !== 0 || this.transform.dragging) return;
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 7) return;

    if (this.tool === "select") {
      this.select(this.pickEntity(event));
      return;
    }

    const point = this.intersectGround(event);
    if (!point) return;
    point.x = this.snap(point.x);
    point.z = this.snap(point.z);

    if (this.tool === "wall") {
      if (!this.wallStart) {
        this.wallStart = { x: point.x, z: point.z };
        this.help.textContent = "Primeiro ponto marcado. Clique no final da parede.";
      } else {
        const distance = Math.hypot(point.x - this.wallStart.x, point.z - this.wallStart.z);
        if (distance >= 0.25) {
          this.blueprint.walls.push({
            id: uid("parede"),
            ax: this.wallStart.x,
            az: this.wallStart.z,
            bx: point.x,
            bz: point.z,
            height: 3,
            thickness: 0.18
          });
          saveBlueprint(this.blueprint);
          this.rebuildScene();
        }
        this.wallStart = null;
        this.help.textContent = "Parede criada. Clique para iniciar outra.";
      }
      return;
    }

    if (this.tool === "door") {
      const nearest = this.findNearestWall(point, 1.5);
      if (!nearest) {
        this.toast("Crie uma parede e clique perto dela para inserir a porta.");
        return;
      }
      const door = {
        id: uid("porta"),
        wallId: nearest.wall.id,
        t: clamp(nearest.t, 0.06, 0.94),
        width: 1.1,
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

    if (EQUIPMENT_TYPES.has(this.tool)) {
      const item = {
        id: uid(this.tool),
        type: this.tool,
        x: point.x,
        z: point.z,
        rotation: 0,
        name: typeLabel(this.tool),
        sector: "Não informado",
        ip: "Não informado",
        switch: "Não informado",
        port: "Não informado"
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
      const item = { id: uid("escada"), x: point.x, z: point.z, width: 1.5, depth: 3.5, height: 2.8, steps: 12, rotation: 0 };
      this.blueprint.stairs.push(item);
      this.selected = { kind: "stairs", id: item.id };
      saveBlueprint(this.blueprint);
      this.rebuildScene();
      this.renderInspector();
      this.setTool("select");
      return;
    }

    if (this.tool === "spawn") {
      this.blueprint.spawn.x = point.x;
      this.blueprint.spawn.z = point.z;
      this.selected = { kind: "spawn", id: "spawn" };
      saveBlueprint(this.blueprint);
      this.rebuildScene();
      this.renderInspector();
      this.setTool("select");
    }
  }

  intersectGround(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const point = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, point) ? point : null;
  }

  pickEntity(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    return hit?.object?.userData?.entity || null;
  }

  select(entity) {
    this.selected = entity ? { kind: entity.kind, id: entity.id } : null;
    this.attachTransformForSelection();
    this.renderInspector();
  }

  attachTransformForSelection() {
    this.transform.detach();
    if (!this.selected) return;
    if (!["equipment", "stairs", "spawn"].includes(this.selected.kind)) return;
    const object = this.objectByKey.get(keyOf(this.selected.kind, this.selected.id));
    if (!object) return;
    this.transform.attach(object);
    this.transform.setMode(this.transformMode);
    this.transform.showY = false;
  }

  syncSelectedTransform(rebuild = false) {
    if (!this.selected) return;
    const object = this.objectByKey.get(keyOf(this.selected.kind, this.selected.id));
    if (!object) return;
    if (this.selected.kind === "equipment") {
      const item = this.blueprint.equipment.find((entry) => entry.id === this.selected.id);
      if (!item) return;
      item.x = this.snap(object.position.x);
      item.z = this.snap(object.position.z);
      item.rotation = normalizeDegrees(-THREE.MathUtils.radToDeg(object.rotation.y));
    } else if (this.selected.kind === "stairs") {
      const item = this.blueprint.stairs.find((entry) => entry.id === this.selected.id);
      if (!item) return;
      item.x = this.snap(object.position.x);
      item.z = this.snap(object.position.z);
      item.rotation = normalizeDegrees(-THREE.MathUtils.radToDeg(object.rotation.y));
    } else if (this.selected.kind === "spawn") {
      this.blueprint.spawn.x = this.snap(object.position.x);
      this.blueprint.spawn.z = this.snap(object.position.z);
      this.blueprint.spawn.yaw = normalizeDegrees(-THREE.MathUtils.radToDeg(object.rotation.y));
    }
    if (rebuild) this.rebuildScene();
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
    const data = this.getSelectedData();
    if (!data) {
      this.inspector.innerHTML = `
        <div class="badge">Projeto</div>
        ${field("Nome da empresa", "project-name", this.blueprint.name)}
        ${numberField("Largura do piso", "floor-width", this.blueprint.floor.width, 0.5)}
        ${numberField("Profundidade do piso", "floor-depth", this.blueprint.floor.depth, 0.5)}
        <label>Cor do piso<input id="floor-color" type="color" value="${escapeHtml(this.blueprint.floor.color)}" /></label>
        <label class="check-row"><input id="snap-enabled" type="checkbox" ${this.snapEnabled ? "checked" : ""}/> Encaixar na grade</label>
        ${numberField("Passo da grade", "snap-size", this.snapSize, 0.05)}
        <button id="remove-background" class="secondary full" ${this.backgroundUrl ? "" : "disabled"}>Remover planta de fundo</button>
        <div class="coords">O piso deve estar visível no centro. Para criar uma parede, escolha Parede e clique no início e no final.</div>
      `;
      this.bindInput("project-name", "input", (value) => { this.blueprint.name = String(value).slice(0, 80); saveBlueprint(this.blueprint); });
      this.bindInput("floor-width", "change", (value) => { this.blueprint.floor.width = clamp(value, 8, 100); saveBlueprint(this.blueprint); this.rebuildScene(); });
      this.bindInput("floor-depth", "change", (value) => { this.blueprint.floor.depth = clamp(value, 8, 100); saveBlueprint(this.blueprint); this.rebuildScene(); });
      this.bindInput("floor-color", "input", (value) => { this.blueprint.floor.color = value; saveBlueprint(this.blueprint); this.rebuildScene(); });
      this.inspector.querySelector("#snap-enabled")?.addEventListener("change", (event) => {
        this.snapEnabled = event.target.checked;
        this.transform.setTranslationSnap(this.snapEnabled ? this.snapSize : null);
      });
      this.bindInput("snap-size", "change", (value) => {
        this.snapSize = clamp(value, 0.05, 2);
        this.transform.setTranslationSnap(this.snapEnabled ? this.snapSize : null);
        this.rebuildScene();
      });
      this.inspector.querySelector("#remove-background")?.addEventListener("click", () => {
        this.backgroundUrl = "";
        localStorage.removeItem(BACKGROUND_KEY);
        this.rebuildScene();
        this.renderInspector();
      });
      return;
    }

    if (this.selected.kind === "wall") this.renderWallInspector(data);
    else if (this.selected.kind === "door") this.renderDoorInspector(data);
    else if (this.selected.kind === "equipment") this.renderEquipmentInspector(data);
    else if (this.selected.kind === "stairs") this.renderStairsInspector(data);
    else this.renderSpawnInspector(data);
  }

  renderWallInspector(wall) {
    this.inspector.innerHTML = `
      <div class="badge">Parede</div>
      ${numberField("Início X", "wall-ax", wall.ax, 0.05)}
      ${numberField("Início Z", "wall-az", wall.az, 0.05)}
      ${numberField("Final X", "wall-bx", wall.bx, 0.05)}
      ${numberField("Final Z", "wall-bz", wall.bz, 0.05)}
      ${numberField("Altura", "wall-height", wall.height, 0.05)}
      ${numberField("Espessura", "wall-thickness", wall.thickness, 0.01)}
      <button id="delete-item" class="danger full">Apagar parede</button>
    `;
    for (const property of ["ax", "az", "bx", "bz", "height", "thickness"]) {
      this.bindInput(`wall-${property}`, "change", (value) => { wall[property] = Number(value); saveBlueprint(this.blueprint); this.rebuildScene(); });
    }
    this.inspector.querySelector("#delete-item")?.addEventListener("click", () => this.deleteSelected());
  }

  renderDoorInspector(door) {
    this.inspector.innerHTML = `
      <div class="badge">Porta</div>
      ${field("Nome", "door-label", door.label)}
      ${numberField("Posição na parede (%)", "door-t", Math.round(door.t * 100), 1)}
      ${numberField("Largura", "door-width", door.width, 0.05)}
      ${numberField("Altura", "door-height", door.height, 0.05)}
      <label>Dobradiça<select id="door-hinge"><option value="left" ${door.hinge === "left" ? "selected" : ""}>Esquerda</option><option value="right" ${door.hinge === "right" ? "selected" : ""}>Direita</option></select></label>
      ${numberField("Ângulo de abertura", "door-angle", door.openAngle, 5)}
      <button id="delete-item" class="danger full">Apagar porta</button>
    `;
    this.bindInput("door-label", "input", (value) => { door.label = String(value).slice(0, 60); saveBlueprint(this.blueprint); });
    this.bindInput("door-t", "change", (value) => { door.t = clamp(value / 100, 0.02, 0.98); saveBlueprint(this.blueprint); this.rebuildScene(); });
    this.bindInput("door-width", "change", (value) => { door.width = clamp(value, 0.65, 3.5); saveBlueprint(this.blueprint); this.rebuildScene(); });
    this.bindInput("door-height", "change", (value) => { door.height = clamp(value, 1.8, 3.2); saveBlueprint(this.blueprint); this.rebuildScene(); });
    this.bindInput("door-angle", "change", (value) => { door.openAngle = clamp(value, -160, 160); saveBlueprint(this.blueprint); });
    this.inspector.querySelector("#door-hinge")?.addEventListener("change", (event) => { door.hinge = event.target.value; saveBlueprint(this.blueprint); });
    this.inspector.querySelector("#delete-item")?.addEventListener("click", () => this.deleteSelected());
  }

  renderEquipmentInspector(item) {
    this.inspector.innerHTML = `
      <div class="badge">${escapeHtml(typeLabel(item.type))}</div>
      ${field("Nome", "eq-name", item.name)}
      ${field("Setor", "eq-sector", item.sector)}
      ${field("IP", "eq-ip", item.ip)}
      ${field("Switch", "eq-switch", item.switch)}
      ${field("Porta do switch", "eq-port", item.port)}
      ${numberField("X", "eq-x", item.x, 0.05)}
      ${numberField("Z", "eq-z", item.z, 0.05)}
      ${numberField("Rotação", "eq-rotation", item.rotation, 5)}
      <button id="delete-item" class="danger full">Apagar equipamento</button>
    `;
    for (const [id, property] of [["eq-name", "name"], ["eq-sector", "sector"], ["eq-ip", "ip"], ["eq-switch", "switch"], ["eq-port", "port"]]) {
      this.bindInput(id, "input", (value) => { item[property] = String(value).slice(0, 80); saveBlueprint(this.blueprint); });
    }
    for (const property of ["x", "z", "rotation"]) {
      this.bindInput(`eq-${property}`, "change", (value) => { item[property] = Number(value); saveBlueprint(this.blueprint); this.rebuildScene(); });
    }
    this.inspector.querySelector("#delete-item")?.addEventListener("click", () => this.deleteSelected());
  }

  renderStairsInspector(item) {
    this.inspector.innerHTML = `
      <div class="badge">Escada</div>
      ${numberField("X", "stairs-x", item.x, 0.05)}
      ${numberField("Z", "stairs-z", item.z, 0.05)}
      ${numberField("Largura", "stairs-width", item.width, 0.05)}
      ${numberField("Comprimento", "stairs-depth", item.depth, 0.05)}
      ${numberField("Altura", "stairs-height", item.height, 0.05)}
      ${numberField("Degraus", "stairs-steps", item.steps, 1)}
      ${numberField("Rotação", "stairs-rotation", item.rotation, 5)}
      <button id="delete-item" class="danger full">Apagar escada</button>
    `;
    for (const property of ["x", "z", "width", "depth", "height", "steps", "rotation"]) {
      this.bindInput(`stairs-${property}`, "change", (value) => { item[property] = property === "steps" ? Math.round(value) : Number(value); saveBlueprint(this.blueprint); this.rebuildScene(); });
    }
    this.inspector.querySelector("#delete-item")?.addEventListener("click", () => this.deleteSelected());
  }

  renderSpawnInspector(spawn) {
    this.inspector.innerHTML = `
      <div class="badge">Início da visita</div>
      ${numberField("X", "spawn-x", spawn.x, 0.05)}
      ${numberField("Z", "spawn-z", spawn.z, 0.05)}
      ${numberField("Direção", "spawn-yaw", spawn.yaw, 5)}
    `;
    for (const property of ["x", "z", "yaw"]) {
      this.bindInput(`spawn-${property}`, "change", (value) => { spawn[property] = Number(value); saveBlueprint(this.blueprint); this.rebuildScene(); });
    }
  }

  bindInput(id, eventName, callback) {
    this.inspector.querySelector(`#${id}`)?.addEventListener(eventName, (event) => callback(event.target.type === "number" ? Number(event.target.value) : event.target.value));
  }

  findNearestWall(point, maxDistance = 1.5) {
    let best = null;
    for (const wall of this.blueprint.walls) {
      const result = projectPointOnSegment(point.x, point.z, wall.ax, wall.az, wall.bx, wall.bz);
      if (result.distance <= maxDistance && (!best || result.distance < best.distance)) best = { wall, ...result };
    }
    return best;
  }

  duplicateSelected() {
    const data = this.getSelectedData();
    if (!data || !["equipment", "stairs"].includes(this.selected.kind)) return;
    const copy = deepClone(data);
    copy.id = uid(this.selected.kind === "equipment" ? copy.type : "escada");
    copy.x += 0.75;
    copy.z += 0.75;
    if (this.selected.kind === "equipment") this.blueprint.equipment.push(copy);
    else this.blueprint.stairs.push(copy);
    this.selected = { kind: this.selected.kind, id: copy.id };
    saveBlueprint(this.blueprint);
    this.rebuildScene();
    this.renderInspector();
  }

  deleteSelected() {
    if (!this.selected) return;
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

  newBlueprint() {
    if (!confirm("Criar um projeto novo?")) return;
    this.blueprint = createDefaultBlueprint();
    this.selected = null;
    saveBlueprint(this.blueprint);
    this.rebuildScene();
    this.renderInspector();
  }

  importBackground(input) {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      this.backgroundUrl = String(reader.result || "");
      try { localStorage.setItem(BACKGROUND_KEY, this.backgroundUrl); } catch {}
      this.rebuildScene();
      this.renderInspector();
    };
    reader.readAsDataURL(file);
    input.value = "";
  }

  snap(value) {
    return this.snapEnabled ? Math.round(value / this.snapSize) * this.snapSize : value;
  }

  resize() {
    if (!this.mount || !this.renderer) return;
    const width = Math.max(2, this.mount.clientWidth || this.mount.getBoundingClientRect().width || 2);
    const height = Math.max(2, this.mount.clientHeight || this.mount.getBoundingClientRect().height || 2);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  animate = () => {
    if (this.destroyed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    this.controls?.update();
    this.renderer?.render(this.scene, this.camera);
  };

  toast(message) {
    if (this.options.onToast) this.options.onToast(message);
    else this.help.textContent = message;
  }

  showFatalError(error) {
    if (this.inspector) {
      this.inspector.innerHTML = `<div class="coords" style="color:#8d2222"><strong>Erro no construtor:</strong><br>${escapeHtml(error?.message || error)}</div>`;
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.resize);
    this.renderer?.domElement?.removeEventListener("pointerdown", this.canvasPointerDown);
    this.renderer?.domElement?.removeEventListener("pointermove", this.canvasPointerMove);
    this.renderer?.domElement?.removeEventListener("pointerup", this.canvasPointerUp);
    this.transform?.detach();
    this.renderer?.dispose();
    disposeGroup(this.floorGroup);
    disposeGroup(this.worldGroup);
    this.root.innerHTML = "";
  }
}

function createEquipmentModel(type) {
  const group = new THREE.Group();
  const box = (w, h, d, color, x = 0, y = h / 2, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.72 }));
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  if (type === "pc") {
    box(1.25, 0.08, 0.62, 0x7b6548, 0, 0.72, 0);
    box(0.62, 0.44, 0.08, 0x263036, 0, 1.18, -0.08);
    box(0.08, 0.28, 0.08, 0x4d5557, 0, 0.95, -0.08);
  } else if (type === "switch" || type === "server") {
    box(0.85, 1.75, 0.65, 0x444b4d);
    box(0.7, 0.18, 0.08, type === "switch" ? 0x203740 : 0x29363a, 0, 1.1, 0.34);
  } else if (type === "point") {
    box(0.22, 0.22, 0.07, 0x2d75c9, 0, 0.55, 0);
  } else if (type === "printer") {
    box(0.72, 0.55, 0.65, 0xd6d7d1);
    box(0.6, 0.15, 0.5, 0x4c5355, 0, 0.7, 0);
  } else if (type === "router") {
    box(0.8, 0.15, 0.5, 0x2f3739, 0, 0.2, 0);
    box(0.03, 0.75, 0.03, 0x202426, -0.28, 0.55, 0);
    box(0.03, 0.75, 0.03, 0x202426, 0.28, 0.55, 0);
  } else if (type === "access-point") {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0xf0efe7 }));
    mesh.position.y = 0.15;
    group.add(mesh);
  }
  return group;
}

function field(label, id, value) {
  return `<label>${label}<input id="${id}" value="${escapeHtml(value)}" /></label>`;
}
function numberField(label, id, value, step = 0.05) {
  return `<label>${label}<input id="${id}" type="number" step="${step}" value="${Number(value)}" /></label>`;
}
function helpForTool(tool) {
  const map = {
    select: "Clique em um objeto para selecioná-lo.",
    wall: "Clique no início e depois no final da parede.",
    door: "Clique perto de uma parede para inserir uma porta.",
    stairs: "Clique no piso para colocar a escada.",
    spawn: "Clique no piso para marcar onde a visita começa."
  };
  return map[tool] || `Clique no piso para colocar: ${typeLabel(tool)}.`;
}
function typeLabel(type) {
  return ({ pc: "Computador", switch: "Switch", point: "Ponto de rede", printer: "Impressora", router: "Roteador", server: "Servidor", "access-point": "Access point" })[type] || type;
}
function disposeGroup(group) {
  if (!group) return;
  while (group.children.length) {
    const object = group.children[0];
    group.remove(object);
    object.traverse?.((child) => {
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
      else child.material?.dispose?.();
    });
  }
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
function keyOf(kind, id) { return `${kind}:${id}`; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value))); }
function normalizeDegrees(value) {
  let result = value % 360;
  if (result > 180) result -= 360;
  if (result < -180) result += 360;
  return Math.round(result * 100) / 100;
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

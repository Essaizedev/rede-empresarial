export const STORAGE_KEY = "rede-3d-blueprint-v2";
export const BACKGROUND_KEY = "rede-3d-background-v2";

export function uid(prefix = "id") {
  return `${prefix}-${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

export function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createDefaultBlueprint() {
  return {
    version: 1,
    name: "Empresa — rede 3D",
    floor: {
      width: 32,
      depth: 24,
      color: "#c8c1a8"
    },
    spawn: {
      x: -12,
      z: 9,
      yaw: 180
    },
    walls: [],
    doors: [],
    equipment: [],
    stairs: []
  };
}

export function loadBlueprint() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return createDefaultBlueprint();
    const parsed = JSON.parse(saved);
    return normalizeBlueprint(parsed);
  } catch {
    return createDefaultBlueprint();
  }
}

export function saveBlueprint(blueprint) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeBlueprint(blueprint)));
}

export function normalizeBlueprint(input) {
  const base = createDefaultBlueprint();
  const value = input && typeof input === "object" ? input : {};
  return {
    version: 1,
    name: String(value.name || base.name).slice(0, 80),
    floor: {
      width: clampNumber(value.floor?.width, 8, 100, base.floor.width),
      depth: clampNumber(value.floor?.depth, 8, 100, base.floor.depth),
      color: /^#[0-9a-f]{6}$/i.test(value.floor?.color || "") ? value.floor.color : base.floor.color
    },
    spawn: {
      x: clampNumber(value.spawn?.x, -100, 100, 0),
      z: clampNumber(value.spawn?.z, -100, 100, 7),
      yaw: clampNumber(value.spawn?.yaw, -360, 360, 180)
    },
    walls: Array.isArray(value.walls) ? value.walls.slice(0, 800).map(normalizeWall) : base.walls,
    doors: Array.isArray(value.doors) ? value.doors.slice(0, 300).map(normalizeDoor) : [],
    equipment: Array.isArray(value.equipment) ? value.equipment.slice(0, 800).map(normalizeEquipment) : [],
    stairs: Array.isArray(value.stairs) ? value.stairs.slice(0, 100).map(normalizeStairs) : []
  };
}

function normalizeWall(wall) {
  return {
    id: String(wall?.id || uid("parede")),
    ax: clampNumber(wall?.ax, -100, 100, 0),
    az: clampNumber(wall?.az, -100, 100, 0),
    bx: clampNumber(wall?.bx, -100, 100, 1),
    bz: clampNumber(wall?.bz, -100, 100, 0),
    height: clampNumber(wall?.height, 1.8, 8, 3),
    thickness: clampNumber(wall?.thickness, 0.08, 0.8, 0.18)
  };
}

function normalizeDoor(door) {
  return {
    id: String(door?.id || uid("porta")),
    wallId: String(door?.wallId || ""),
    t: clampNumber(door?.t, 0.02, 0.98, 0.5),
    width: clampNumber(door?.width, 0.65, 3.5, 1.1),
    height: clampNumber(door?.height, 1.8, 3.2, 2.25),
    hinge: door?.hinge === "right" ? "right" : "left",
    openAngle: clampNumber(door?.openAngle, -160, 160, -95),
    label: String(door?.label || "Porta").slice(0, 60)
  };
}

function normalizeEquipment(item) {
  const allowed = new Set(["pc", "switch", "point", "printer", "router", "server", "access-point"]);
  return {
    id: String(item?.id || uid("equip")),
    type: allowed.has(item?.type) ? item.type : "pc",
    x: clampNumber(item?.x, -100, 100, 0),
    z: clampNumber(item?.z, -100, 100, 0),
    rotation: clampNumber(item?.rotation, -360, 360, 0),
    name: String(item?.name || "Equipamento").slice(0, 80),
    sector: String(item?.sector || "Não informado").slice(0, 80),
    ip: String(item?.ip || "Não informado").slice(0, 80),
    switch: String(item?.switch || "Não informado").slice(0, 80),
    port: String(item?.port || "Não informado").slice(0, 80)
  };
}

function normalizeStairs(item) {
  return {
    id: String(item?.id || uid("escada")),
    x: clampNumber(item?.x, -100, 100, 0),
    z: clampNumber(item?.z, -100, 100, 0),
    width: clampNumber(item?.width, 0.8, 5, 1.5),
    depth: clampNumber(item?.depth, 1.5, 10, 3.5),
    height: clampNumber(item?.height, 1, 6, 2.8),
    steps: Math.round(clampNumber(item?.steps, 3, 30, 12)),
    rotation: clampNumber(item?.rotation, -360, 360, 0)
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function downloadBlueprint(blueprint) {
  const blob = new Blob([JSON.stringify(normalizeBlueprint(blueprint), null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(blueprint.name || "empresa")}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function readBlueprintFile(file) {
  const text = await file.text();
  return normalizeBlueprint(JSON.parse(text));
}

function slugify(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "empresa";
}

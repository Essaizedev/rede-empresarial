import type * as Party from "partykit/server";

type Player = {
  id: string;
  name: string;
  color: string;
  role: "player" | "builder";
  x: number;
  y: number;
  z: number;
  yaw: number;
};

type StoredState = {
  blueprint: unknown | null;
  doors: Record<string, boolean>;
};

export default class Server implements Party.Server {
  constructor(readonly room: Party.Room) {}

  players = new Map<string, Player>();
  blueprint: unknown | null = null;
  doors: Record<string, boolean> = {};

  async onStart() {
    const stored = await this.room.storage.get<StoredState>("world");
    this.blueprint = stored?.blueprint ?? null;
    this.doors = stored?.doors ?? {};
  }

  onConnect(connection: Party.Connection) {
    connection.send(JSON.stringify({
      type: "state",
      blueprint: this.blueprint,
      doors: this.doors,
      players: [...this.players.values()]
    }));
  }

  async onMessage(message: string | ArrayBuffer, sender: Party.Connection) {
    if (typeof message !== "string") return;

    let event: any;
    try {
      event = JSON.parse(message);
    } catch {
      return;
    }

    if (!event || typeof event.type !== "string") return;

    if (event.type === "join") {
      const player: Player = {
        id: sender.id,
        name: cleanText(event.name, "Visitante", 32),
        color: cleanColor(event.color),
        role: event.role === "builder" ? "builder" : "player",
        x: 0,
        y: 1.7,
        z: 0,
        yaw: 0
      };
      this.players.set(sender.id, player);
      sender.setState({ joined: true, name: player.name });
      this.room.broadcast(JSON.stringify({ type: "player-joined", player }));
      return;
    }

    if (event.type === "move") {
      const player = this.players.get(sender.id);
      if (!player) return;
      player.x = finite(event.x, player.x, -200, 200);
      player.y = finite(event.y, player.y, -20, 30);
      player.z = finite(event.z, player.z, -200, 200);
      player.yaw = finite(event.yaw, player.yaw, -Math.PI * 8, Math.PI * 8);
      this.room.broadcast(JSON.stringify({
        type: "player-move",
        id: sender.id,
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: player.yaw
      }));
      return;
    }

    if (event.type === "door") {
      const id = cleanText(event.id, "", 100);
      if (!id) return;
      this.doors[id] = Boolean(event.open);
      await this.saveWorld();
      this.room.broadcast(JSON.stringify({ type: "door", id, open: this.doors[id] }));
      return;
    }

    if (event.type === "set-blueprint") {
      const raw = event.blueprint;
      const serialized = JSON.stringify(raw ?? null);
      if (serialized.length > 120_000) {
        sender.send(JSON.stringify({ type: "error", message: "A planta ultrapassou o limite de 120 KB." }));
        return;
      }
      if (!raw || typeof raw !== "object") {
        sender.send(JSON.stringify({ type: "error", message: "A planta enviada é inválida." }));
        return;
      }
      this.blueprint = raw;
      this.doors = {};
      await this.saveWorld();
      this.room.broadcast(JSON.stringify({ type: "blueprint-updated", blueprint: this.blueprint, doors: this.doors }));
      sender.send(JSON.stringify({ type: "published", room: this.room.id }));
      return;
    }
  }

  onClose(connection: Party.Connection) {
    if (!this.players.has(connection.id)) return;
    this.players.delete(connection.id);
    this.room.broadcast(JSON.stringify({ type: "player-left", id: connection.id }));
  }

  onError(connection: Party.Connection) {
    this.onClose(connection);
  }

  private async saveWorld() {
    await this.room.storage.put<StoredState>("world", {
      blueprint: this.blueprint,
      doors: this.doors
    });
  }
}

function finite(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function cleanText(value: unknown, fallback: string, max: number) {
  const text = String(value ?? "").replace(/[<>]/g, "").trim().slice(0, max);
  return text || fallback;
}

function cleanColor(value: unknown) {
  const text = String(value ?? "");
  return /^#[0-9a-f]{6}$/i.test(text) ? text : "#4f8cff";
}

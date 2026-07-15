import PartySocket from "partysocket";

export function getPartyHost() {
  const configured = String(import.meta.env.VITE_PARTYKIT_HOST || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (configured) return configured;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return "localhost:1999";
  return "";
}

export function multiplayerConfigured() {
  return Boolean(getPartyHost());
}

export class MultiplayerClient extends EventTarget {
  constructor({ room, name, color, role = "player" }) {
    super();
    this.room = sanitizeRoom(room);
    this.name = String(name || "Visitante").trim().slice(0, 32) || "Visitante";
    this.color = /^#[0-9a-f]{6}$/i.test(color || "") ? color : randomColor();
    this.role = role;
    this.socket = null;
    this.id = crypto.randomUUID?.() || `player-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.openPromise = null;
  }

  connect() {
    if (this.openPromise) return this.openPromise;
    const host = getPartyHost();
    if (!host) return Promise.reject(new Error("O servidor online ainda não foi configurado."));

    this.socket = new PartySocket({
      host,
      room: this.room,
      party: "main",
      id: this.id
    });

    this.openPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("O servidor online demorou para responder.")), 12000);

      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        this.send({
          type: "join",
          name: this.name,
          color: this.color,
          role: this.role
        });
        this.dispatchEvent(new CustomEvent("status", { detail: { connected: true } }));
        resolve(this);
      }, { once: true });

      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("Não foi possível conectar ao servidor online."));
      }, { once: true });
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(event.data);
        this.dispatchEvent(new CustomEvent("message", { detail: message }));
        if (message?.type) {
          this.dispatchEvent(new CustomEvent(message.type, { detail: message }));
        }
      } catch {
        // Ignora mensagens inválidas.
      }
    });

    this.socket.addEventListener("close", () => {
      this.dispatchEvent(new CustomEvent("status", { detail: { connected: false } }));
    });

    return this.openPromise;
  }

  send(message) {
    if (!this.socket) return;
    this.socket.send(JSON.stringify(message));
  }

  publishBlueprint(blueprint) {
    this.send({ type: "set-blueprint", blueprint });
  }

  sendMove(position) {
    this.send({ type: "move", ...position });
  }

  sendDoor(id, open) {
    this.send({ type: "door", id, open: Boolean(open) });
  }

  close() {
    this.socket?.close();
  }
}

export function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export function randomColor() {
  const colors = ["#4f8cff", "#e96d73", "#58b77c", "#d8993f", "#9b75d6", "#43a9b7", "#c96aa7"];
  return colors[Math.floor(Math.random() * colors.length)];
}

export function sanitizeRoom(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 24) || randomRoomCode();
}

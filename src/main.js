import "./style.css";
import { deepClone, loadBlueprint, normalizeBlueprint, saveBlueprint } from "./data.js";

function getPartyHost() {
  const configured = String(import.meta.env.VITE_PARTYKIT_HOST || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
  if (configured) return configured;
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") return "localhost:1999";
  return "";
}

function multiplayerConfigured() {
  return Boolean(getPartyHost());
}

function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function randomColor() {
  const colors = ["#4f8cff", "#e96d73", "#58b77c", "#d8993f", "#9b75d6", "#43a9b7", "#c96aa7"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function sanitizeRoom(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 24) || randomRoomCode();
}

const app = document.querySelector("#app");
let activeBuilder = null;
let activeGame = null;

const roomFromUrl = new URLSearchParams(location.search).get("room");
if (roomFromUrl) showJoinOnline(roomFromUrl);
else showHome();

function showHome() {
  cleanup();
  app.innerHTML = `
    <main class="home-shell">
      <section class="home-card">
        <h1>Rede Empresarial 3D</h1>
        <p>
          Construa a empresa diretamente em 3D, coloque portas e equipamentos de rede, teste em primeira pessoa e publique uma sala para a turma entrar com avatares.
        </p>
        <div class="home-grid">
          <button id="home-build" class="home-option">
            <strong>1. Construir</strong>
            <span>Construir paredes, portas, escadas e equipamentos diretamente no cenário 3D.</span>
          </button>
          <button id="home-solo" class="home-option">
            <strong>2. Testar sozinho</strong>
            <span>Abrir a planta salva em 3D e conferir os acessos antes da apresentação.</span>
          </button>
          <button id="home-online" class="home-option">
            <strong>3. Jogar online</strong>
            <span>Entrar com nome e código da sala para ver os colegas caminhando.</span>
          </button>
        </div>
        <div class="online-status">
          ${multiplayerConfigured()
            ? "✅ O endereço do servidor multiplayer está configurado."
            : "⚠️ O construtor e o modo individual já funcionam. Para o multiplayer, configure VITE_PARTYKIT_HOST na Vercel."}
        </div>
      </section>
    </main>
  `;

  app.querySelector("#home-build").addEventListener("click", showBuilder);
  app.querySelector("#home-solo").addEventListener("click", () => startSolo(loadBlueprint(), showHome));
  app.querySelector("#home-online").addEventListener("click", () => showJoinOnline(roomFromUrl || ""));
}

async function showBuilder() {
  cleanup();
  app.innerHTML = `<main class="home-shell"><section class="home-card"><h1>Carregando construtor 3D...</h1><p>Preparando as ferramentas do cenário.</p></section></main>`;
  const { Builder } = await import("./editor.js");
  cleanup();
  activeBuilder = new Builder(app, {
    blueprint: loadBlueprint(),
    onBack: showHome,
    onPlay: (blueprint) => startSolo(blueprint, showBuilder),
    onPublish: publishRoom,
    onToast: showToast
  });
}

async function startSolo(blueprint, returnTo) {
  cleanup();
  const { Game } = await import("./game.js");
  activeGame = new Game(app, {
    blueprint: normalizeBlueprint(blueprint),
    online: false,
    playerName: "Você",
    onExit: returnTo
  });
}

function showJoinOnline(initialRoom = "") {
  cleanup();
  const color = randomColor();
  app.innerHTML = `
    <main class="join-shell">
      <section class="dialog-card">
        <h1>Entrar no simulador</h1>
        <p>Todos que usarem o mesmo código entrarão na mesma empresa.</p>
        <label>Seu nome<input id="join-name" maxlength="32" value="Visitante" /></label>
        <label>Código da sala<input id="join-room" maxlength="24" value="${escapeHtml(sanitizeRoom(initialRoom || ""))}" /></label>
        <label>Cor do avatar<input id="join-color" type="color" value="${color}" /></label>
        <div class="dialog-actions">
          <button id="join-back" class="secondary">Voltar</button>
          <button id="join-submit" class="primary" ${multiplayerConfigured() ? "" : "disabled"}>Entrar online</button>
        </div>
        ${multiplayerConfigured() ? "" : '<p class="muted small">O servidor multiplayer ainda não foi configurado. Consulte o README do projeto.</p>'}
      </section>
    </main>
  `;

  app.querySelector("#join-back").addEventListener("click", showHome);
  app.querySelector("#join-submit").addEventListener("click", async () => {
    const button = app.querySelector("#join-submit");
    const name = app.querySelector("#join-name").value.trim() || "Visitante";
    const room = sanitizeRoom(app.querySelector("#join-room").value);
    const avatarColor = app.querySelector("#join-color").value;
    button.disabled = true;
    button.textContent = "Conectando...";

    let client;
    try {
      const { MultiplayerClient } = await import("./multiplayer.js");
      client = new MultiplayerClient({ room, name, color: avatarColor, role: "player" });
      const statePromise = waitForEvent(client, "state", 12000);
      await client.connect();
      const state = await statePromise;
      if (!state.blueprint) {
        client.close();
        throw new Error("Essa sala ainda não possui uma planta publicada.");
      }
      history.replaceState(null, "", `${location.pathname}?room=${encodeURIComponent(room)}`);
      cleanup();
      const { Game } = await import("./game.js");
      activeGame = new Game(app, {
        blueprint: state.blueprint,
        doors: state.doors || {},
        players: state.players || [],
        online: true,
        client,
        playerName: name,
        roomCode: room,
        onExit: () => {
          history.replaceState(null, "", location.pathname);
          showHome();
        }
      });
    } catch (error) {
      client?.close();
      alert(error.message || "Não foi possível entrar na sala.");
      button.disabled = false;
      button.textContent = "Entrar online";
    }
  });
}

async function publishRoom(blueprint) {
  if (!multiplayerConfigured()) {
    alert("O multiplayer ainda não está configurado. Primeiro publique o servidor PartyKit e coloque o domínio em VITE_PARTYKIT_HOST na Vercel.");
    return;
  }

  const room = sanitizeRoom(prompt("Escolha o código da sala:", randomRoomCode()) || "");
  if (!room) return;
  const name = (prompt("Seu nome como responsável pela sala:", "Professora") || "Professora").slice(0, 32);
  let client;

  try {
    const { MultiplayerClient } = await import("./multiplayer.js");
    client = new MultiplayerClient({ room, name, color: "#d8993f", role: "builder" });
    const publishedPromise = waitForEvent(client, "published", 12000);
    await client.connect();
    client.publishBlueprint(normalizeBlueprint(blueprint));
    await publishedPromise;
    const link = `${location.origin}${location.pathname}?room=${encodeURIComponent(room)}`;
    showShareDialog(room, link, client);
  } catch (error) {
    client?.close();
    alert(error.message || "Não foi possível publicar a sala.");
  }
}

function showShareDialog(room, link, client) {
  const modal = document.createElement("div");
  modal.className = "modal";
  modal.innerHTML = `
    <section class="dialog-card">
      <h2>Sala publicada</h2>
      <p>Código: <strong>${escapeHtml(room)}</strong></p>
      <div class="share-box">${escapeHtml(link)}</div>
      <div class="dialog-actions">
        <button id="share-copy" class="secondary">Copiar link</button>
        <button id="share-play" class="primary">Entrar como responsável</button>
        <button id="share-close" class="secondary">Fechar</button>
      </div>
    </section>
  `;
  document.body.appendChild(modal);

  modal.querySelector("#share-copy").addEventListener("click", async () => {
    await navigator.clipboard?.writeText(link);
    showToast("Link copiado.");
  });
  modal.querySelector("#share-close").addEventListener("click", () => {
    client.close();
    modal.remove();
  });
  modal.querySelector("#share-play").addEventListener("click", async () => {
    modal.remove();
    client.close();
    showJoinOnline(room);
  });
}

function waitForEvent(target, name, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      target.removeEventListener(name, handler);
      reject(new Error("O servidor não respondeu dentro do tempo esperado."));
    }, timeoutMs);
    const handler = (event) => {
      clearTimeout(timeout);
      resolve(event.detail);
    };
    target.addEventListener(name, handler, { once: true });
  });
}

function showToast(message) {
  let toast = document.querySelector("#global-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "global-toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function cleanup() {
  activeBuilder?.destroy();
  activeBuilder = null;
  if (activeGame?.running) {
    activeGame.running = false;
    cancelAnimationFrame(activeGame.animationFrame);
    activeGame.client?.close();
    activeGame.renderer?.dispose?.();
  }
  activeGame = null;
  app.innerHTML = "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

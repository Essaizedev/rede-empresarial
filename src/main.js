import * as THREE from 'three';
import { createClient } from '@supabase/supabase-js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import {
  AVATAR_OPTIONS,
  DEFAULT_AVATAR,
  applyAvatarState,
  createAvatar,
  sanitizeAvatar,
  updateAvatar,
} from './avatar.js';
import {
  NETWORK_KINDS,
  OPENING_KINDS,
  SEGMENT_KINDS,
  applyObjectColor,
  applySegmentTransform,
  createCable,
  createObject,
  createObjectFromData,
  createRoad,
  createSidewalk,
  createWall,
  detachOpening,
  disposeRoot,
  finalizeLoadedWorld,
  findNearestWall,
  getFirstColor,
  getSegmentInfo,
  networkValidation,
  objectLabel,
  rebuildSegment,
  rebuildWall,
  resizeObject,
  serializeObject,
  setOpeningOpen,
  snapOpeningToWall,
  snapshotSegment,
  updateAllCables,
  updateOpeningAnimation,
  updateVehicleAnimation,
} from './objects.js';
import './style.css';

const app = document.querySelector('#app');

function showFatalError(message) {
  let box = document.querySelector('#fatalError');
  if (!box) {
    box = document.createElement('div');
    box.id = 'fatalError';
    document.body.appendChild(box);
  }
  box.textContent = `Erro ao abrir o site: ${message}`;
}

function isRecoverablePointerLockError(value) {
  const message = value?.message || String(value || '');
  return /pointer lock|pointerlock/i.test(message)
    && /immediately|exited|user activation|not allowed|denied|acquired/i.test(message);
}

window.addEventListener('error', (event) => {
  const error = event.error || event.message;
  if (isRecoverablePointerLockError(error)) {
    event.preventDefault?.();
    console.warn('Pointer Lock temporariamente indisponível:', error);
    return;
  }
  showFatalError(event.error?.message || event.message || 'erro desconhecido');
});

window.addEventListener('unhandledrejection', (event) => {
  if (isRecoverablePointerLockError(event.reason)) {
    event.preventDefault();
    console.warn('Pointer Lock temporariamente indisponível:', event.reason);
    return;
  }
  showFatalError(event.reason?.message || String(event.reason || 'erro desconhecido'));
});

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
const SUPABASE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
let supabase = null;
let supabaseInitError = '';

if (SUPABASE_URL || SUPABASE_KEY) {
  try {
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)) {
      throw new Error('VITE_SUPABASE_URL inválida. Use apenas https://...supabase.co, sem /rest/v1.');
    }
    if (!(SUPABASE_KEY.startsWith('sb_publishable_') || SUPABASE_KEY.startsWith('eyJ'))) {
      throw new Error('A chave pública do Supabase não parece válida.');
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 25 } },
    });
  } catch (error) {
    supabaseInitError = error instanceof Error ? error.message : String(error);
  }
}

const bodyTypeOptions = AVATAR_OPTIONS.bodyTypes.map((item) => `<option value="${item.value}">${item.label}</option>`).join('');
const hairOptions = AVATAR_OPTIONS.hairStyles.map((item) => `<option value="${item.value}">${item.label}</option>`).join('');
const shirtStyleOptions = AVATAR_OPTIONS.shirtStyles.map((item) => `<option value="${item.value}">${item.label}</option>`).join('');

app.innerHTML = `
  <section id="homeOverlay" class="overlay">
    <div class="home-card">
      <div class="home-title">
        <div>
          <span class="eyebrow">SIMULADOR DE REDES E AMBIENTES</span>
          <h1>Empresa 3D Inteligente</h1>
          <p>Construa com precisão, publique uma sala e explore com outras pessoas. Não existe cadastro para visitantes.</p>
        </div>
        <div id="avatarPreview" aria-label="Prévia do avatar"></div>
      </div>

      <div class="avatar-editor">
        <div class="avatar-editor-title">
          <strong>Personalize seu avatar</strong>
          <span>Essa aparência será vista pelos colegas.</span>
        </div>
        <label>Personagem<select id="avatarBodyType">${bodyTypeOptions}</select></label>
        <label>Tom de pele<input id="avatarSkin" type="color" /></label>
        <label>Cabelo<select id="avatarHairStyle">${hairOptions}</select></label>
        <label>Cor cabelo/boné<input id="avatarHair" type="color" /></label>
        <label>Camisa de seleção<select id="avatarShirtStyle">${shirtStyleOptions}</select></label>
        <label>Cor personalizada<input id="avatarShirt" type="color" /></label>
        <label>Calça<input id="avatarPants" type="color" /></label>
        <label>Calçado<input id="avatarShoes" type="color" /></label>
      </div>

      <div class="home-grid">
        <article class="choice-card">
          <div class="choice-icon">⌂</div>
          <h2>Construir sozinho</h2>
          <p>Use vista superior, encaixes inteligentes, medidas precisas, paredes com aberturas reais, ruas, portões e equipamentos de rede.</p>
          <button id="openBuilder" class="primary wide">Abrir construtor</button>
        </article>
        <article class="choice-card">
          <div class="choice-icon">◎</div>
          <h2>Entrar em uma sala</h2>
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
      <span class="title">Empresa 3D</span>
      <button id="homeFromBuilder" class="icon-button" title="Início">⌂</button>
      <div class="topbar-group view-switch">
        <button id="topView" class="active">Vista superior</button>
        <button id="perspectiveView">Vista 3D</button>
      </div>
      <button id="soloTest" class="secondary">Testar cenário</button>
      <button id="undoAction" class="secondary" title="Desfazer (Ctrl+Z)">↶</button>
      <button id="redoAction" class="secondary" title="Refazer (Ctrl+Y)">↷</button>
      <button id="saveProject" class="secondary">Salvar versão</button>
      <button id="exportProject" class="secondary">Exportar</button>
      <button id="importProject" class="secondary">Importar</button>
      <input id="importFile" type="file" accept=".json" />
      <div class="room-mini">
        <input id="publishRoom" maxlength="50" placeholder="Código da sala" />
        <input id="publishPin" maxlength="30" type="password" placeholder="Senha de edição" />
        <button id="publishScene" class="primary">Publicar</button>
        <button id="deleteRoom" class="delete" title="Excluir permanentemente esta sala">Excluir sala</button>
      </div>
    </header>

    <aside id="toolPanel" class="sidebar left-sidebar">
      <div class="sidebar-heading">
        <div><span class="eyebrow">FERRAMENTAS</span><h3>Construção</h3></div>
        <button id="collapseTools" class="small-button">−</button>
      </div>

      <div class="tool-tabs">
        <button data-tab="structure" class="active">Estrutura</button>
        <button data-tab="exterior">Exterior</button>
        <button data-tab="furniture">Móveis</button>
        <button data-tab="network">Rede</button>
      </div>

      <div class="tool-section active" data-section="structure">
        <div class="tool-grid">
          <button data-tool="select" class="active">Selecionar</button>
          <button data-tool="windowSelect">Seleção em área</button>
          <button data-tool="wall">Parede</button>
          <button data-tool="paint">Pintar parede</button>
          <button data-add="door">Porta</button>
          <button data-add="window">Janela</button>
          <button data-add="slidingGate">Portão</button>
          <button data-add="stairs">Escada</button>
        </div>
      </div>
      <div class="tool-section" data-section="exterior">
        <div class="tool-grid">
          <button data-tool="road">Rua</button>
          <button data-tool="sidewalk">Calçada</button>
          <button data-add="parking">Vaga</button>
          <button data-add="grass">Área verde</button>
          <button data-add="spawnPoint">Ponto inicial</button>
          <button data-add="car">Carro</button>
          <button data-add="motorcycle">Moto</button>
        </div>
      </div>
      <div class="tool-section" data-section="furniture">
        <div class="tool-grid">
          <button data-add="table">Mesa</button>
          <button data-add="chair">Cadeira</button>
          <button data-add="cabinet">Armário</button>
          <button data-add="shelf">Estante</button>
        </div>
      </div>
      <div class="tool-section" data-section="network">
        <div class="tool-grid">
          <button data-add="computer">Computador</button>
          <button data-add="laptop">Notebook</button>
          <button data-add="printer">Impressora</button>
          <button data-add="network">Ponto de rede</button>
          <button data-add="switch">Switch</button>
          <button data-add="router">Roteador</button>
          <button data-add="rack">Rack</button>
          <button data-add="server">Servidor</button>
          <button data-tool="cable">Cabo</button>
        </div>
      </div>

      <details open>
        <summary>Precisão e encaixe</summary>
        <div class="field"><label for="gridSize">Grade</label><select id="gridSize"><option value="0.1">10 cm</option><option value="0.25" selected>25 cm</option><option value="0.5">50 cm</option><option value="1">1 metro</option></select></div>
        <label class="check"><input id="smartSnap" type="checkbox" checked /> Encaixe inteligente em cantos e paredes</label>
        <label class="check"><input id="orthogonalMode" type="checkbox" /> Modo ortogonal — somente 0° e 90° (F8)</label>
        <label class="check"><input id="showGrid" type="checkbox" checked /> Mostrar grade</label>
        <label class="check"><input id="showMeasurements" type="checkbox" checked /> Mostrar comprimento e ângulo</label>
        <div class="field-row">
          <label>Altura da parede<input id="wallHeightDefault" type="number" value="3" min="1.8" max="8" step="0.05" /></label>
          <label>Espessura<input id="wallDepthDefault" type="number" value="0.16" min="0.08" max="0.6" step="0.01" /></label>
        </div>
        <div class="field"><label>Cor das novas paredes<input id="wallColorDefault" type="color" value="#cfc6a2" /></label></div>
        <div class="color-swatches" aria-label="Cores rápidas para paredes">
          <button type="button" data-wall-color="#f2efe2" style="--swatch:#f2efe2" title="Branco quente"></button>
          <button type="button" data-wall-color="#cfc6a2" style="--swatch:#cfc6a2" title="Bege"></button>
          <button type="button" data-wall-color="#b7c4ca" style="--swatch:#b7c4ca" title="Cinza azulado"></button>
          <button type="button" data-wall-color="#a9c3ad" style="--swatch:#a9c3ad" title="Verde suave"></button>
          <button type="button" data-wall-color="#d5b7aa" style="--swatch:#d5b7aa" title="Terracota suave"></button>
          <button type="button" data-wall-color="#8f9697" style="--swatch:#8f9697" title="Cinza"></button>
        </div>
        <button id="paintSelectedWalls" class="secondary wide">Aplicar cor às paredes selecionadas</button>
        <div class="field"><label for="roadWidthDefault">Largura padrão da rua</label><input id="roadWidthDefault" type="number" value="6" min="2" max="20" step="0.25" /></div>
      </details>

      <details>
        <summary>Tamanhos das aberturas</summary>
        <div class="field-row">
          <label>Porta — largura<input id="doorWidthDefault" type="number" value="0.90" min="0.55" max="3" step="0.05" /></label>
          <label>Porta — altura<input id="doorHeightDefault" type="number" value="2.10" min="1.5" max="4" step="0.05" /></label>
        </div>
        <div class="field-row">
          <label>Janela — largura<input id="windowWidthDefault" type="number" value="1.50" min="0.3" max="5" step="0.05" /></label>
          <label>Janela — altura<input id="windowHeightDefault" type="number" value="1.10" min="0.3" max="3" step="0.05" /></label>
        </div>
        <div class="field-row">
          <label>Portão — largura<input id="gateWidthDefault" type="number" value="3.60" min="1.5" max="12" step="0.1" /></label>
          <label>Portão — altura<input id="gateHeightDefault" type="number" value="2.20" min="1.5" max="5" step="0.05" /></label>
        </div>
        <p class="help-text">A espessura e a altura são ajustadas automaticamente à parede.</p>
      </details>

      <details>
        <summary>Gráficos e desempenho</summary>
        <div class="field"><label>Qualidade<select class="graphics-quality"><option value="low">Econômico — recomendado</option><option value="medium">Equilibrado</option><option value="high">Alto</option></select></label></div>
        <label class="check"><input class="shadows-toggle" type="checkbox" /> Ativar sombras</label>
        <div class="field"><label>Sensibilidade do mouse <span class="sensitivity-value">1,00</span><input class="sensitivity-control" type="range" min="0.25" max="2.5" step="0.05" value="1" /></label></div>
        <p class="help-text">O modo Econômico reduz resolução e limita a renderização para funcionar melhor em computadores escolares.</p>
      </details>

      <details>
        <summary>Planta de referência</summary>
        <button id="choosePlan" class="secondary wide">Escolher imagem</button>
        <input id="planFile" type="file" accept="image/*" />
        <div class="field"><label>Opacidade<input id="planOpacity" type="range" min="0" max="1" step=".05" value=".5" /></label></div>
        <div class="field-row">
          <label>Escala<input id="planScale" type="number" min="1" max="200" step="1" value="25" /></label>
          <label>Rotação<input id="planRotation" type="number" min="-180" max="180" step="1" value="0" /></label>
        </div>
      </details>

      <details>
        <summary>Versões salvas</summary>
        <select id="versionSelect" class="wide"></select>
        <button id="restoreVersion" class="secondary wide">Restaurar versão</button>
      </details>
    </aside>

    <aside id="propertiesPanel" class="sidebar right-sidebar">
      <div class="sidebar-heading">
        <div><span class="eyebrow">PROPRIEDADES</span><h3 id="selectionTitle">Nenhuma seleção</h3></div>
      </div>
      <div id="noSelection" class="empty-state">Clique em um objeto. Use <strong>Shift + clique</strong> para somar itens ou <strong>Shift + arraste</strong> para selecionar uma área como no CAD.</div>
      <div id="propertiesForm" class="hidden">
        <div class="action-strip">
          <button data-transform="translate" class="active">Mover</button>
          <button data-transform="rotate">Girar</button>
          <button id="duplicateObject">Duplicar</button>
          <button id="deleteObject" class="delete">Apagar</button>
        </div>

        <details open>
          <summary>Posição e dimensões</summary>
          <div class="field-row thirds">
            <label>X<input id="propX" type="number" step="0.05" /></label>
            <label>Y<input id="propY" type="number" step="0.05" /></label>
            <label>Z<input id="propZ" type="number" step="0.05" /></label>
          </div>
          <div class="field-row thirds">
            <label>Comprimento<input id="propWidth" type="number" min="0.05" step="0.05" /></label>
            <label>Altura<input id="propHeight" type="number" min="0.02" step="0.05" /></label>
            <label>Profundidade<input id="propDepth" type="number" min="0.02" step="0.05" /></label>
          </div>
          <div class="field-row">
            <label>Rotação<input id="propRotation" type="number" step="1" /></label>
            <label>Cor<input id="propColor" type="color" /></label>
          </div>
          <label class="check"><input id="propLocked" type="checkbox" /> Bloquear objeto</label>
        </details>

        <details open>
          <summary>Identificação</summary>
          <div class="field"><label>Nome<input id="propName" /></label></div>
          <div class="field"><label>Setor<input id="propSector" /></label></div>
          <div class="field"><label>Observações<textarea id="propNotes" rows="2"></textarea></label></div>
        </details>

        <details id="networkProperties">
          <summary>Configuração de rede</summary>
          <div class="field"><label>Endereço IP<input id="propIp" placeholder="192.168.0.10" /></label></div>
          <div class="field-row">
            <label>Máscara<input id="propMask" placeholder="255.255.255.0" /></label>
            <label>Gateway<input id="propGateway" placeholder="192.168.0.1" /></label>
          </div>
          <div class="field"><label>MAC<input id="propMac" placeholder="00:11:22:33:44:55" /></label></div>
          <div class="field-row">
            <label>Switch<input id="propSwitch" placeholder="SW-01" /></label>
            <label>Porta<input id="propPort" placeholder="Fa0/01" /></label>
          </div>
          <div class="field"><label>Quantidade de portas<input id="propPortCount" type="number" min="1" max="192" step="1" /></label></div>
          <div id="switchPorts"></div>
        </details>

        <details id="openingProperties">
          <summary>Abertura</summary>
          <div class="field"><label>Altura do peitoril<input id="propSill" type="number" step="0.05" /></label></div>
          <div class="field"><label>Direção do portão<select id="propSlideDirection"><option value="1">Deslizar para a direita</option><option value="-1">Deslizar para a esquerda</option></select></label></div>
          <button id="reattachOpening" class="secondary wide">Reencaixar na parede mais próxima</button>
        </details>

        <button id="applyProperties" class="primary wide">Aplicar alterações</button>
      </div>

      <details open class="validation-box">
        <summary>Diagnóstico da rede</summary>
        <div id="validationResults" class="validation-results">Nenhum problema encontrado.</div>
      </details>
    </aside>

    <div id="measurementBadge" class="hidden"></div>
    <div id="selectionMarquee" class="hidden"></div>
    <div id="builderStatus">Modo selecionar.</div>
  </section>

  <section id="gameUi" class="hidden">
    <div id="gameControls" class="game-panel"><strong>Controles</strong><br>W, A, S, D: andar ou dirigir<br>Shift: correr · Espaço: frear veículo<br>E ou clique: interagir/entrar/sair<br>1: acenar · 2: apontar<br><small>O teclado fica dedicado ao jogo enquanto esta tela estiver ativa.</small></div>
    <div id="playersPanel" class="game-panel"><strong>Participantes</strong><ol id="playersList"></ol></div>
    <div id="gameSettings" class="game-panel">
      <strong>Gráficos</strong>
      <label>Qualidade<select class="graphics-quality"><option value="low">Econômico</option><option value="medium">Equilibrado</option><option value="high">Alto</option></select></label>
      <label class="game-check"><input class="shadows-toggle" type="checkbox" /> Sombras</label>
      <label>Sensibilidade <span class="sensitivity-value">1,00</span><input class="sensitivity-control" type="range" min="0.25" max="2.5" step="0.05" value="1" /></label>
      <small>Pressione Esc para liberar o mouse e alterar.</small>
    </div>
    <button id="exitGame" class="danger">Sair</button>
    <div id="pointerLockHint">Clique na tela para controlar o personagem</div>
    <div id="crosshair"></div>
    <div id="interactionHint"></div>
    <div id="vehicleHud" class="game-panel hidden"><strong id="vehicleName">Veículo</strong><span id="vehicleSpeed">0 km/h</span><small>W/S acelerar e ré · A/D virar · Espaço frear · E sair</small></div>
    <div id="toast"></div>
  </section>

  <section id="equipmentModal">
    <div class="modal-card">
      <h2 id="modalName">Equipamento</h2>
      <div class="equipment-grid">
        <p><strong>Setor</strong><span id="modalSector">-</span></p>
        <p><strong>IP</strong><span id="modalIp">-</span></p>
        <p><strong>Máscara</strong><span id="modalMask">-</span></p>
        <p><strong>Gateway</strong><span id="modalGateway">-</span></p>
        <p><strong>Switch</strong><span id="modalSwitch">-</span></p>
        <p><strong>Porta</strong><span id="modalPort">-</span></p>
      </div>
      <p id="modalNotes"></p>
      <button id="closeModal" class="secondary wide">Fechar</button>
    </div>
  </section>
`;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const homeOverlay = $('#homeOverlay');
const builderUi = $('#builderUi');
const gameUi = $('#gameUi');
const builderStatus = $('#builderStatus');
const measurementBadge = $('#measurementBadge');
const selectionMarquee = $('#selectionMarquee');
const playersList = $('#playersList');
const toast = $('#toast');
const interactionHint = $('#interactionHint');
const pointerLockHint = $('#pointerLockHint');
const exitGameButton = $('#exitGame');
const vehicleHud = $('#vehicleHud');
const vehicleName = $('#vehicleName');
const vehicleSpeed = $('#vehicleSpeed');
const joinButton = $('#joinRoomButton');
const publishButton = $('#publishScene');
const deleteRoomButton = $('#deleteRoom');

const avatarInputs = {
  bodyType: $('#avatarBodyType'),
  skin: $('#avatarSkin'),
  hairStyle: $('#avatarHairStyle'),
  hair: $('#avatarHair'),
  shirtStyle: $('#avatarShirtStyle'),
  shirt: $('#avatarShirt'),
  pants: $('#avatarPants'),
  shoes: $('#avatarShoes'),
};

let avatarConfig = sanitizeAvatar(JSON.parse(localStorage.getItem('empresa3d-avatar') || '{}'));
for (const [key, input] of Object.entries(avatarInputs)) input.value = avatarConfig[key] || DEFAULT_AVATAR[key];

$('#joinName').value = localStorage.getItem('empresa3d-name') || '';
$('#joinRoom').value = localStorage.getItem('empresa3d-room') || 'turma-0123';
$('#publishRoom').value = localStorage.getItem('empresa3d-room') || 'turma-0123';

if (!supabase) {
  $('#onlineWarning').textContent = supabaseInitError || 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY na Vercel.';
  joinButton.disabled = true;
  publishButton.disabled = true;
  deleteRoomButton.disabled = true;
}

let savedPerformance = {};
try { savedPerformance = JSON.parse(localStorage.getItem('empresa3d-performance-v3') || '{}'); } catch { savedPerformance = {}; }
const initialQuality = ['low', 'medium', 'high'].includes(savedPerformance.quality) ? savedPerformance.quality : 'low';
const initialShadows = Boolean(savedPerformance.shadows);
const initialSensitivity = THREE.MathUtils.clamp(Number(savedPerformance.sensitivity) || 1, 0.25, 2.5);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xbcc7c4);
scene.fog = new THREE.Fog(0xbcc7c4, 65, 180);

const renderer = new THREE.WebGLRenderer({ antialias: initialQuality === 'high', powerPreference: 'high-performance', precision: 'mediump' });
renderer.domElement.className = 'webgl';
renderer.domElement.tabIndex = 0;
renderer.domElement.setAttribute('aria-label', 'Área 3D do simulador');
renderer.setPixelRatio(Math.min(devicePixelRatio, initialQuality === 'high' ? 1.5 : initialQuality === 'medium' ? 1 : 0.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = initialShadows;
renderer.shadowMap.type = initialQuality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = initialShadows;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.prepend(renderer.domElement);

const gameCamera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.08, 260);
gameCamera.position.set(16, 14, 19);
scene.add(gameCamera);
const topFrustum = 38;
const topCamera = new THREE.OrthographicCamera(-topFrustum, topFrustum, topFrustum, -topFrustum, 0.1, 300);
topCamera.position.set(0, 70, 0.01);
topCamera.up.set(0, 0, -1);
topCamera.lookAt(0, 0, 0);

const perspectiveControls = new OrbitControls(gameCamera, renderer.domElement);
perspectiveControls.target.set(0, 0, 0);
perspectiveControls.enableDamping = true;
perspectiveControls.maxPolarAngle = Math.PI / 2 - 0.03;
perspectiveControls.minDistance = 2;
perspectiveControls.maxDistance = 120;
perspectiveControls.enabled = false;
perspectiveControls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
perspectiveControls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
perspectiveControls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;

const mapControls = new MapControls(topCamera, renderer.domElement);
mapControls.enableDamping = true;
mapControls.enableRotate = false;
mapControls.screenSpacePanning = true;
mapControls.minZoom = 0.35;
mapControls.maxZoom = 8;
mapControls.enabled = false;
mapControls.mouseButtons.LEFT = THREE.MOUSE.PAN;
mapControls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
mapControls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;

const pointerControls = new PointerLockControls(gameCamera, renderer.domElement);
pointerControls.pointerSpeed = initialSensitivity;
let pointerLockPending = false;
let gameReturnMode = 'home';
let activeBuilderCamera = topCamera;

const transform = new TransformControls(activeBuilderCamera, renderer.domElement);
transform.setTranslationSnap(0.25);
transform.setRotationSnap(THREE.MathUtils.degToRad(5));
scene.add(transform.getHelper());

scene.add(new THREE.HemisphereLight(0xffffff, 0x59635e, 2.25));
const sun = new THREE.DirectionalLight(0xfff3d4, 3.2);
sun.position.set(-25, 36, 18);
sun.castShadow = initialShadows;
sun.shadow.mapSize.set(initialQuality === 'high' ? 2048 : initialQuality === 'medium' ? 1024 : 512, initialQuality === 'high' ? 2048 : initialQuality === 'medium' ? 1024 : 512);
sun.shadow.camera.left = -70;
sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70;
sun.shadow.camera.bottom = -70;
scene.add(sun);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(160, 160),
  new THREE.MeshStandardMaterial({ color: 0xc8c2aa, roughness: 1 }),
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = initialShadows;
floor.userData.isFloor = true;
scene.add(floor);

const grid = new THREE.GridHelper(160, 160, 0x343c38, 0x8b938d);
grid.position.y = 0.01;
scene.add(grid);

const world = new THREE.Group();
world.name = 'world';
scene.add(world);
const referenceLayer = new THREE.Group();
scene.add(referenceLayer);
const avatarLayer = new THREE.Group();
scene.add(avatarLayer);
const helperLayer = new THREE.Group();
scene.add(helperLayer);
const previewLayer = new THREE.Group();
scene.add(previewLayer);
const snapMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.16, 0.25, 24),
  new THREE.MeshBasicMaterial({ color: 0xffdf62, transparent: true, opacity: 0.95, depthTest: false, side: THREE.DoubleSide }),
);
snapMarker.rotation.x = -Math.PI / 2;
snapMarker.position.y = 0.035;
snapMarker.renderOrder = 45;
snapMarker.visible = false;
helperLayer.add(snapMarker);

function createFirstPersonBody() {
  const group = new THREE.Group();
  group.name = 'first-person-body';
  group.visible = false;
  const material = (color) => new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false });
  const make = (geometry, color) => {
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.renderOrder = 999;
    return mesh;
  };
  const torso = make(new THREE.BoxGeometry(0.58, 0.38, 0.24), avatarConfig.shirt);
  torso.position.set(0, -0.74, -0.48);
  group.add(torso);
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.36, -0.30, -0.57);
  const leftSleeve = make(new THREE.BoxGeometry(0.17, 0.42, 0.18), avatarConfig.shirt);
  leftSleeve.position.y = -0.18;
  leftArm.add(leftSleeve);
  const leftHand = make(new THREE.SphereGeometry(0.105, 9, 7), avatarConfig.skin);
  leftHand.position.y = -0.43;
  leftArm.add(leftHand);
  group.add(leftArm);
  const rightArm = leftArm.clone(true);
  rightArm.position.x = 0.36;
  for (const child of rightArm.children) child.material = child.material.clone();
  group.add(rightArm);
  group.userData = { torso, leftArm, rightArm };
  gameCamera.add(group);
  return group;
}

const firstPersonBody = createFirstPersonBody();

function refreshFirstPersonAppearance() {
  const rig = firstPersonBody.userData;
  if (!rig) return;
  rig.torso.material.color.set(avatarConfig.shirt);
  rig.leftArm.children[0].material.color.set(avatarConfig.shirt);
  rig.rightArm.children[0].material.color.set(avatarConfig.shirt);
  rig.leftArm.children[1].material.color.set(avatarConfig.skin);
  rig.rightArm.children[1].material.color.set(avatarConfig.skin);
}

function updateFirstPersonBody(delta, moving) {
  if (!firstPersonBody.visible) return;
  const rig = firstPersonBody.userData;
  const bob = moving && !activeVehicle ? Math.sin(elapsed * 10) * 0.018 : 0;
  firstPersonBody.position.y = bob;
  rig.leftArm.rotation.set(0, 0, moving && !activeVehicle ? Math.sin(elapsed * 10) * 0.06 : 0.04);
  rig.rightArm.rotation.set(0, 0, moving && !activeVehicle ? -Math.sin(elapsed * 10) * 0.06 : -0.04);
  if (activeVehicle) {
    rig.torso.visible = false;
    rig.leftArm.position.set(-0.25, -0.32, -0.76);
    rig.rightArm.position.set(0.25, -0.32, -0.76);
    rig.leftArm.rotation.x = -1.05;
    rig.rightArm.rotation.x = -1.05;
  } else {
    rig.torso.visible = true;
    rig.leftArm.position.set(-0.36, -0.30, -0.57);
    rig.rightArm.position.set(0.36, -0.30, -0.57);
    rig.leftArm.rotation.x = 0;
    rig.rightArm.rotation.x = 0;
  }
  if (firstPersonGestureUntil > performance.now()) {
    if (firstPersonGesture === 'wave') {
      rig.rightArm.position.set(0.33, -0.10, -0.65);
      rig.rightArm.rotation.x = -1.45 + Math.sin(elapsed * 13) * 0.34;
      rig.rightArm.rotation.z = -0.75;
    } else if (firstPersonGesture === 'point') {
      rig.rightArm.position.set(0.22, -0.18, -0.72);
      rig.rightArm.rotation.x = -1.58;
      rig.rightArm.rotation.z = -0.18;
    }
  }
}

let appMode = 'home';
let builderView = 'top';
let currentTool = 'select';
let segmentStart = null;
let cableStart = null;
let previewObject = null;
let referencePlane = null;
let selected = null;
const selectedRoots = new Set();
const selectionHelpers = new Map();
let selectionDrag = null;
let transformStartState = null;
let realtimeChannel = null;
let currentRoom = '';
let localPlayer = null;
let lastMoveSent = 0;
let lastPresenceSent = 0;
let lastRemoteSweep = 0;
let toastTimer = null;
let interactionRoot = null;
let canvasPointerStart = null;
let canvasPointerMoved = false;
const remotePlayers = new Map();
const remotePlayerLastSeen = new Map();
const explicitlyDepartedPlayers = new Set();
const keys = new Set();
let staticCollisionBoxes = [];
let dynamicCollisionRoots = [];
let interactionMeshes = [];
let lastInteractionCheck = 0;
const playerCollisionBox = new THREE.Box3();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const centerPointer = new THREE.Vector2(0, 0);
const clock = new THREE.Clock();
let elapsed = 0;
let lastRenderedAt = 0;
let activeVehicle = null;
let firstPersonGesture = '';
let firstPersonGestureUntil = 0;

const settings = {
  grid: Number($('#gridSize').value),
  smartSnap: $('#smartSnap').checked,
  orthogonal: $('#orthogonalMode').checked,
  showMeasurements: $('#showMeasurements').checked,
  wallHeight: Number($('#wallHeightDefault').value),
  wallDepth: Number($('#wallDepthDefault').value),
  wallColor: $('#wallColorDefault').value,
  roadWidth: Number($('#roadWidthDefault').value),
  doorWidth: Number($('#doorWidthDefault').value),
  doorHeight: Number($('#doorHeightDefault').value),
  windowWidth: Number($('#windowWidthDefault').value),
  windowHeight: Number($('#windowHeightDefault').value),
  gateWidth: Number($('#gateWidthDefault').value),
  gateHeight: Number($('#gateHeightDefault').value),
  quality: initialQuality,
  shadows: initialShadows,
  sensitivity: initialSensitivity,
  renderInterval: initialQuality === 'low' ? 1000 / 30 : initialQuality === 'medium' ? 1000 / 45 : 0,
};

const QUALITY_PROFILES = {
  low: { pixelRatio: 0.75, shadowSize: 512, renderInterval: 1000 / 30, fogFar: 135 },
  medium: { pixelRatio: 1, shadowSize: 1024, renderInterval: 1000 / 45, fogFar: 165 },
  high: { pixelRatio: 1.5, shadowSize: 2048, renderInterval: 0, fogFar: 190 },
};

const SHADOW_KINDS = new Set(['wall', 'door', 'slidingGate', 'table', 'chair', 'cabinet', 'shelf', 'rack', 'server', 'stairs']);
function shadowEligible(root) {
  return SHADOW_KINDS.has(root?.userData?.kind);
}

function applyShadowFlagsToRoot(root) {
  const eligible = settings.shadows && shadowEligible(root);
  root?.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = eligible;
    child.receiveShadow = settings.shadows && root.userData.kind !== 'cable';
  });
}

function syncPerformanceControls() {
  $$('.graphics-quality').forEach((control) => { control.value = settings.quality; });
  $$('.shadows-toggle').forEach((control) => { control.checked = settings.shadows; });
  $$('.sensitivity-control').forEach((control) => { control.value = String(settings.sensitivity); });
  $$('.sensitivity-value').forEach((target) => { target.textContent = settings.sensitivity.toFixed(2).replace('.', ','); });
}

function applyPerformanceSettings({ persist = true } = {}) {
  const profile = QUALITY_PROFILES[settings.quality] || QUALITY_PROFILES.low;
  settings.renderInterval = profile.renderInterval;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, profile.pixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = settings.shadows;
  renderer.shadowMap.autoUpdate = settings.shadows;
  renderer.shadowMap.type = settings.quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  sun.castShadow = settings.shadows;
  sun.shadow.mapSize.set(profile.shadowSize, profile.shadowSize);
  if (sun.shadow.map) {
    sun.shadow.map.dispose();
    sun.shadow.map = null;
  }
  floor.receiveShadow = settings.shadows;
  scene.fog.far = profile.fogFar;
  pointerControls.pointerSpeed = settings.sensitivity;
  perspectiveControls.rotateSpeed = 0.65 * settings.sensitivity;
  perspectiveControls.panSpeed = 0.75 * settings.sensitivity;
  mapControls.panSpeed = 0.75 * settings.sensitivity;
  for (const root of world.children) applyShadowFlagsToRoot(root);
  for (const avatar of avatarLayer.children) {
    avatar.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = settings.shadows && settings.quality === 'high';
      child.receiveShadow = false;
    });
  }
  syncPerformanceControls();
  if (persist) {
    localStorage.setItem('empresa3d-performance-v3', JSON.stringify({
      quality: settings.quality,
      shadows: settings.shadows,
      sensitivity: settings.sensitivity,
    }));
  }
}

function setPerformanceQuality(value) {
  settings.quality = ['low', 'medium', 'high'].includes(value) ? value : 'low';
  applyPerformanceSettings();
}

const history = [];
let historyIndex = -1;
let restoringHistory = false;

function setBuilderStatus(message) {
  builderStatus.textContent = message;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
}

function normalizeRoom(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 50);
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function serializeWorld() {
  return world.children.map(serializeObject);
}

function clearWorld() {
  clearSelection();
  for (const root of [...world.children]) {
    world.remove(root);
    disposeRoot(root);
  }
}

function loadWorld(data) {
  clearWorld();
  const objects = Array.isArray(data) ? data : Array.isArray(data?.objects) ? data.objects : [];
  for (const item of objects) {
    const root = createObjectFromData(item, world);
    if (root) world.add(root);
  }
  finalizeLoadedWorld(world);
  for (const root of world.children) applyShadowFlagsToRoot(root);
  refreshValidation();
}

function sceneString() {
  return JSON.stringify(serializeWorld());
}

function commitHistory(label = 'Alteração') {
  if (restoringHistory) return;
  const state = sceneString();
  if (history[historyIndex]?.state === state) return;
  history.splice(historyIndex + 1);
  history.push({ label, state, at: Date.now() });
  if (history.length > 70) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  $('#undoAction').disabled = historyIndex <= 0;
  $('#redoAction').disabled = historyIndex >= history.length - 1;
}

function restoreHistory(index) {
  if (index < 0 || index >= history.length) return;
  restoringHistory = true;
  loadWorld(JSON.parse(history[index].state));
  restoringHistory = false;
  historyIndex = index;
  updateHistoryButtons();
  setBuilderStatus(`${history[index].label} restaurada.`);
}

function undo() { restoreHistory(historyIndex - 1); }
function redo() { restoreHistory(historyIndex + 1); }

function saveLocalVersion() {
  const objects = serializeWorld();
  localStorage.setItem('empresa3d-project-v2', JSON.stringify(objects));
  const versions = JSON.parse(localStorage.getItem('empresa3d-versions-v2') || '[]');
  versions.unshift({ id: crypto.randomUUID(), at: Date.now(), objects });
  localStorage.setItem('empresa3d-versions-v2', JSON.stringify(versions.slice(0, 12)));
  updateVersionList();
  setBuilderStatus('Versão salva neste navegador.');
}

function restoreLocal() {
  const saved = localStorage.getItem('empresa3d-project-v2') || localStorage.getItem('empresa3d-project');
  if (!saved) return false;
  try {
    loadWorld(JSON.parse(saved));
    return true;
  } catch {
    return false;
  }
}

function updateVersionList() {
  const versions = JSON.parse(localStorage.getItem('empresa3d-versions-v2') || '[]');
  $('#versionSelect').innerHTML = versions.length
    ? versions.map((version) => `<option value="${version.id}">${new Date(version.at).toLocaleString('pt-BR')}</option>`).join('')
    : '<option value="">Nenhuma versão salva</option>';
}

function addRoot(root, label = 'Objeto adicionado') {
  world.add(root);
  applyShadowFlagsToRoot(root);
  if (root.userData.kind === 'wall') rebuildWall(root, world);
  if (root.userData.kind === 'cable') updateAllCables(world);
  selectOnly(root);
  commitHistory(label);
  refreshValidation();
  return root;
}

function removeRoots(roots) {
  const affectedWalls = new Set();
  for (const root of roots) {
    if (OPENING_KINDS.has(root.userData.kind) && root.userData.hostWallId) affectedWalls.add(root.userData.hostWallId);
    if (root.userData.kind === 'wall') {
      for (const opening of world.children.filter((item) => item.userData.hostWallId === root.userData.objectId)) {
        opening.userData.hostWallId = '';
        opening.userData.hostOffset = 0;
      }
    }
    for (const cable of [...world.children].filter((item) => item.userData.kind === 'cable' && (item.userData.fromId === root.userData.objectId || item.userData.toId === root.userData.objectId))) {
      world.remove(cable);
      disposeRoot(cable);
    }
    world.remove(root);
    disposeRoot(root);
  }
  for (const id of affectedWalls) {
    const wall = world.children.find((item) => item.userData.objectId === id);
    if (wall) rebuildWall(wall, world);
  }
  clearSelection();
  updateAllCables(world);
  commitHistory('Objetos apagados');
  refreshValidation();
}

function clearSelectionHelpers() {
  for (const helper of selectionHelpers.values()) helperLayer.remove(helper);
  selectionHelpers.clear();
}

function refreshSelectionHelpers() {
  clearSelectionHelpers();
  for (const root of selectedRoots) {
    const helper = new THREE.BoxHelper(root, root === selected ? 0xffd75e : 0x74c7ff);
    helper.material.depthTest = false;
    helper.renderOrder = 30;
    helperLayer.add(helper);
    selectionHelpers.set(root.userData.objectId, helper);
  }
}

function clearSelection() {
  selectedRoots.clear();
  selected = null;
  transform.detach();
  refreshSelectionHelpers();
  syncPropertiesForm();
}

function attachTransform() {
  transform.detach();
  if (selected && selectedRoots.size === 1 && !selected.userData.locked && selected.userData.kind !== 'cable') {
    transform.camera = activeBuilderCamera;
    transform.attach(selected);
  }
}

function selectObject(root, additive = false) {
  if (!additive) selectedRoots.clear();
  if (root) {
    if (additive && selectedRoots.has(root)) selectedRoots.delete(root);
    else selectedRoots.add(root);
  }
  selected = root && selectedRoots.has(root) ? root : [...selectedRoots].at(-1) || null;
  attachTransform();
  refreshSelectionHelpers();
  syncPropertiesForm();
}

function selectOnly(root) { selectObject(root, false); }

function refreshValidation() {
  const issues = networkValidation(world);
  const target = $('#validationResults');
  target.classList.toggle('has-issues', issues.length > 0);
  target.innerHTML = issues.length
    ? `<ul>${issues.slice(0, 12).map((issue) => `<li>${escapeHtml(issue)}</li>`).join('')}</ul>`
    : '<span class="ok">✓ Nenhum problema encontrado.</span>';
  if (selected?.userData.kind === 'switch') updateSwitchPorts(selected);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function getObjectDimensions(root) {
  if (root?.userData?.dimensions) return root.userData.dimensions;
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { width: size.x, height: size.y, depth: size.z };
}

function syncPropertiesForm() {
  const count = selectedRoots.size;
  $('#noSelection').classList.toggle('hidden', count > 0);
  $('#propertiesForm').classList.toggle('hidden', count === 0);
  $('#selectionTitle').textContent = count === 0 ? 'Nenhuma seleção' : count > 1 ? `${count} objetos selecionados` : objectLabel(selected.userData.kind);
  if (!selected) return;

  const meta = selected.userData.meta || {};
  const dimensions = getObjectDimensions(selected);
  $('#propX').value = round(selected.position.x);
  $('#propY').value = round(selected.position.y);
  $('#propZ').value = round(selected.position.z);
  $('#propRotation').value = round(THREE.MathUtils.radToDeg(selected.rotation.y), 1);
  $('#propWidth').value = round(dimensions.width);
  $('#propHeight').value = round(dimensions.height);
  $('#propDepth').value = round(dimensions.depth);
  $('#propColor').value = getFirstColor(selected);
  $('#propLocked').checked = Boolean(selected.userData.locked);
  $('#propName').value = meta.name || '';
  $('#propSector').value = meta.sector || '';
  $('#propNotes').value = meta.notes || '';
  $('#propIp').value = meta.ip || '';
  $('#propMask').value = meta.mask || '';
  $('#propGateway').value = meta.gateway || '';
  $('#propMac').value = meta.mac || '';
  $('#propSwitch').value = meta.switchName || '';
  $('#propPort').value = meta.port || '';
  $('#propPortCount').value = meta.portCount || '';
  $('#propSill').value = selected.userData.sillHeight ?? 1.05;
  $('#propSlideDirection').value = String(selected.userData.slideDirection || 1);

  $('#networkProperties').classList.toggle('hidden', !NETWORK_KINDS.has(selected.userData.kind));
  $('#openingProperties').classList.toggle('hidden', !OPENING_KINDS.has(selected.userData.kind));
  $('#propSill').closest('.field').classList.toggle('hidden', selected.userData.kind !== 'window');
  $('#propSlideDirection').closest('.field').classList.toggle('hidden', selected.userData.kind !== 'slidingGate');
  updateSwitchPorts(selected);
}

function updateSwitchPorts(root) {
  const panel = $('#switchPorts');
  if (!root || root.userData.kind !== 'switch') {
    panel.innerHTML = '';
    return;
  }
  const switchName = String(root.userData.meta?.name || '').trim();
  const count = Math.max(1, Math.min(192, Number(root.userData.meta?.portCount) || 24));
  const connected = new Map();
  for (const item of world.children.filter((candidate) => NETWORK_KINDS.has(candidate.userData.kind))) {
    const meta = item.userData.meta || {};
    if (String(meta.switchName || '').trim().toLowerCase() !== switchName.toLowerCase()) continue;
    const match = String(meta.port || '').match(/(\d+)$/);
    if (match) connected.set(Number(match[1]), meta.name || objectLabel(item.userData.kind));
  }
  panel.innerHTML = `<div class="port-table"><strong>Mapa de portas</strong>${Array.from({ length: Math.min(count, 48) }, (_, index) => {
    const number = index + 1;
    return `<div class="port-row ${connected.has(number) ? 'used' : ''}"><span>${String(number).padStart(2, '0')}</span><span>${escapeHtml(connected.get(number) || 'Livre')}</span></div>`;
  }).join('')}</div>`;
}

function applyProperties() {
  if (!selected) return;
  const root = selected;
  const kind = root.userData.kind;
  const desiredPosition = new THREE.Vector3(Number($('#propX').value), Number($('#propY').value), Number($('#propZ').value));
  const desiredRotation = THREE.MathUtils.degToRad(Number($('#propRotation').value) || 0);
  const dimensions = {
    width: Number($('#propWidth').value),
    height: Number($('#propHeight').value),
    depth: Number($('#propDepth').value),
  };

  root.userData.meta = {
    ...(root.userData.meta || {}),
    name: $('#propName').value.trim(),
    sector: $('#propSector').value.trim(),
    notes: $('#propNotes').value.trim(),
    ip: $('#propIp').value.trim(),
    mask: $('#propMask').value.trim(),
    gateway: $('#propGateway').value.trim(),
    mac: $('#propMac').value.trim(),
    switchName: $('#propSwitch').value.trim(),
    port: $('#propPort').value.trim(),
    portCount: $('#propPortCount').value ? Number($('#propPortCount').value) : '',
  };
  root.userData.locked = $('#propLocked').checked;
  applyObjectColor(root, $('#propColor').value);

  if (SEGMENT_KINDS.has(kind)) {
    const info = getSegmentInfo(root);
    const delta = new THREE.Vector2(desiredPosition.x - info.center.x, desiredPosition.z - info.center.y);
    const center = new THREE.Vector2(desiredPosition.x, desiredPosition.z);
    const length = Math.max(0.1, dimensions.width || info.length);
    const tangent = new THREE.Vector2(Math.cos(-desiredRotation), Math.sin(-desiredRotation));
    const half = tangent.clone().multiplyScalar(length / 2);
    root.userData.segment.start = [center.x - half.x, center.y - half.y];
    root.userData.segment.end = [center.x + half.x, center.y + half.y];
    if (kind === 'wall') {
      root.userData.segment.height = Math.max(0.2, dimensions.height);
      root.userData.segment.thickness = Math.max(0.05, dimensions.depth);
      rebuildWall(root, world);
    } else {
      root.userData.segment.width = Math.max(0.2, dimensions.depth);
      rebuildSegment(root);
    }
    void delta;
  } else {
    root.position.copy(desiredPosition);
    root.rotation.y = desiredRotation;
    if (kind === 'window') root.userData.sillHeight = Math.max(0, Number($('#propSill').value) || 0);
    if (kind === 'slidingGate') root.userData.slideDirection = Number($('#propSlideDirection').value) === -1 ? -1 : 1;
    resizeObject(root, dimensions, world);
    if (OPENING_KINDS.has(kind)) {
      const result = snapOpeningToWall(root, world, root.position, { maxDistance: 3, grid: settings.grid });
      if (!result.ok) setBuilderStatus(result.reason);
    }
  }

  updateAllCables(world);
  attachTransform();
  refreshSelectionHelpers();
  syncPropertiesForm();
  refreshValidation();
  commitHistory('Propriedades alteradas');
  setBuilderStatus('Alterações aplicadas.');
}

function duplicateSelection() {
  if (!selectedRoots.size) return;
  const originals = [...selectedRoots];
  clearSelection();
  for (const original of originals) {
    if (original.userData.kind === 'cable') continue;
    const data = serializeObject(original);
    data.id = crypto.randomUUID();
    if (data.segment) {
      data.segment.start[0] += settings.grid * 2;
      data.segment.end[0] += settings.grid * 2;
    } else {
      data.position[0] += settings.grid * 2;
      data.position[2] += settings.grid * 2;
      if (OPENING_KINDS.has(data.kind)) data.hostWallId = '';
    }
    const copy = createObjectFromData(data, world);
    if (copy) {
      world.add(copy);
      selectedRoots.add(copy);
      selected = copy;
    }
  }
  finalizeLoadedWorld(world);
  attachTransform();
  refreshSelectionHelpers();
  syncPropertiesForm();
  commitHistory('Objetos duplicados');
}

function moveSelectedBy(dx, dz) {
  if (!selectedRoots.size) return;
  for (const root of selectedRoots) {
    if (root.userData.locked) continue;
    if (SEGMENT_KINDS.has(root.userData.kind)) {
      root.userData.segment.start[0] += dx;
      root.userData.segment.start[1] += dz;
      root.userData.segment.end[0] += dx;
      root.userData.segment.end[1] += dz;
      if (root.userData.kind === 'wall') rebuildWall(root, world);
      else rebuildSegment(root);
    } else {
      root.position.x += dx;
      root.position.z += dz;
      if (OPENING_KINDS.has(root.userData.kind)) snapOpeningToWall(root, world, root.position, { maxDistance: 2.5, grid: settings.grid });
    }
  }
  updateAllCables(world);
  refreshSelectionHelpers();
  syncPropertiesForm();
  commitHistory('Objetos movidos');
}

function currentBuilderCamera() { return activeBuilderCamera; }

function pointerCoordinates(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function groundPoint(event) {
  pointerCoordinates(event);
  raycaster.setFromCamera(pointer, currentBuilderCamera());
  return raycaster.intersectObject(floor, false)[0]?.point?.clone() || null;
}

function pickedRoot(event) {
  pointerCoordinates(event);
  raycaster.setFromCamera(pointer, currentBuilderCamera());
  const hits = raycaster.intersectObjects(world.children, true);
  return hits.find((hit) => hit.object.userData.root?.visible)?.object?.userData?.root || null;
}

function projectedScreenBounds(root, camera) {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return null;
  const rect = renderer.domElement.getBoundingClientRect();
  const corners = [];
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
    }
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const corner of corners) {
    corner.project(camera);
    const x = rect.left + (corner.x + 1) * rect.width / 2;
    const y = rect.top + (1 - corner.y) * rect.height / 2;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}

function updateSelectionMarquee() {
  if (!selectionDrag) return;
  const left = Math.min(selectionDrag.startX, selectionDrag.currentX);
  const top = Math.min(selectionDrag.startY, selectionDrag.currentY);
  const width = Math.abs(selectionDrag.currentX - selectionDrag.startX);
  const height = Math.abs(selectionDrag.currentY - selectionDrag.startY);
  selectionMarquee.style.left = `${left}px`;
  selectionMarquee.style.top = `${top}px`;
  selectionMarquee.style.width = `${width}px`;
  selectionMarquee.style.height = `${height}px`;
  selectionMarquee.classList.toggle('crossing', selectionDrag.currentX < selectionDrag.startX);
  selectionMarquee.classList.remove('hidden');
}

function beginAreaSelection(event) {
  selectionDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    additive: event.ctrlKey || event.metaKey,
  };
  mapControls.enabled = false;
  perspectiveControls.enabled = false;
  renderer.domElement.setPointerCapture?.(event.pointerId);
  updateSelectionMarquee();
}

function finishAreaSelection(event) {
  if (!selectionDrag) return false;
  selectionDrag.currentX = event.clientX;
  selectionDrag.currentY = event.clientY;
  const drag = selectionDrag;
  selectionDrag = null;
  selectionMarquee.classList.add('hidden');
  selectionMarquee.classList.remove('crossing');
  try { renderer.domElement.releasePointerCapture?.(drag.pointerId); } catch { /* sem captura ativa */ }
  updateBuilderControlBindings();

  const distance = Math.hypot(drag.currentX - drag.startX, drag.currentY - drag.startY);
  if (distance < 6) {
    selectObject(pickedRoot(event), event.shiftKey || drag.additive);
    return true;
  }

  const selectionRect = {
    minX: Math.min(drag.startX, drag.currentX),
    minY: Math.min(drag.startY, drag.currentY),
    maxX: Math.max(drag.startX, drag.currentX),
    maxY: Math.max(drag.startY, drag.currentY),
  };
  const crossing = drag.currentX < drag.startX;
  const matches = [];
  for (const root of world.children) {
    if (!root.visible || root.userData.kind === 'cable') continue;
    const bounds = projectedScreenBounds(root, activeBuilderCamera);
    if (!bounds) continue;
    const intersects = bounds.maxX >= selectionRect.minX && bounds.minX <= selectionRect.maxX && bounds.maxY >= selectionRect.minY && bounds.minY <= selectionRect.maxY;
    const contained = bounds.minX >= selectionRect.minX && bounds.maxX <= selectionRect.maxX && bounds.minY >= selectionRect.minY && bounds.maxY <= selectionRect.maxY;
    if (crossing ? intersects : contained) matches.push(root);
  }

  if (!drag.additive) selectedRoots.clear();
  for (const root of matches) selectedRoots.add(root);
  selected = [...selectedRoots].at(-1) || null;
  attachTransform();
  refreshSelectionHelpers();
  syncPropertiesForm();
  setBuilderStatus(`${matches.length} objeto(s) encontrados na seleção em área. Pressione Delete para apagar.`);
  return true;
}

function snapGrid(value) {
  return Math.round(value / settings.grid) * settings.grid;
}

function endpointCandidates(kind) {
  const allowed = kind === 'road' ? new Set(['road', 'sidewalk']) : kind === 'sidewalk' ? new Set(['sidewalk', 'road']) : new Set(['wall']);
  const result = [];
  for (const root of world.children.filter((item) => allowed.has(item.userData.kind) && item.userData.segment)) {
    result.push(new THREE.Vector3(root.userData.segment.start[0], 0, root.userData.segment.start[1]));
    result.push(new THREE.Vector3(root.userData.segment.end[0], 0, root.userData.segment.end[1]));
  }
  return result;
}

function smartSnapPoint(raw, start = null, kind = 'wall') {
  const point = raw.clone();
  point.y = 0;
  let reason = '';
  point.x = snapGrid(point.x);
  point.z = snapGrid(point.z);
  const threshold = Math.max(0.34, settings.grid * 1.55);
  if (!settings.smartSnap) {
    if (start && settings.orthogonal) {
      const dx = point.x - start.x;
      const dz = point.z - start.z;
      if (Math.abs(dx) >= Math.abs(dz)) point.z = start.z;
      else point.x = start.x;
      reason = 'modo ortogonal';
    }
    return { point, reason: reason || 'grade' };
  }

  let nearestEndpoint = null;
  let nearestDistance = Infinity;
  for (const endpoint of endpointCandidates(kind)) {
    const distance = endpoint.distanceTo(point);
    if (distance < nearestDistance && distance <= threshold) {
      nearestEndpoint = endpoint;
      nearestDistance = distance;
    }
  }
  if (nearestEndpoint) {
    point.copy(nearestEndpoint);
    reason = 'encaixado ao canto existente';
  } else if (kind === 'wall') {
    const nearestWall = findNearestWall(point, world, threshold);
    if (nearestWall) {
      point.copy(nearestWall.point);
      point.x = round(point.x, 3);
      point.z = round(point.z, 3);
      reason = 'encaixado à parede existente';
    }
  }

  if (start && point.distanceTo(start) > 0.01 && !nearestEndpoint && reason !== 'encaixado à parede existente') {
    const dx = point.x - start.x;
    const dz = point.z - start.z;
    if (settings.orthogonal) {
      if (Math.abs(dx) >= Math.abs(dz)) point.z = start.z;
      else point.x = start.x;
      reason = 'modo ortogonal';
    } else if (Math.abs(dx) < threshold) {
      point.x = start.x;
      reason = 'alinhado na vertical';
    } else if (Math.abs(dz) < threshold) {
      point.z = start.z;
      reason = 'alinhado na horizontal';
    } else {
      const length = Math.hypot(dx, dz);
      const angle = Math.atan2(dz, dx);
      const snappedAngle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
      if (Math.abs(angle - snappedAngle) < THREE.MathUtils.degToRad(5.5)) {
        point.x = start.x + Math.cos(snappedAngle) * length;
        point.z = start.z + Math.sin(snappedAngle) * length;
        point.x = snapGrid(point.x);
        point.z = snapGrid(point.z);
        reason = 'ângulo ajustado';
      }
    }
  }

  return { point, reason: reason || 'encaixado na grade' };
}

function clearPreview() {
  while (previewLayer.children.length) {
    const child = previewLayer.children[0];
    previewLayer.remove(child);
    disposeRoot(child);
  }
  previewObject = null;
  measurementBadge.classList.add('hidden');
  snapMarker.visible = false;
}

function showSnapMarker(point, reason = '') {
  if (!point || appMode !== 'builder') {
    snapMarker.visible = false;
    return;
  }
  snapMarker.position.set(point.x, 0.035, point.z);
  snapMarker.material.color.set(reason.includes('canto') ? 0x66e3a4 : reason.includes('parede') ? 0x71bfff : 0xffdf62);
  snapMarker.visible = true;
}

function showSegmentPreview(start, end, kind, reason = '') {
  clearPreview();
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.02) return;
  const width = kind === 'wall' ? settings.wallDepth : kind === 'road' ? settings.roadWidth : 1.5;
  const height = kind === 'wall' ? settings.wallHeight : 0.05;
  const material = new THREE.MeshBasicMaterial({ color: kind === 'wall' ? settings.wallColor : 0xffdd63, transparent: true, opacity: 0.5, depthTest: false });
  previewObject = new THREE.Mesh(new THREE.BoxGeometry(length, height, width), material);
  previewObject.position.set((start.x + end.x) / 2, kind === 'wall' ? height / 2 : 0.06, (start.z + end.z) / 2);
  previewObject.rotation.y = -Math.atan2(dz, dx);
  previewObject.renderOrder = 40;
  previewLayer.add(previewObject);
  const angle = ((THREE.MathUtils.radToDeg(Math.atan2(dz, dx)) % 360) + 360) % 360;
  measurementBadge.textContent = `${length.toFixed(2)} m · ${angle.toFixed(0)}°${reason ? ` · ${reason}` : ''}`;
  measurementBadge.classList.toggle('hidden', !settings.showMeasurements);
}

function updateBuilderControlBindings() {
  const enabled = appMode === 'builder' && !transform.dragging;
  const allowLeftCamera = currentTool === 'select';
  mapControls.enabled = enabled && builderView === 'top';
  perspectiveControls.enabled = enabled && builderView === 'perspective';
  mapControls.mouseButtons.LEFT = allowLeftCamera ? THREE.MOUSE.PAN : -1;
  perspectiveControls.mouseButtons.LEFT = allowLeftCamera ? THREE.MOUSE.ROTATE : -1;
}

function setTool(tool) {
  currentTool = tool;
  if (tool === 'windowSelect' && builderView !== 'top') setBuilderView('top');
  segmentStart = null;
  cableStart = null;
  canvasPointerStart = null;
  canvasPointerMoved = false;
  clearPreview();
  updateBuilderControlBindings();
  $$('[data-tool]').forEach((button) => button.classList.toggle('active', button.dataset.tool === tool));
  if (tool === 'select') setBuilderStatus('Clique para selecionar. Arraste para mover a câmera. Shift + arraste cria uma seleção em área.');
  else if (tool === 'windowSelect') setBuilderStatus('Arraste um retângulo: esquerda→direita seleciona dentro; direita→esquerda também seleciona o que tocar.');
  else if (tool === 'paint') setBuilderStatus('Clique em uma parede para aplicar a cor escolhida. Se várias paredes estiverem selecionadas, todas serão pintadas.');
  else if (['wall', 'road', 'sidewalk'].includes(tool)) setBuilderStatus(`Clique no início e no final: ${objectLabel(tool)}. Use o botão direito para mover a câmera.`);
  else if (tool === 'cable') setBuilderStatus('Clique no primeiro e depois no segundo equipamento de rede.');
}

function openingDefaults(kind) {
  if (kind === 'door') return { width: settings.doorWidth, height: settings.doorHeight };
  if (kind === 'window') return { width: settings.windowWidth, height: settings.windowHeight };
  if (kind === 'slidingGate') return { width: settings.gateWidth, height: settings.gateHeight };
  return {};
}

function addOpening(kind, point) {
  const root = createObject(kind, point, openingDefaults(kind));
  world.add(root);
  applyShadowFlagsToRoot(root);
  const result = snapOpeningToWall(root, world, point, { maxDistance: 1.8, grid: settings.grid });
  if (!result.ok) {
    world.remove(root);
    disposeRoot(root);
    setBuilderStatus(`${objectLabel(kind)} não adicionada: ${result.reason}`);
    return;
  }
  selectOnly(root);
  commitHistory(`${objectLabel(kind)} adicionada`);
  setBuilderStatus(result.adjusted ? 'A abertura foi reposicionada automaticamente para caber na parede.' : `${objectLabel(kind)} encaixada na parede.`);
}

function createSegmentTool(kind, start, end) {
  const length = start.distanceTo(end);
  if (length < Math.max(0.3, settings.grid)) {
    setBuilderStatus('O segmento ficou pequeno demais. Tente novamente.');
    return null;
  }
  let root;
  if (kind === 'wall') root = createWall(start, end, { height: settings.wallHeight, thickness: settings.wallDepth, color: settings.wallColor, world });
  else if (kind === 'road') root = createRoad(start, end, { width: settings.roadWidth });
  else root = createSidewalk(start, end, { width: 1.5 });
  world.add(root);
  applyShadowFlagsToRoot(root);
  if (kind === 'wall') rebuildWall(root, world);
  clearSelection();
  commitHistory(`${objectLabel(kind)} criada`);
  refreshValidation();
  return root;
}

function handleCableClick(root) {
  if (!root || !NETWORK_KINDS.has(root.userData.kind)) {
    setBuilderStatus('Escolha um equipamento ou ponto de rede.');
    return;
  }
  if (!cableStart) {
    cableStart = root;
    selectOnly(root);
    setBuilderStatus(`Origem: ${root.userData.meta?.name || objectLabel(root.userData.kind)}. Escolha o destino.`);
    return;
  }
  if (root === cableStart) {
    setBuilderStatus('Escolha um equipamento diferente.');
    return;
  }
  const exists = world.children.some((item) => item.userData.kind === 'cable' && ((item.userData.fromId === cableStart.userData.objectId && item.userData.toId === root.userData.objectId) || (item.userData.toId === cableStart.userData.objectId && item.userData.fromId === root.userData.objectId)));
  if (exists) {
    setBuilderStatus('Esses dois equipamentos já possuem um cabo.');
    cableStart = null;
    return;
  }
  const cable = createCable(cableStart, root, { world });
  world.add(cable);
  selectOnly(cable);
  cableStart = null;
  commitHistory('Cabo conectado');
  setBuilderStatus('Cabo de rede conectado.');
}

function paintWallTargets(clickedRoot = null) {
  let targets = [];
  if (clickedRoot?.userData.kind === 'wall' && selectedRoots.has(clickedRoot)) {
    targets = [...selectedRoots].filter((root) => root.userData.kind === 'wall' && !root.userData.locked);
  } else if (clickedRoot?.userData.kind === 'wall' && !clickedRoot.userData.locked) {
    targets = [clickedRoot];
  } else {
    targets = [...selectedRoots].filter((root) => root.userData.kind === 'wall' && !root.userData.locked);
  }
  if (!targets.length) {
    setBuilderStatus('Nenhuma parede disponível para pintar. Selecione ou clique em uma parede.');
    return;
  }
  for (const wall of targets) applyObjectColor(wall, settings.wallColor);
  if (clickedRoot && !selectedRoots.has(clickedRoot)) selectOnly(clickedRoot);
  refreshSelectionHelpers();
  syncPropertiesForm();
  commitHistory('Paredes pintadas');
  setBuilderStatus(`${targets.length} parede(s) pintada(s).`);
}

renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (appMode !== 'builder' || transform.dragging || transform.axis || event.button !== 0) return;

  const wantsAreaSelection = builderView === 'top' && (currentTool === 'windowSelect' || (currentTool === 'select' && event.shiftKey));
  if (wantsAreaSelection) {
    event.preventDefault();
    event.stopPropagation();
    beginAreaSelection(event);
    return;
  }

  if (currentTool === 'select') {
    canvasPointerStart = { x: event.clientX, y: event.clientY };
    canvasPointerMoved = false;
    return;
  }

  const root = pickedRoot(event);
  if (currentTool === 'paint') {
    event.preventDefault();
    event.stopPropagation();
    paintWallTargets(root);
    return;
  }

  if (['wall', 'road', 'sidewalk'].includes(currentTool)) {
    const raw = groundPoint(event);
    if (!raw) return;
    const snapped = smartSnapPoint(raw, segmentStart, currentTool);
    showSnapMarker(snapped.point, snapped.reason);
    if (!segmentStart) {
      segmentStart = snapped.point;
      setBuilderStatus('Ponto inicial definido. Agora clique no ponto final. Esc cancela; F8 ativa o modo ortogonal.');
    } else {
      const created = createSegmentTool(currentTool, segmentStart, snapped.point);
      clearPreview();
      if (created && currentTool === 'wall') {
        segmentStart = snapped.point.clone();
        clearSelection();
        setBuilderStatus('Parede criada. Continue clicando para desenhar paredes conectadas. Pressione Esc para finalizar.');
      } else {
        segmentStart = null;
        setBuilderStatus(`${objectLabel(currentTool)} criada. Clique para iniciar outra.`);
      }
    }
    return;
  }

  if (currentTool === 'cable') {
    handleCableClick(root);
    return;
  }

  if (currentTool.startsWith('add:')) {
    const kind = currentTool.slice(4);
    const raw = groundPoint(event);
    if (!raw) return;
    const snapped = smartSnapPoint(raw, null, kind);
    const point = snapped.point;
    showSnapMarker(point, snapped.reason);
    if (OPENING_KINDS.has(kind)) addOpening(kind, point);
    else {
      if (kind === 'spawnPoint') {
        const previous = world.children.filter((item) => item.userData.kind === 'spawnPoint');
        if (previous.length) removeRoots(previous);
      }
      const created = createObject(kind, point, {});
      if (created) addRoot(created, `${objectLabel(kind)} adicionado`);
    }
    setTool('select');
  }
}, { capture: true });

renderer.domElement.addEventListener('pointermove', (event) => {
  if (selectionDrag) {
    selectionDrag.currentX = event.clientX;
    selectionDrag.currentY = event.clientY;
    updateSelectionMarquee();
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (canvasPointerStart && currentTool === 'select') {
    const distance = Math.hypot(event.clientX - canvasPointerStart.x, event.clientY - canvasPointerStart.y);
    if (distance > 5) canvasPointerMoved = true;
  }
  if (appMode !== 'builder' || !segmentStart || !['wall', 'road', 'sidewalk'].includes(currentTool)) return;
  const raw = groundPoint(event);
  if (!raw) return;
  const snapped = smartSnapPoint(raw, segmentStart, currentTool);
  showSegmentPreview(segmentStart, snapped.point, currentTool, snapped.reason);
  showSnapMarker(snapped.point, snapped.reason);
}, { capture: true });

renderer.domElement.addEventListener('pointerup', (event) => {
  if (selectionDrag && event.button === 0) {
    event.preventDefault();
    event.stopPropagation();
    finishAreaSelection(event);
    return;
  }
  if (appMode !== 'builder' || event.button !== 0 || currentTool !== 'select' || !canvasPointerStart) return;
  const wasClick = !canvasPointerMoved;
  canvasPointerStart = null;
  canvasPointerMoved = false;
  if (wasClick && !transform.dragging && !transform.axis) selectObject(pickedRoot(event), event.shiftKey || event.ctrlKey || event.metaKey);
}, { capture: true });

renderer.domElement.addEventListener('pointercancel', (event) => {
  if (selectionDrag) {
    selectionDrag = null;
    selectionMarquee.classList.add('hidden');
    updateBuilderControlBindings();
  }
  canvasPointerStart = null;
  canvasPointerMoved = false;
  try { renderer.domElement.releasePointerCapture?.(event.pointerId); } catch { /* sem captura */ }
});

transform.addEventListener('dragging-changed', () => {
  updateBuilderControlBindings();
});

transform.addEventListener('mouseDown', () => {
  if (!selected) return;
  transformStartState = {
    segment: snapshotSegment(selected),
    position: selected.position.clone(),
    rotation: selected.rotation.clone(),
    hostWallId: selected.userData.hostWallId || '',
  };
});

transform.addEventListener('objectChange', () => {
  refreshSelectionHelpers();
  syncPropertiesForm();
  updateAllCables(world);
});

transform.addEventListener('mouseUp', () => {
  if (!selected || !transformStartState) return;
  if (SEGMENT_KINDS.has(selected.userData.kind)) {
    applySegmentTransform(selected, transformStartState.segment, world);
  } else if (OPENING_KINDS.has(selected.userData.kind)) {
    const result = snapOpeningToWall(selected, world, selected.position, { maxDistance: 2.6, grid: settings.grid });
    if (!result.ok) {
      selected.position.copy(transformStartState.position);
      selected.rotation.copy(transformStartState.rotation);
      selected.userData.hostWallId = transformStartState.hostWallId;
      const wall = world.children.find((item) => item.userData.objectId === selected.userData.hostWallId);
      if (wall) rebuildWall(wall, world);
      setBuilderStatus(result.reason);
    } else if (result.adjusted) setBuilderStatus('A abertura foi ajustada para não sobrepor outra.');
  } else {
    selected.position.x = snapGrid(selected.position.x);
    selected.position.z = snapGrid(selected.position.z);
  }
  transformStartState = null;
  updateAllCables(world);
  refreshSelectionHelpers();
  syncPropertiesForm();
  commitHistory('Objeto transformado');
});

function setBuilderView(view) {
  builderView = view;
  const target = selected ? selected.position : new THREE.Vector3(0, 0, 0);
  if (view === 'top') {
    activeBuilderCamera = topCamera;
    topCamera.position.x = target.x;
    topCamera.position.z = target.z + 0.01;
    mapControls.target.set(target.x, 0, target.z);
    mapControls.enabled = appMode === 'builder';
    perspectiveControls.enabled = false;
  } else {
    activeBuilderCamera = gameCamera;
    if (gameCamera.position.y < 2.5) gameCamera.position.set(target.x + 12, 12, target.z + 15);
    perspectiveControls.target.copy(target);
    perspectiveControls.enabled = appMode === 'builder';
    mapControls.enabled = false;
  }
  updateBuilderControlBindings();
  transform.camera = activeBuilderCamera;
  attachTransform();
  $('#topView').classList.toggle('active', view === 'top');
  $('#perspectiveView').classList.toggle('active', view === 'perspective');
}

function setPointerLockHint(visible, message = 'Clique na tela para controlar o personagem') {
  if (!pointerLockHint) return;
  pointerLockHint.textContent = message;
  pointerLockHint.classList.toggle('visible', Boolean(visible));
}

async function requestGamePointerLock() {
  if (appMode !== 'game' || pointerControls.isLocked || pointerLockPending) return false;
  if ($('#equipmentModal')?.classList.contains('open')) return false;

  pointerLockPending = true;
  try {
    let result;
    try {
      result = renderer.domElement.requestPointerLock({ unadjustedMovement: true });
      if (result?.then) await result;
    } catch {
      result = renderer.domElement.requestPointerLock();
      if (result?.then) await result;
    }
    return true;
  } catch (error) {
    // Alguns navegadores podem recusar uma captura isolada. Não mostramos
    // contagem regressiva nem bloqueamos os cliques seguintes.
    console.warn('Não foi possível capturar o mouse neste clique:', error);
    setPointerLockHint(true, 'Clique na tela para controlar o personagem');
    return false;
  } finally {
    pointerLockPending = false;
  }
}

function leaveGame() {
  const returnToBuilder = gameReturnMode === 'builder';
  keys.clear();
  document.body.classList.remove('game-keyboard-captured');
  if (document.pointerLockElement) document.exitPointerLock?.();
  $('#equipmentModal').classList.remove('open');
  if (activeVehicle) exitVehicle();
  firstPersonBody.visible = false;
  vehicleHud.classList.add('hidden');
  disconnectRealtime();

  if (returnToBuilder) {
    openBuilder();
    setBuilderStatus('Teste encerrado. Você voltou ao modo editor.');
  } else {
    showHome();
  }
}

function showHome() {
  appMode = 'home';
  gameReturnMode = 'home';
  keys.clear();
  setPointerLockHint(false);
  document.body.classList.remove('game-keyboard-captured');
  document.exitPointerLock?.();
  mapControls.enabled = false;
  perspectiveControls.enabled = false;
  transform.detach();
  homeOverlay.classList.remove('hidden');
  builderUi.classList.add('hidden');
  gameUi.classList.add('hidden');
  grid.visible = true;
  referenceLayer.visible = true;
  helperLayer.visible = true;
  setBuilderOnlyObjectsVisible(true);
  disconnectRealtime();
}

function openBuilder() {
  appMode = 'builder';
  gameReturnMode = 'home';
  keys.clear();
  setPointerLockHint(false);
  homeOverlay.classList.add('hidden');
  builderUi.classList.remove('hidden');
  gameUi.classList.add('hidden');
  grid.visible = $('#showGrid').checked;
  referenceLayer.visible = true;
  helperLayer.visible = true;
  setBuilderOnlyObjectsVisible(true);
  setBuilderView(builderView);
  attachTransform();
  setTool('select');
}

function openEquipment(meta) {
  $('#modalName').textContent = meta.name || 'Equipamento';
  $('#modalSector').textContent = meta.sector || '-';
  $('#modalIp').textContent = meta.ip || '-';
  $('#modalMask').textContent = meta.mask || '-';
  $('#modalGateway').textContent = meta.gateway || '-';
  $('#modalSwitch').textContent = meta.switchName || '-';
  $('#modalPort').textContent = meta.port || '-';
  $('#modalNotes').textContent = meta.notes || '';
  $('#equipmentModal').classList.add('open');
  document.exitPointerLock?.();
}

function closeEquipment() {
  $('#equipmentModal').classList.remove('open');
  if (appMode === 'game') {
    // Não tenta prender o mouse automaticamente logo após o navegador soltá-lo.
    // O próximo clique na área 3D retoma o controle imediatamente.
    setPointerLockHint(true, 'Clique na tela para continuar');
  }
}

function makeRemoteAvatar(player) {
  const root = createAvatar(player);
  avatarLayer.add(root);
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = settings.shadows && settings.quality === 'high';
    child.receiveShadow = false;
  });
  return root;
}

function upsertRemote(player) {
  if (!player?.id || player.id === localPlayer?.id || explicitlyDepartedPlayers.has(player.id)) return;
  remotePlayerLastSeen.set(player.id, performance.now());
  let avatar = remotePlayers.get(player.id);
  if (!avatar) {
    avatar = makeRemoteAvatar(player);
    remotePlayers.set(player.id, avatar);
    showToast(`${player.name || 'Uma pessoa'} entrou`);
  }
  applyAvatarState(avatar, player);
  avatar.visible = !player.inVehicle;
  updatePlayersList();
}

function removeRemote(id) {
  for (const vehicle of world.children) {
    if (['car', 'motorcycle'].includes(vehicle.userData.kind) && vehicle.userData.driverId === id) {
      vehicle.userData.driverId = '';
      vehicle.userData.speed = 0;
    }
  }
  const avatar = remotePlayers.get(id);
  if (!avatar) return;
  avatarLayer.remove(avatar);
  disposeRoot(avatar);
  remotePlayers.delete(id);
  remotePlayerLastSeen.delete(id);
  updatePlayersList();
}

function clearAvatars() {
  for (const avatar of [...avatarLayer.children]) {
    avatarLayer.remove(avatar);
    disposeRoot(avatar);
  }
  remotePlayers.clear();
  remotePlayerLastSeen.clear();
  explicitlyDepartedPlayers.clear();
  updatePlayersList();
}

function updatePlayersList() {
  const items = [];
  if (localPlayer) items.push(`${localPlayer.name} (você)`);
  for (const avatar of remotePlayers.values()) items.push(avatar.userData.playerName || 'Visitante');
  playersList.innerHTML = items.sort().map((name) => `<li>${escapeHtml(name)}</li>`).join('');
}

function flattenPresenceState(state) {
  return Object.values(state || {}).flatMap((entries) => Array.isArray(entries) ? entries : []);
}

function markPlayerLeft(id) {
  if (!id || id === localPlayer?.id) return;
  explicitlyDepartedPlayers.add(id);
  removeRemote(id);
}

function syncPresencePlayers() {
  if (!realtimeChannel) return;
  const seen = new Set();
  for (const player of flattenPresenceState(realtimeChannel.presenceState())) {
    if (!player?.id || player.id === localPlayer?.id || explicitlyDepartedPlayers.has(player.id)) continue;
    seen.add(player.id);
    upsertRemote(player);
  }
  for (const id of [...remotePlayers.keys()]) if (!seen.has(id)) removeRemote(id);
}

async function broadcast(event, payload) {
  if (!realtimeChannel) return;
  await realtimeChannel.send({ type: 'broadcast', event, payload });
}


function getSpawnTransform({ randomize = false } = {}) {
  const marker = world.children.find((root) => root.userData.kind === 'spawnPoint');
  if (!marker) return { x: 0, z: 12, ry: 0 };
  const spread = randomize ? 0.75 : 0;
  const angle = Math.random() * Math.PI * 2;
  return {
    x: marker.position.x + Math.cos(angle) * spread,
    z: marker.position.z + Math.sin(angle) * spread,
    ry: marker.rotation.y,
  };
}

function setBuilderOnlyObjectsVisible(visible) {
  for (const root of world.children) if (root.userData.kind === 'spawnPoint') root.visible = visible && !root.userData.hidden;
}

function applyVehicleState(payload) {
  if (!payload?.objectId) return;
  const vehicle = world.children.find((root) => root.userData.objectId === payload.objectId && ['car', 'motorcycle'].includes(root.userData.kind));
  if (!vehicle || vehicle === activeVehicle) return;
  vehicle.position.set(Number(payload.x) || 0, 0, Number(payload.z) || 0);
  vehicle.rotation.y = Number(payload.ry) || 0;
  vehicle.userData.speed = Number(payload.speed) || 0;
  vehicle.userData.driverId = payload.driverId || '';
}

function vehicleCollisionAt(vehicle, position) {
  const original = vehicle.position.clone();
  vehicle.position.copy(position);
  vehicle.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(vehicle).expandByScalar(-0.08);
  vehicle.position.copy(original);
  vehicle.updateMatrixWorld(true);
  for (const staticBox of staticCollisionBoxes) if (staticBox.intersectsBox(box)) return true;
  for (const other of world.children) {
    if (other === vehicle || !['car', 'motorcycle'].includes(other.userData.kind)) continue;
    if (new THREE.Box3().setFromObject(other).intersectsBox(box)) return true;
  }
  return false;
}

function enterVehicle(vehicle) {
  if (!vehicle || !['car', 'motorcycle'].includes(vehicle.userData.kind)) return;
  if (vehicle.userData.driverId && vehicle.userData.driverId !== localPlayer?.id) {
    showToast('Esse veículo já está sendo usado.');
    return;
  }
  activeVehicle = vehicle;
  vehicle.userData.driverId = localPlayer?.id || 'solo';
  vehicle.userData.speed = Number(vehicle.userData.speed) || 0;
  if (localPlayer) localPlayer = { ...localPlayer, inVehicle: vehicle.userData.objectId };
  vehicleName.textContent = objectLabel(vehicle.userData.kind);
  vehicleHud.classList.remove('hidden');
  const seat = new THREE.Vector3(0, vehicle.userData.kind === 'motorcycle' ? 1.43 : 1.25, vehicle.userData.kind === 'motorcycle' ? 0.10 : -0.18);
  vehicle.localToWorld(seat);
  gameCamera.position.copy(seat);
  gameCamera.rotation.set(0, vehicle.rotation.y, 0);
  broadcast('vehicle_state', {
    objectId: vehicle.userData.objectId, x: vehicle.position.x, z: vehicle.position.z,
    ry: vehicle.rotation.y, speed: vehicle.userData.speed, driverId: vehicle.userData.driverId,
  }).catch(() => {});
  showToast(`Você entrou no ${objectLabel(vehicle.userData.kind).toLowerCase()}.`);
}

function exitVehicle() {
  if (!activeVehicle) return;
  const vehicle = activeVehicle;
  const side = new THREE.Vector3(vehicle.userData.kind === 'motorcycle' ? 1.0 : 1.35, 0, 0).applyQuaternion(vehicle.quaternion);
  let exitPosition = vehicle.position.clone().add(side);
  exitPosition.y = 1.7;
  if (collides(exitPosition)) exitPosition = vehicle.position.clone().sub(side).setY(1.7);
  gameCamera.position.copy(exitPosition);
  vehicle.userData.driverId = '';
  vehicle.userData.speed = 0;
  if (localPlayer) localPlayer = { ...localPlayer, inVehicle: '' };
  broadcast('vehicle_state', {
    objectId: vehicle.userData.objectId, x: vehicle.position.x, z: vehicle.position.z,
    ry: vehicle.rotation.y, speed: 0, driverId: '',
  }).catch(() => {});
  activeVehicle = null;
  vehicleHud.classList.add('hidden');
  showToast('Você saiu do veículo.');
}

function updateDrivenVehicle(delta) {
  if (!activeVehicle) return false;
  const config = activeVehicle.userData.vehicle;
  let speed = Number(activeVehicle.userData.speed) || 0;
  const throttle = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
  const steering = Number(keys.has('KeyA') || keys.has('ArrowLeft')) - Number(keys.has('KeyD') || keys.has('ArrowRight'));
  if (throttle > 0) speed += config.acceleration * delta;
  else if (throttle < 0) speed -= config.acceleration * 0.72 * delta;
  else speed = THREE.MathUtils.damp(speed, 0, config.drag, delta);
  if (keys.has('Space')) speed = THREE.MathUtils.damp(speed, 0, config.brake, delta);
  speed = THREE.MathUtils.clamp(speed, -config.reverseMax, config.maxSpeed);
  const steerStrength = config.steerRate * Math.min(1, Math.abs(speed) / 3.2);
  activeVehicle.rotation.y += steering * steerStrength * delta * (speed >= 0 ? 1 : -1);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(activeVehicle.quaternion);
  const next = activeVehicle.position.clone().addScaledVector(forward, speed * delta);
  if (!vehicleCollisionAt(activeVehicle, next)) activeVehicle.position.copy(next);
  else speed = 0;
  activeVehicle.userData.speed = speed;
  const seat = new THREE.Vector3(0, activeVehicle.userData.kind === 'motorcycle' ? 1.43 : 1.25, activeVehicle.userData.kind === 'motorcycle' ? 0.10 : -0.18);
  activeVehicle.localToWorld(seat);
  gameCamera.position.copy(seat);
  vehicleSpeed.textContent = `${Math.round(Math.abs(speed) * 3.6)} km/h`;
  return Math.abs(speed) > 0.12;
}

function disconnectRealtime({ announce = true } = {}) {
  const oldChannel = realtimeChannel;
  const oldPlayer = localPlayer;
  realtimeChannel = null;
  currentRoom = '';

  if (oldChannel && supabase) {
    // A interface sai imediatamente. A limpeza online continua sem bloquear a tela.
    void (async () => {
      if (announce && oldPlayer?.id) {
        const leaveSignal = oldChannel.send({
          type: 'broadcast',
          event: 'player_left',
          payload: { id: oldPlayer.id, leftAt: Date.now() },
        });
        const untrackSignal = typeof oldChannel.untrack === 'function' ? oldChannel.untrack() : Promise.resolve();
        await Promise.race([
          Promise.allSettled([leaveSignal, untrackSignal]),
          new Promise((resolve) => setTimeout(resolve, 220)),
        ]);
      }
      await supabase.removeChannel(oldChannel).catch(() => {});
    })();
  }

  clearAvatars();
  localPlayer = null;
}

function announcePageExit(event) {
  if (event?.type === 'pagehide' && event.persisted) return;
  const channel = realtimeChannel;
  const player = localPlayer;
  if (!channel || !player?.id) return;
  // Envia imediatamente antes de fechar/recarregar a página. O navegador pode
  // interromper a aba a qualquer momento, por isso não aguardamos a Promise.
  channel.send({ type: 'broadcast', event: 'player_left', payload: { id: player.id, leftAt: Date.now() } }).catch(() => {});
  channel.untrack?.().catch(() => {});
}

async function loadPublishedScene(room) {
  if (!supabase) return { ok: false, reason: 'Supabase não configurado.' };
  const { data, error } = await supabase.from('scenes').select('scene').eq('room_code', room).maybeSingle();
  if (error) return { ok: false, reason: error.message };
  if (!data?.scene) return { ok: false, reason: 'not-found' };
  const objects = Array.isArray(data.scene) ? data.scene : data.scene.objects;
  if (!Array.isArray(objects)) return { ok: false, reason: 'Cenário incompatível.' };
  loadWorld(objects);
  return { ok: true };
}

async function joinOnline(name, room) {
  if (!supabase) return;
  gameReturnMode = 'home';
  joinButton.disabled = true;
  $('#onlineWarning').textContent = 'Entrando na sala...';
  disconnectRealtime();
  const loaded = await loadPublishedScene(room);
  if (!loaded.ok) {
    joinButton.disabled = false;
    $('#onlineWarning').textContent = loaded.reason === 'not-found' ? 'Essa sala ainda não possui cenário publicado.' : `Não foi possível carregar: ${loaded.reason}`;
    return;
  }

  localStorage.setItem('empresa3d-name', name);
  localStorage.setItem('empresa3d-room', room);
  const spawn = getSpawnTransform({ randomize: true });
  localPlayer = {
    id: crypto.randomUUID(),
    name,
    avatar: avatarConfig,
    x: spawn.x,
    z: spawn.z,
    ry: spawn.ry,
    moving: false,
    gesture: '',
    inVehicle: '',
  };
  currentRoom = room;
  realtimeChannel = supabase.channel(`empresa3d:${room}`, {
    config: { private: false, broadcast: { self: false }, presence: { key: localPlayer.id } },
  });

  realtimeChannel
    .on('presence', { event: 'sync' }, syncPresencePlayers)
    .on('presence', { event: 'join' }, syncPresencePlayers)
    .on('presence', { event: 'leave' }, syncPresencePlayers)
    .on('broadcast', { event: 'player_state' }, ({ payload }) => upsertRemote(payload))
    .on('broadcast', { event: 'player_move' }, ({ payload }) => upsertRemote(payload))
    .on('broadcast', { event: 'player_left' }, ({ payload }) => markPlayerLeft(payload?.id))
    .on('broadcast', { event: 'request_state' }, ({ payload }) => {
      if (localPlayer && payload?.requesterId !== localPlayer.id) broadcast('player_state', localPlayer).catch(() => {});
    })
    .on('broadcast', { event: 'gesture' }, ({ payload }) => upsertRemote(payload))
    .on('broadcast', { event: 'vehicle_state' }, ({ payload }) => applyVehicleState(payload))
    .on('broadcast', { event: 'opening' }, ({ payload }) => {
      const opening = world.children.find((root) => root.userData.objectId === payload?.objectId);
      if (opening) setOpeningOpen(opening, Boolean(payload.open));
    })
    .on('broadcast', { event: 'scene_published' }, ({ payload }) => {
      const objects = Array.isArray(payload?.scene) ? payload.scene : payload?.scene?.objects;
      if (Array.isArray(objects)) {
        loadWorld(objects);
        rebuildGameCaches();
        showToast('O cenário foi atualizado.');
      }
    })
    .on('broadcast', { event: 'room_deleted' }, () => {
      $('#onlineWarning').textContent = 'Essa sala foi excluída pelo responsável.';
      showToast('A sala foi excluída.');
      disconnectRealtime({ announce: false });
      showHome();
    })
    .subscribe(async (status, error) => {
      if (status === 'SUBSCRIBED') {
        await realtimeChannel.track(localPlayer);
        await broadcast('player_state', localPlayer);
        await broadcast('request_state', { requesterId: localPlayer.id });
        startGame();
        joinButton.disabled = false;
        $('#onlineWarning').textContent = '';
        showToast(`Sala online: ${room}`);
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        joinButton.disabled = false;
        $('#onlineWarning').textContent = `Não foi possível entrar${error?.message ? `: ${error.message}` : '.'}`;
        disconnectRealtime();
      }
    });
}

async function publishCurrentScene(room, pin) {
  if (!supabase) return;
  const normalizedRoom = normalizeRoom(room);
  if (!normalizedRoom) return setBuilderStatus('Digite um código de sala.');
  if (String(pin || '').length < 4) return setBuilderStatus('Crie uma senha de edição com pelo menos 4 caracteres.');

  publishButton.disabled = true;
  setBuilderStatus('Publicando cenário...');
  localStorage.setItem('empresa3d-room', normalizedRoom);
  const sceneData = serializeWorld();

  let error = null;
  const rpcResult = await supabase.rpc('publish_scene', { p_room: normalizedRoom, p_pin: pin, p_scene: sceneData });
  error = rpcResult.error;

  if (error && /function|schema cache|publish_scene/i.test(error.message || '')) {
    const fallback = await supabase.from('scenes').upsert({ room_code: normalizedRoom, scene: sceneData, updated_at: new Date().toISOString() }, { onConflict: 'room_code' });
    error = fallback.error;
    if (!error) setBuilderStatus('Publicado. Execute o SQL v2 para ativar a senha de edição.');
  }

  if (error) {
    publishButton.disabled = false;
    setBuilderStatus(`Erro ao publicar: ${error.message}`);
    return;
  }

  const publisher = supabase.channel(`empresa3d:${normalizedRoom}`, { config: { private: false, broadcast: { self: false } } });
  publisher.subscribe(async (status) => {
    if (status !== 'SUBSCRIBED') return;
    await publisher.send({ type: 'broadcast', event: 'scene_published', payload: { scene: sceneData } });
    await supabase.removeChannel(publisher);
  });
  publishButton.disabled = false;
  setBuilderStatus(`Cenário publicado na sala ${normalizedRoom}.`);
}

async function deletePublishedRoom(room, pin) {
  if (!supabase) return;
  const normalizedRoom = normalizeRoom(room);
  if (!normalizedRoom) return setBuilderStatus('Digite o código da sala que será excluída.');
  if (String(pin || '').length < 4) return setBuilderStatus('Digite a senha de edição da sala.');
  if (!confirm(`Excluir permanentemente a sala "${normalizedRoom}"? Essa ação não pode ser desfeita.`)) return;

  deleteRoomButton.disabled = true;
  setBuilderStatus('Excluindo sala...');
  const { error } = await supabase.rpc('delete_scene', { p_room: normalizedRoom, p_pin: pin });

  if (error) {
    deleteRoomButton.disabled = false;
    const needsSql = /function|schema cache|delete_scene/i.test(error.message || '');
    setBuilderStatus(needsSql
      ? 'A função de exclusão ainda não existe. Execute o arquivo supabase-atualizacao-v3.sql no Supabase.'
      : `Erro ao excluir: ${error.message}`);
    return;
  }

  const publisher = supabase.channel(`empresa3d:${normalizedRoom}`, { config: { private: false, broadcast: { self: false } } });
  publisher.subscribe(async (status) => {
    if (status !== 'SUBSCRIBED') return;
    await publisher.send({ type: 'broadcast', event: 'room_deleted', payload: { room: normalizedRoom } }).catch(() => {});
    await supabase.removeChannel(publisher).catch(() => {});
  });

  if (localStorage.getItem('empresa3d-room') === normalizedRoom) localStorage.removeItem('empresa3d-room');
  deleteRoomButton.disabled = false;
  setBuilderStatus(`Sala ${normalizedRoom} excluída permanentemente.`);
}

function startSoloGame() {
  disconnectRealtime();
  gameReturnMode = 'builder';
  const spawn = getSpawnTransform();
  localPlayer = { id: crypto.randomUUID(), name: 'Você', avatar: avatarConfig, x: spawn.x, z: spawn.z, ry: spawn.ry, moving: false, gesture: '', inVehicle: '' };
  startGame();
}

function startGame() {
  for (const root of world.children) {
    if (['door', 'window', 'slidingGate'].includes(root.userData.kind)) setOpeningOpen(root, false);
  }
  appMode = 'game';
  keys.clear();
  activeVehicle = null;
  vehicleHud.classList.add('hidden');
  setBuilderOnlyObjectsVisible(false);
  refreshFirstPersonAppearance();
  firstPersonBody.visible = true;
  document.body.classList.add('game-keyboard-captured');
  homeOverlay.classList.add('hidden');
  builderUi.classList.add('hidden');
  gameUi.classList.remove('hidden');
  grid.visible = false;
  referenceLayer.visible = false;
  helperLayer.visible = false;
  mapControls.enabled = false;
  perspectiveControls.enabled = false;
  transform.detach();
  gameCamera.position.set(localPlayer?.x ?? 0, 1.7, localPlayer?.z ?? 12);
  gameCamera.rotation.set(0, localPlayer?.ry ?? 0, 0);
  rebuildGameCaches();
  updatePlayersList();
  exitGameButton.textContent = gameReturnMode === 'builder' ? 'Voltar ao editor' : 'Sair da sala';
  renderer.domElement.focus({ preventScroll: true });
  setPointerLockHint(true);
}

function rebuildGameCaches() {
  staticCollisionBoxes = [];
  dynamicCollisionRoots = [];
  interactionMeshes = [];
  world.updateMatrixWorld(true);

  const staticKinds = new Set(['table', 'chair', 'cabinet', 'shelf', 'computer', 'switch', 'rack', 'server', 'printer']);
  for (const root of world.children) {
    const kind = root.userData.kind;
    if (kind === 'wall') {
      for (const piece of root.userData.collisionPieces || []) {
        const center = new THREE.Vector3().fromArray(piece.center);
        const size = new THREE.Vector3().fromArray(piece.size);
        const localBox = new THREE.Box3().setFromCenterAndSize(center, size);
        staticCollisionBoxes.push(localBox.applyMatrix4(root.matrixWorld));
      }
    } else if (kind === 'door' || kind === 'slidingGate') {
      dynamicCollisionRoots.push(root);
    } else if (staticKinds.has(kind)) {
      staticCollisionBoxes.push(new THREE.Box3().setFromObject(root));
    }

    if (['door', 'window', 'slidingGate', 'car', 'motorcycle'].includes(kind) || NETWORK_KINDS.has(kind)) {
      root.traverse((child) => { if (child.isMesh) interactionMeshes.push(child); });
    }
  }
}

function collides(position) {
  playerCollisionBox.min.set(position.x - 0.29, 0.08, position.z - 0.29);
  playerCollisionBox.max.set(position.x + 0.29, 1.82, position.z + 0.29);
  for (const box of staticCollisionBoxes) if (box.intersectsBox(playerCollisionBox)) return true;
  for (const root of dynamicCollisionRoots) {
    if (root.userData.openProgress > 0.72 || !root.userData.movingPart) continue;
    const box = new THREE.Box3().setFromObject(root.userData.movingPart);
    if (box.intersectsBox(playerCollisionBox)) return true;
  }
  for (const vehicle of world.children) {
    if (vehicle === activeVehicle || !['car', 'motorcycle'].includes(vehicle.userData.kind)) continue;
    if (new THREE.Box3().setFromObject(vehicle).intersectsBox(playerCollisionBox)) return true;
  }
  return false;
}

function findGameInteraction() {
  if (activeVehicle) {
    interactionRoot = activeVehicle;
    interactionHint.textContent = 'E: sair do veículo';
    return;
  }
  raycaster.setFromCamera(centerPointer, gameCamera);
  const hit = raycaster.intersectObjects(interactionMeshes, false).find((item) => item.distance <= 4.2);
  const root = hit?.object?.userData?.root || null;
  interactionRoot = root;
  if (!root) {
    interactionHint.textContent = '';
    return;
  }
  if (['door', 'window', 'slidingGate'].includes(root.userData.kind)) interactionHint.textContent = `E: ${root.userData.open ? 'fechar' : 'abrir'} ${objectLabel(root.userData.kind).toLowerCase()}`;
  else if (['car', 'motorcycle'].includes(root.userData.kind)) interactionHint.textContent = `E: dirigir ${objectLabel(root.userData.kind).toLowerCase()}`;
  else if (NETWORK_KINDS.has(root.userData.kind)) interactionHint.textContent = `E: consultar ${root.userData.meta?.name || objectLabel(root.userData.kind)}`;
  else interactionHint.textContent = '';
}

function gameInteraction() {
  if (activeVehicle) { exitVehicle(); return; }
  const root = interactionRoot;
  if (!root) return;
  if (['door', 'window', 'slidingGate'].includes(root.userData.kind)) {
    setOpeningOpen(root, !root.userData.open);
    broadcast('opening', { objectId: root.userData.objectId, open: root.userData.open }).catch(() => {});
  } else if (['car', 'motorcycle'].includes(root.userData.kind)) enterVehicle(root);
  else if (NETWORK_KINDS.has(root.userData.kind)) openEquipment(root.userData.meta || {});
}

function sendGesture(type) {
  if (!localPlayer || appMode !== 'game') return;
  localPlayer = { ...localPlayer, gesture: type };
  firstPersonGesture = type;
  firstPersonGestureUntil = performance.now() + 1600;
  broadcast('gesture', localPlayer).catch(() => {});
  setTimeout(() => { if (localPlayer) localPlayer.gesture = ''; }, 1600);
}

function initAvatarPreview() {
  const container = $('#avatarPreview');
  const previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  previewRenderer.setPixelRatio(Math.min(devicePixelRatio || 1, settings.quality === 'high' ? 1.5 : settings.quality === 'medium' ? 1 : 0.75));
  previewRenderer.setSize(210, 220);
  previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(previewRenderer.domElement);
  const previewScene = new THREE.Scene();
  const previewCamera = new THREE.PerspectiveCamera(34, 210 / 220, 0.1, 20);
  previewCamera.position.set(0, 1.35, 4.7);
  previewCamera.lookAt(0, 1.05, 0);
  previewScene.add(new THREE.HemisphereLight(0xffffff, 0x4b514c, 2.8));
  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(2, 4, 3);
  previewScene.add(light);
  let previewAvatar = createAvatar({ name: '', avatar: avatarConfig }, { showName: false });
  previewScene.add(previewAvatar);

  const update = () => {
    previewScene.remove(previewAvatar);
    disposeRoot(previewAvatar);
    previewAvatar = createAvatar({ name: '', avatar: avatarConfig }, { showName: false });
    previewScene.add(previewAvatar);
  };
  for (const input of Object.values(avatarInputs)) input.addEventListener('input', () => {
    avatarConfig = sanitizeAvatar(Object.fromEntries(Object.entries(avatarInputs).map(([key, element]) => [key, element.value])));
    localStorage.setItem('empresa3d-avatar', JSON.stringify(avatarConfig));
    refreshFirstPersonAppearance();
    update();
  });

  function renderPreview(time) {
    if (appMode === 'home' && !document.hidden) {
      previewAvatar.rotation.y = Math.sin(time * 0.00045) * 0.35;
      updateAvatar(previewAvatar, 0.016, time * 0.001);
      previewRenderer.render(previewScene, previewCamera);
    }
    requestAnimationFrame(renderPreview);
  }
  requestAnimationFrame(renderPreview);
}

$('#openBuilder').addEventListener('click', openBuilder);
$('#homeFromBuilder').addEventListener('click', showHome);
$('#topView').addEventListener('click', () => setBuilderView('top'));
$('#perspectiveView').addEventListener('click', () => setBuilderView('perspective'));
$('#soloTest').addEventListener('click', startSoloGame);
$('#undoAction').addEventListener('click', undo);
$('#redoAction').addEventListener('click', redo);
$('#saveProject').addEventListener('click', saveLocalVersion);
$('#publishScene').addEventListener('click', () => publishCurrentScene($('#publishRoom').value, $('#publishPin').value));
$('#deleteRoom').addEventListener('click', () => deletePublishedRoom($('#publishRoom').value, $('#publishPin').value));
$('#joinRoomButton').addEventListener('click', () => {
  const name = $('#joinName').value.trim() || 'Visitante';
  const room = normalizeRoom($('#joinRoom').value);
  if (!room) return alert('Digite o código da sala.');
  joinOnline(name, room);
});
$('#exitGame').addEventListener('click', leaveGame);
$('#closeModal').addEventListener('click', closeEquipment);
$('#applyProperties').addEventListener('click', applyProperties);
$('#duplicateObject').addEventListener('click', duplicateSelection);
$('#deleteObject').addEventListener('click', () => removeRoots([...selectedRoots]));
$('#reattachOpening').addEventListener('click', () => {
  if (!selected || !OPENING_KINDS.has(selected.userData.kind)) return;
  detachOpening(selected, world);
  const result = snapOpeningToWall(selected, world, selected.position, { maxDistance: 5, grid: settings.grid });
  setBuilderStatus(result.ok ? 'Abertura reencaixada.' : result.reason);
  commitHistory('Abertura reencaixada');
});

$('#exportProject').addEventListener('click', () => {
  const payload = { version: 2, exportedAt: new Date().toISOString(), objects: serializeWorld() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'empresa-3d-inteligente.json';
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
      commitHistory('Projeto importado');
      saveLocalVersion();
    } catch {
      alert('O arquivo selecionado não é um projeto válido.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
});

$('#restoreVersion').addEventListener('click', () => {
  const id = $('#versionSelect').value;
  const versions = JSON.parse(localStorage.getItem('empresa3d-versions-v2') || '[]');
  const version = versions.find((item) => item.id === id);
  if (!version) return;
  loadWorld(version.objects);
  commitHistory('Versão restaurada');
  setBuilderStatus('Versão restaurada.');
});

$('#choosePlan').addEventListener('click', () => $('#planFile').click());
$('#planFile').addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const objectUrl = URL.createObjectURL(file);
  new THREE.TextureLoader().load(objectUrl, (texture) => {
    while (referenceLayer.children.length) {
      const child = referenceLayer.children[0];
      referenceLayer.remove(child);
      disposeRoot(child);
    }
    const ratio = texture.image.width / texture.image.height;
    referencePlane = new THREE.Mesh(
      new THREE.PlaneGeometry(ratio, 1),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: Number($('#planOpacity').value), side: THREE.DoubleSide, depthWrite: false }),
    );
    referencePlane.rotation.x = -Math.PI / 2;
    referencePlane.position.y = 0.018;
    referenceLayer.add(referencePlane);
    updatePlanTransform();
    URL.revokeObjectURL(objectUrl);
  });
});

function updatePlanTransform() {
  if (!referencePlane) return;
  const scale = Math.max(1, Number($('#planScale').value) || 25);
  referencePlane.scale.set(scale, scale, scale);
  referencePlane.rotation.z = THREE.MathUtils.degToRad(Number($('#planRotation').value) || 0);
  referencePlane.material.opacity = Number($('#planOpacity').value);
}
$('#planOpacity').addEventListener('input', updatePlanTransform);
$('#planScale').addEventListener('input', updatePlanTransform);
$('#planRotation').addEventListener('input', updatePlanTransform);

$$('[data-tab]').forEach((button) => button.addEventListener('click', () => {
  $$('[data-tab]').forEach((item) => item.classList.toggle('active', item === button));
  $$('.tool-section').forEach((section) => section.classList.toggle('active', section.dataset.section === button.dataset.tab));
}));

$$('[data-tool]').forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
$$('[data-add]').forEach((button) => button.addEventListener('click', () => {
  currentTool = `add:${button.dataset.add}`;
  segmentStart = null;
  cableStart = null;
  clearPreview();
  $$('[data-tool]').forEach((item) => item.classList.remove('active'));
  setBuilderStatus(OPENING_KINDS.has(button.dataset.add)
    ? `Clique perto de uma parede para encaixar ${objectLabel(button.dataset.add).toLowerCase()}.`
    : `Clique no piso para adicionar ${objectLabel(button.dataset.add).toLowerCase()}.`);
}));

$$('[data-transform]').forEach((button) => button.addEventListener('click', () => {
  transform.setMode(button.dataset.transform);
  $$('[data-transform]').forEach((item) => item.classList.toggle('active', item === button));
}));

$('#gridSize').addEventListener('change', (event) => {
  settings.grid = Number(event.target.value);
  transform.setTranslationSnap(settings.grid);
});
$('#smartSnap').addEventListener('change', (event) => { settings.smartSnap = event.target.checked; });
$('#orthogonalMode').addEventListener('change', (event) => { settings.orthogonal = event.target.checked; });
$('#showGrid').addEventListener('change', (event) => { grid.visible = event.target.checked; });
$('#showMeasurements').addEventListener('change', (event) => {
  settings.showMeasurements = event.target.checked;
  if (!settings.showMeasurements) measurementBadge.classList.add('hidden');
});
$('#wallHeightDefault').addEventListener('change', (event) => { settings.wallHeight = Math.max(1.8, Number(event.target.value) || 3); });
$('#wallDepthDefault').addEventListener('change', (event) => { settings.wallDepth = Math.max(0.08, Number(event.target.value) || 0.16); });
$('#wallColorDefault').addEventListener('input', (event) => { settings.wallColor = event.target.value; });
$('#roadWidthDefault').addEventListener('change', (event) => { settings.roadWidth = Math.max(2, Number(event.target.value) || 6); });
$('#doorWidthDefault').addEventListener('change', (event) => { settings.doorWidth = Math.max(0.55, Number(event.target.value) || 0.9); });
$('#doorHeightDefault').addEventListener('change', (event) => { settings.doorHeight = Math.max(1.5, Number(event.target.value) || 2.1); });
$('#windowWidthDefault').addEventListener('change', (event) => { settings.windowWidth = Math.max(0.3, Number(event.target.value) || 1.5); });
$('#windowHeightDefault').addEventListener('change', (event) => { settings.windowHeight = Math.max(0.3, Number(event.target.value) || 1.1); });
$('#gateWidthDefault').addEventListener('change', (event) => { settings.gateWidth = Math.max(1.5, Number(event.target.value) || 3.6); });
$('#gateHeightDefault').addEventListener('change', (event) => { settings.gateHeight = Math.max(1.5, Number(event.target.value) || 2.2); });

$$('[data-wall-color]').forEach((button) => button.addEventListener('click', () => {
  settings.wallColor = button.dataset.wallColor;
  $('#wallColorDefault').value = settings.wallColor;
  $$('.color-swatches button').forEach((item) => item.classList.toggle('active', item === button));
}));
$('#paintSelectedWalls').addEventListener('click', () => paintWallTargets());

$$('.graphics-quality').forEach((control) => control.addEventListener('change', (event) => setPerformanceQuality(event.target.value)));
$$('.shadows-toggle').forEach((control) => control.addEventListener('change', (event) => {
  settings.shadows = event.target.checked;
  applyPerformanceSettings();
}));
$$('.sensitivity-control').forEach((control) => control.addEventListener('input', (event) => {
  settings.sensitivity = THREE.MathUtils.clamp(Number(event.target.value) || 1, 0.25, 2.5);
  pointerControls.pointerSpeed = settings.sensitivity;
  syncPerformanceControls();
  localStorage.setItem('empresa3d-performance-v3', JSON.stringify({ quality: settings.quality, shadows: settings.shadows, sensitivity: settings.sensitivity }));
}));

$('#propColor').addEventListener('input', (event) => {
  for (const root of selectedRoots) if (!root.userData.locked) applyObjectColor(root, event.target.value);
  refreshSelectionHelpers();
});
$('#propColor').addEventListener('change', () => {
  if (selectedRoots.size) commitHistory('Cores alteradas');
});

$('#collapseTools').addEventListener('click', () => {
  $('#toolPanel').classList.toggle('collapsed');
  $('#collapseTools').textContent = $('#toolPanel').classList.contains('collapsed') ? '+' : '−';
});

renderer.domElement.addEventListener('click', () => {
  if (appMode !== 'game') return;
  renderer.domElement.focus({ preventScroll: true });
  if (!pointerControls.isLocked) requestGamePointerLock();
  else gameInteraction();
});

const GAME_CAPTURED_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'ShiftLeft', 'ShiftRight',
  'Digit1', 'Digit2', 'Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Backspace', 'Home', 'End', 'PageUp', 'PageDown', 'Slash',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

function preventBrowserCommandWhilePlaying(event) {
  if (appMode !== 'game' || event.code === 'Escape') return;
  if (GAME_CAPTURED_CODES.has(event.code) || event.ctrlKey || event.metaKey || event.altKey) {
    event.preventDefault();
  }
}

addEventListener('keydown', preventBrowserCommandWhilePlaying, { capture: true });
addEventListener('keyup', preventBrowserCommandWhilePlaying, { capture: true });
addEventListener('blur', () => keys.clear());
addEventListener('pagehide', announcePageExit, { capture: true });
addEventListener('beforeunload', announcePageExit, { capture: true });
document.addEventListener('visibilitychange', () => { if (document.hidden) keys.clear(); });
document.addEventListener('pointerlockchange', () => {
  if (appMode !== 'game') return;
  if (pointerControls.isLocked) {
    setPointerLockHint(false);
  } else {
    keys.clear();
    setPointerLockHint(true, 'Clique na tela para continuar');
  }
});

addEventListener('keydown', (event) => {
  keys.add(event.code);
  if (appMode === 'builder') {
    if (event.code === 'F8') {
      event.preventDefault();
      settings.orthogonal = !settings.orthogonal;
      $('#orthogonalMode').checked = settings.orthogonal;
      setBuilderStatus(`Modo ortogonal ${settings.orthogonal ? 'ativado' : 'desativado'}.`);
    }
    else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
    else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') { event.preventDefault(); redo(); }
    else if ((event.ctrlKey || event.metaKey) && event.code === 'KeyD') { event.preventDefault(); duplicateSelection(); }
    else if (event.code === 'Delete' || event.code === 'Backspace') { if (selectedRoots.size && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) removeRoots([...selectedRoots]); }
    else if (event.code === 'Escape') { setTool('select'); clearSelection(); }
    else if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
      event.preventDefault();
      const step = settings.grid * (event.shiftKey ? 5 : 1);
      if (event.code === 'ArrowUp') moveSelectedBy(0, -step);
      if (event.code === 'ArrowDown') moveSelectedBy(0, step);
      if (event.code === 'ArrowLeft') moveSelectedBy(-step, 0);
      if (event.code === 'ArrowRight') moveSelectedBy(step, 0);
    }
  } else if (appMode === 'game' && !event.repeat) {
    if (event.code === 'KeyE') gameInteraction();
    if (event.code === 'Digit1') sendGesture('wave');
    if (event.code === 'Digit2') sendGesture('point');
  }
});
addEventListener('keyup', (event) => keys.delete(event.code));

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  elapsed += delta;

  if (appMode === 'builder') {
    if (builderView === 'top') mapControls.update();
    else perspectiveControls.update();
    for (const helper of selectionHelpers.values()) helper.update();
  }

  if (appMode === 'game') {
    const interactionNow = performance.now();
    if (interactionNow - lastInteractionCheck > 110) {
      findGameInteraction();
      lastInteractionCheck = interactionNow;
    }
    const forward = Number(keys.has('KeyW')) - Number(keys.has('KeyS'));
    const side = Number(keys.has('KeyD')) - Number(keys.has('KeyA'));
    let moving = false;
    if (activeVehicle) {
      moving = updateDrivenVehicle(delta);
    } else {
      moving = Boolean(forward || side);
      if (pointerControls.isLocked && moving) {
        const direction = new THREE.Vector3();
        gameCamera.getWorldDirection(direction);
        direction.y = 0;
        direction.normalize();
        const right = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
        const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 6.4 : 4.2;
        const movement = direction.multiplyScalar(forward).add(right.multiplyScalar(side)).normalize().multiplyScalar(speed * delta);
        const nextX = gameCamera.position.clone();
        nextX.x += movement.x;
        if (!collides(nextX)) gameCamera.position.x = nextX.x;
        const nextZ = gameCamera.position.clone();
        nextZ.z += movement.z;
        if (!collides(nextZ)) gameCamera.position.z = nextZ.z;
        gameCamera.position.y = 1.7;
      }
    }
    updateFirstPersonBody(delta, moving);

    const now = performance.now();
    if (realtimeChannel && now - lastRemoteSweep > 750) {
      // Fallback para quedas bruscas de conexão. Saídas normais são removidas
      // quase imediatamente pelo evento player_left e pelo Presence leave.
      for (const [id, lastSeen] of remotePlayerLastSeen) {
        if (now - lastSeen > 5000) removeRemote(id);
      }
      lastRemoteSweep = now;
    }
    const moveSendInterval = settings.quality === 'low' ? 110 : settings.quality === 'medium' ? 90 : 70;
    if (realtimeChannel && localPlayer && now - lastMoveSent > moveSendInterval) {
      const look = new THREE.Vector3();
      gameCamera.getWorldDirection(look);
      localPlayer = {
        ...localPlayer,
        x: activeVehicle ? activeVehicle.position.x : gameCamera.position.x,
        z: activeVehicle ? activeVehicle.position.z : gameCamera.position.z,
        ry: activeVehicle ? activeVehicle.rotation.y : Math.atan2(look.x, look.z),
        moving,
        inVehicle: activeVehicle?.userData.objectId || '',
      };
      broadcast('player_move', localPlayer).catch(() => {});
      if (activeVehicle) {
        broadcast('vehicle_state', {
          objectId: activeVehicle.userData.objectId,
          x: activeVehicle.position.x,
          z: activeVehicle.position.z,
          ry: activeVehicle.rotation.y,
          speed: activeVehicle.userData.speed,
          driverId: localPlayer.id,
        }).catch(() => {});
      }
      lastMoveSent = now;
      if (now - lastPresenceSent > 1700) {
        realtimeChannel.track(localPlayer).catch(() => {});
        lastPresenceSent = now;
      }
    }
  }

  for (const root of world.children) {
    updateOpeningAnimation(root, delta);
    updateVehicleAnimation(root, delta);
  }
  for (const avatar of remotePlayers.values()) {
    avatar.position.lerp(avatar.userData.targetPosition, 1 - Math.exp(-delta * 12));
    let difference = avatar.userData.targetRotation - avatar.rotation.y;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    avatar.rotation.y += difference * (1 - Math.exp(-delta * 12));
    updateAvatar(avatar, delta, elapsed);
  }

  const renderCamera = appMode === 'builder' ? activeBuilderCamera : gameCamera;
  const renderNow = performance.now();
  if (!settings.renderInterval || renderNow - lastRenderedAt >= settings.renderInterval) {
    renderer.render(scene, renderCamera);
    lastRenderedAt = renderNow;
  }
}

function updateCameraAspect() {
  gameCamera.aspect = innerWidth / innerHeight;
  gameCamera.updateProjectionMatrix();
  const aspect = innerWidth / innerHeight;
  topCamera.left = -topFrustum * aspect;
  topCamera.right = topFrustum * aspect;
  topCamera.top = topFrustum;
  topCamera.bottom = -topFrustum;
  topCamera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', updateCameraAspect);

initAvatarPreview();
updateVersionList();
const restored = restoreLocal();
if (!restored) {
  addRoot(createRoad(new THREE.Vector3(-18, 0, 18), new THREE.Vector3(18, 0, 18), { width: 6 }), 'Cenário inicial');
  clearSelection();
}
commitHistory('Estado inicial');
applyPerformanceSettings({ persist: false });
showHome();
animate();

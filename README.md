# Empresa 3D Inteligente

Aplicação Vite + Three.js + Supabase para construir uma empresa em 3D e explorar o cenário online sem cadastro de visitantes.

## Principais recursos

### Construção precisa
- vista superior ortográfica e vista 3D;
- grade configurável de 10 cm, 25 cm, 50 cm ou 1 m;
- encaixe automático em cantos e paredes existentes;
- alinhamento horizontal, vertical e em ângulos próximos;
- medida e ângulo exibidos durante o desenho;
- posição, rotação e dimensões editáveis numericamente;
- seleção múltipla com Shift;
- mover com as setas, duplicar, bloquear, apagar, desfazer e refazer;
- versões locais, importação e exportação em JSON.

### Estrutura e área externa
- paredes com aberturas reais;
- portas e janelas que se encaixam e procuram espaço livre automaticamente;
- portão deslizante para estacionamento;
- ruas com faixas, calçadas, vagas e áreas verdes;
- planta de referência com escala, rotação e opacidade.

### Móveis e rede
- mesas, cadeiras, armários e estantes;
- computadores, notebooks, impressoras, pontos de rede, switches, roteadores, racks e servidores;
- cabos entre equipamentos;
- IP, máscara, gateway, MAC, switch e porta;
- mapa de portas do switch;
- avisos de IP duplicado, porta ocupada e equipamento sem IP.

### Avatares e multiplayer
- personalização de pele, cabelo, camisa, calça e calçado;
- avatares low-poly leves;
- animação de caminhada, corrida e gestos;
- nomes sobre os personagens;
- posição sincronizada por Supabase Realtime;
- portas e portões sincronizados;
- entrada somente com nome e código da sala.

## Atualização do Supabase

Execute `supabase-setup-v2.sql` no SQL Editor do Supabase. Ele mantém a entrada sem login e adiciona uma senha apenas para quem publica ou substitui o cenário.

A primeira publicação de uma sala define a senha de edição. Depois, a mesma senha será exigida para publicar novamente naquela sala.

## Variáveis da Vercel

```text
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Não use `/rest/v1/` na URL e não use a Secret key.

## Publicação

Configuração esperada na Vercel:

```text
Framework: Vite
Build Command: npm run build
Output Directory: dist
Node.js: 22.x
```

O arquivo `vercel.json` já fixa o build correto.

## Controles

### Construtor
- Shift + clique: seleção múltipla;
- setas: mover pela grade;
- Shift + setas: mover cinco passos;
- Ctrl+Z: desfazer;
- Ctrl+Y: refazer;
- Ctrl+D: duplicar;
- Delete: apagar;
- botão direito: mover a câmera superior ou girar a vista 3D.

### Jogo
- W, A, S, D: andar;
- Shift: correr;
- mouse: olhar;
- E ou clique: interagir;
- 1: acenar;
- 2: apontar.

# Empresa 3D Inteligente

Aplicação Vite + Three.js + Supabase para construir uma empresa em 3D e explorar o cenário online sem cadastro de visitantes.

## Principais recursos

### Construção precisa
- vista superior ortográfica e vista 3D;
- grade configurável de 10 cm, 25 cm, 50 cm ou 1 m;
- encaixe automático em cantos e paredes existentes;
- alinhamento horizontal, vertical e em ângulos próximos;
- medida, ângulo, modo ortogonal (F8) e marcador visual de encaixe;
- posição, rotação e dimensões editáveis numericamente;
- seleção múltipla com Shift e seleção retangular no estilo CAD;
- mover com as setas, copiar, colar, duplicar, bloquear, apagar, desfazer e refazer;
- versões locais, importação e exportação em JSON.

### Estrutura e área externa
- paredes coloríveis com aberturas reais e portas sem frestas;
- piso puxado a partir de uma parede, com pontos de controle e encaixe na parede oposta;
- preenchimento automático do espaço restante ao copiar e colar pisos;
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
- Shift + arraste: seleção retangular;
- esquerda→direita: apenas objetos totalmente dentro;
- direita→esquerda: objetos dentro ou tocados;
- F8: ativar/desativar modo ortogonal;
- setas: mover pela grade;
- Shift + setas: mover cinco passos;
- Ctrl+C: copiar seleção;
- Ctrl+V: colar e alinhar;
- Ctrl+Z: desfazer;
- Ctrl+Y: refazer;
- Ctrl+D: duplicar;
- Delete: apagar;
- botão direito: mover a câmera superior ou girar a vista 3D.

### Jogo
- qualidade gráfica, sombras e sensibilidade ajustáveis;
- W, A, S, D: andar;
- Shift: correr;
- mouse: olhar;
- E ou clique: interagir;
- 1: acenar;
- 2: apontar.


## Central de documentação (V5.6)

Na aba **Rede**, adicione a **Central de documentos**. Selecione o objeto no construtor e use o painel **Biblioteca de documentos** para cadastrar PDFs, links, vídeos e textos. Durante a simulação, aproxime-se da central e pressione **E**.

Para uso online, os documentos precisam estar em URLs públicas ou compartilhadas. Links do Google Drive e YouTube são convertidos automaticamente para visualização no simulador.

A aba **Decoração** também contém uma televisão leve e redimensionável.

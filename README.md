# Rede Empresarial 3D — construtor 3D e multiplayer

Este projeto cria um site leve com duas partes:

1. **Construtor totalmente 3D**, para desenhar paredes, portas, escadas e posicionar os equipamentos da rede.
2. **Modo jogar online**, em primeira pessoa, para os alunos entrarem na mesma sala, caminharem e enxergarem os avatares uns dos outros.

Não usa Firebase. O site fica na **Vercel** e o servidor das salas online fica no **PartyKit**.

## O que já funciona

### Construção 3D

- cenário em perspectiva e vista superior;
- planta do Paint já incluída como referência inicial;
- importação de outra imagem do Paint;
- paredes desenhadas clicando no início e no fim;
- portas ligadas à parede, com vão automático;
- seleção, movimentação e rotação com manipuladores 3D;
- edição das pontas das paredes;
- escadas;
- ponto inicial da visita;
- computadores, switches, pontos de rede, impressoras, roteadores, servidores e access points;
- cadastro de IP, setor, switch e porta;
- salvar no navegador;
- desfazer e refazer;
- exportar e importar o projeto em JSON.

### Modo de jogo

- primeira pessoa com W, A, S e D;
- colisão com paredes, portas e equipamentos;
- portas que abrem ao clicar;
- equipamentos clicáveis com IP, setor, switch e porta;
- avatares simples com nome;
- jogadores e portas sincronizados em uma sala online;
- link e código da sala para compartilhar com a turma.

## Estrutura

```text
rede-empresarial-3d-builder/
├── public/
│   └── planta-referencia.png
├── party/
│   └── server.ts
├── src/
│   ├── data.js
│   ├── editor.js
│   ├── game.js
│   ├── main.js
│   ├── multiplayer.js
│   └── style.css
├── index.html
├── package.json
├── package-lock.json
├── partykit.json
└── vite.config.js
```

## Publicar usando somente o navegador

### 1. Criar o repositório no GitHub

1. Extraia o ZIP.
2. No GitHub, crie um repositório vazio.
3. Entre no repositório e clique em **Add file → Upload files**.
4. Arraste todos os arquivos e pastas extraídos.
5. Clique em **Commit changes**.

Não envie a pasta `node_modules`, caso ela apareça no seu computador.

### 2. Publicar o multiplayer pelo GitHub Codespaces

O Codespaces funciona dentro do navegador.

1. No repositório, clique em **Code → Codespaces → Create codespace on main**.
2. No terminal que aparecer na parte inferior, digite:

```bash
npm install
```

3. Depois digite:

```bash
npm run party:deploy
```

4. Autorize o PartyKit quando a página de login abrir.
5. No final, copie o endereço mostrado. Ele será semelhante a:

```text
rede-3d-online.seuusuario.partykit.dev
```

Copie sem `https://` e sem barra no final.

### 3. Publicar o site na Vercel

1. Na Vercel, clique em **Add New → Project**.
2. Importe o repositório do GitHub.
3. A Vercel deverá identificar o projeto como **Vite**.
4. Abra **Settings → Environment Variables**.
5. Crie esta variável:

```text
Nome: VITE_PARTYKIT_HOST
Valor: rede-3d-online.seuusuario.partykit.dev
```

6. Faça um novo deploy.

## Como desenhar

- **Mouse esquerdo + arrastar:** girar a câmera.
- **Mouse direito + arrastar:** mover a câmera lateralmente.
- **Roda do mouse:** aproximar e afastar.
- **Parede:** clique no início e depois no fim.
- **Shift ao terminar a parede:** força horizontal ou vertical.
- **Alt ao terminar a parede:** continua desenhando a próxima parede.
- **Porta:** clique próximo de uma parede.
- **Selecionar:** clique no objeto e use as setas do manipulador.
- **G:** modo mover.
- **R:** modo girar.
- **Delete:** apaga o item selecionado.
- **Ctrl + Z:** desfazer.
- **Ctrl + Y:** refazer.

Para alterar tamanho, altura, IP ou outras informações, selecione o objeto e use o painel **Propriedades**, à direita.

## Como jogar online

1. No construtor, clique em **Publicar sala**.
2. Escolha um código ou aceite o código sugerido.
3. Copie o link gerado.
4. Envie o link para os alunos.
5. Cada pessoa digita o próprio nome e entra.

Todos que estiverem no mesmo código verão os outros avatares e as portas abertas ou fechadas.

## Testes realizados

O projeto foi compilado com sucesso usando:

```bash
npm run build
```

O servidor PartyKit também foi validado pela CLI incluída no projeto.

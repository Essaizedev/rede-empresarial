# Empresa 3D — Construtor offline e sala online

Não há cadastro ou login para os visitantes.

## Fluxo

1. **Construir sozinho:** abre o editor imediatamente e salva no navegador.
2. **Publicar cenário:** envia o projeto para um código de sala.
3. **Entrar em sala:** o visitante informa somente nome e código da sala.

## Publicar o frontend na Vercel

Na raiz do projeto:

- Framework Preset: `Vite`
- Install Command: padrão
- Build Command: `npm run build`
- Output Directory: `dist`
- Node.js: `22.x`

O projeto deliberadamente não inclui `package-lock.json`. O arquivo `.npmrc` aponta para o registro público do npm.

## Publicar o PartyKit

No GitHub Codespaces:

```bash
cd party-server
npm install --registry=https://registry.npmjs.org/
npm run deploy
```

O PartyKit poderá solicitar autenticação do **responsável que publica o servidor uma única vez**. Os alunos e visitantes nunca fazem login.

Depois, na Vercel, crie a variável:

```text
VITE_PARTYKIT_HOST=rede-empresa-online.seuusuario.partykit.dev
```

Use apenas o domínio, sem `https://`.

## Teste

- Abra o construtor, crie uma parede e publique na sala `turma-0123`.
- Abra o site em duas janelas anônimas.
- Em cada uma, informe um nome diferente e a mesma sala.

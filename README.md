# Empresa 3D Online — teste do multiplayer

Esta versão serve para validar primeiro a parte online:

- duas ou mais pessoas entram no mesmo código de sala;
- cada pessoa aparece como um avatar com nome;
- as posições são atualizadas em tempo real;
- o ambiente 3D funciona com W, A, S, D e mouse;
- o frontend continua usando Vite;
- o PartyKit fica isolado em `party-server/`, portanto a Vercel não instala o PartyKit.

## 1. Publicar o servidor online

No GitHub Codespaces, abra o terminal e execute:

```bash
cd party-server
npm install --registry=https://registry.npmjs.org/
npm run deploy
```

O PartyKit solicitará login/autorização e exibirá um domínio semelhante a:

```text
rede-empresa-online.seuusuario.partykit.dev
```

## 2. Configurar o frontend na Vercel

Na Vercel, em **Settings → Environment Variables**, crie:

```text
VITE_PARTYKIT_HOST
```

Valor: o domínio do PartyKit sem `https://`.

Exemplo:

```text
rede-empresa-online.seuusuario.partykit.dev
```

Depois faça novo deploy.

## 3. Configurações da Vercel

```text
Framework Preset: Vite
Root Directory: ./
Build Command: npm run build
Output Directory: dist
Install Command: npm install --registry=https://registry.npmjs.org/
Node.js: 22.x
```

## 4. Teste

Abra o link da Vercel em dois navegadores ou em dois computadores, use o mesmo código de sala e nomes diferentes.

## Importante sobre o package-lock

O projeto não inclui `package-lock.json`. Isso é intencional para impedir que a Vercel reutilize URLs internas antigas. Apague qualquer `package-lock.json` antigo da raiz do repositório antes do deploy.

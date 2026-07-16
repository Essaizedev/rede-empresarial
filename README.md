# Empresa 3D — Vite + Three.js + Supabase

Não há cadastro nem login para alunos ou visitantes.

## Fluxo

1. **Construir sozinho:** abre o editor e salva no navegador.
2. **Publicar cenário:** grava o cenário no Supabase usando um código de sala.
3. **Entrar na sala:** o visitante informa somente nome e código da sala.
4. **Tempo real:** Supabase Presence sincroniza os jogadores; Broadcast sincroniza portas e atualizações do cenário.

## 1. Criar o Supabase

1. Crie um projeto no painel do Supabase.
2. Abra **SQL Editor > New query**.
3. Cole todo o conteúdo de `supabase-setup.sql` e clique em **Run**.
4. Em **Project Settings > Realtime Settings**, mantenha o Realtime ativo e permita canais públicos.
5. Abra o painel **Connect** ou **Settings > API Keys** e copie:
   - Project URL
   - Publishable key (`sb_publishable_...`)

Nunca use a Secret key no navegador ou na Vercel deste projeto.

## 2. Variáveis na Vercel

No projeto da Vercel, abra **Settings > Environment Variables** e crie:

```text
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Marque Production e Preview. Depois faça um novo deploy.

## 3. Configuração Vercel

```text
Framework Preset: Vite
Root Directory: ./
Install Command: padrão
Build Command: npm run build
Output Directory: dist
Node.js Version: 22.x
```

## 4. Teste

1. Abra **Construir sozinho**.
2. Adicione uma parede ou equipamento.
3. Digite `turma-0123` e clique em **Publicar cenário**.
4. Abra duas janelas anônimas do site.
5. Em cada janela, digite um nome diferente e a mesma sala `turma-0123`.

## Observação de segurança

Este protótipo usa salas públicas porque os participantes não fazem login. Quem souber o código da sala poderá entrar, e quem acessar o construtor poderá publicar naquele código. Use códigos pouco óbvios durante as aulas.

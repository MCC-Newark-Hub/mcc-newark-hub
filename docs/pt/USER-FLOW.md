# Fluxo do App — MCC Newark Hub (v1)

**Documento retroativo** · 19/10/2026 · Descreve as telas que existem hoje e o caminho de cada pessoa.
**Outros idiomas:** [English (original)](../USER-FLOW.md)

Notação: **[Botão]** = clique · → = tela seguinte. Endereços entre `crases`.

---

## 1. Mapa de telas

### Públicas (sem PIN)

| # | Tela | Endereço |
|---|---|---|
| P1 | Entrar (PIN) | `/login` |
| P2 | Portal de inscrição (5 passos + sucesso) | `/events/register` |
| P3 | Consultar inscrição | `/events/lookup` |
| P4 | Check-in por QR | `/events/checkin?reg=…` |
| P5 | Autoatendimento de check-in | `/events/selfcheckin/:eventId` |
| P6 | Escala de portaria do mês | `/portaria/:mês` (ou `/door-schedule`) |
| P7 | Quadro de oração 24h | `/24h-prayers/:id?` |
| P8 | Lista de Louvores (digitar / ver) | `/culto-profetico/:id?` |
| P9 | Repertório do dia | `/songs/:data` |

### Com PIN (portal do secretário e equipe)

| # | Tela | Endereço |
|---|---|---|
| H1 | Início (escolher módulo) | `/` |
| H2 | **Eventos**: uma visão por perfil (ver §3) | `/events` |
| H3 | **Diretório** | `/cms` |
| H4 | **Escalas** | `/schedule` |
| H5 | **Configurações** (só administrador) | `/settings` |
| H6 | Aprendiz (aparece como "em breve", sem tela) | — |

Todas as telas com PIN levam ao `/login` se a sessão acabou. Qualquer endereço desconhecido leva ao `/login`.

---

## 2. Fluxos do participante (público)

### 2.1 Inscrever-se (P2)
1. Abre `/events/register`. **Passo 0:** vê o evento (data, local, valores, vagas) e aceita o aviso de pagamento → **[Começar]**.
   - Se o evento já passou, aparece só o aviso, sem formulário.
2. **Passo 1 — Identificação:** busca o próprio nome no cadastro (ou informa como novo/visitante) e escolhe a igreja → **[Próximo]** (só avança se os campos obrigatórios estiverem válidos).
3. **Passo 2 — Família:** pode somar familiares (busca no cadastro ou digitando) → **[Próximo: Saúde →]** ou **[Voltar]**.
4. **Passo 3 — Saúde e necessidades:** alergias, necessidades especiais, tradução, acessibilidade → **[Próximo: Contato & Termos →]**.
5. **Passo 4 — Contato e termos:** contato (obrigatório para menores), aceite dos termos → **[Enviar]**.
6. **Sucesso:** mostra o número da inscrição e o status. O portal espera o banco confirmar antes de mostrar essa tela.
   - Evento lotado ou prazo vencido: a inscrição vira **pedido de aprovação** (vai para o pastor) ou **lista de espera**.
7. Em qualquer passo, **[Idioma PT/EN]** muda os textos; **[Consultar minha inscrição]** → P3.

> Hoje o e-mail **não** sai sozinho; o comprovante fica só na tela (ver PRD, passo 3).

### 2.2 Consultar a própria inscrição (P3)
`/events/lookup` → digita o nome → vê status, taxa e prazo → pode corrigir dados ou se inscrever, conforme o caso → **[Voltar]** → `/login`.

### 2.3 Check-in
- **P4 (atendente):** lê o QR do crachá → a página abre com o resultado:
  `carregando` → `encontrado` → **[Confirmar]** → `feito`; ou `já fez`, `não encontrado`, `bloqueado`.
- **P5 (autoatendimento):** a pessoa digita o nome e confirma a própria presença.

### 2.4 Páginas de leitura
- **P6 Portaria:** calendário do mês, com setas de mês anterior e seguinte.
- **P7 Oração 24h:** sem `:id`, mostra um cartão por lista ativa → **[cartão]** → quadro de horários → escolhe horário, igreja e nome → **[Confirmar]**.
- **P8 Lista de Louvores:** quem digita escolhe data e culto, preenche, busca hinos, **[Salvar]**, **[Publicar link]**. Com `/:id` de lista publicada, mostra só a folha, com **[Baixar imagem]** e **[Baixar PDF]**.

---

## 3. Fluxos da equipe (com PIN)

### 3.1 Entrar (P1 → H1)
1. Digita o PIN (4 dígitos) → **[Entrar]**.
   - PIN errado: mensagem de erro e o campo limpa.
   - Modo manutenção: só administrador (e o Pr Nairon) entram; os outros veem o aviso.
2. Vai para **H1** (ou para o endereço que tentava abrir). O topo mostra o nome, o idioma, o tema claro/escuro e **[Sair]**.
3. Quem tem mais de um perfil vê **[Trocar função]** e escolhe com qual perfil entrar.

### 3.2 Início (H1)
Mostra um cartão por módulo, conforme o perfil:

| Módulo | Quem vê |
|---|---|
| Eventos | admin, secretaria, pastor, líder de GA, líder de equipe, tesoureiro |
| Diretório | admin, secretaria, pastor |
| Escalas | todos os perfis |
| Aprendiz (em breve) | admin, secretaria, pastor |
| Configurações | admin |

### 3.3 Eventos (H2): menu lateral de cada perfil

| Perfil | Itens do menu |
|---|---|
| **Administrador** | Visão geral · Resumo · Inscrições · Equipes · Aprovações (com contador) · Relatórios · Eventos · Tesouraria · Cozinha · Crachás |
| **Secretaria** | Resumo · Inscrições · Relatórios · Membros · Famílias · Grupos · Membros com Funções (tudo só da sua igreja) |
| **Pastor** | Painel · Resumo · Inscrições · Aprovações · Relatórios · Tesouraria (se permitido) · Membros com Funções · Organograma (só quem está em `ORG_CHART_USER_IDS`) |
| **Líder de GA** | Visão limitada aos seus grupos |
| **Líder de equipe** | Equipe · Membros com Funções, mais abas próprias por equipe (CIA: Classes, Equipe, Professores, Relatórios; Cozinha: Planejamento; Tradução; Louvor) |
| **Tesoureiro** | Balanço · Inscrições · Despesas · Outras Entradas |

**Caminho principal do secretário (Inscrições):**
1. **[Inscrições]** → lista com filtros (pagos, pendentes, atrasados, lista de espera, cancelados) e busca.
2. **[Nova inscrição]** (para quem não usou o portal) → escolhe a pessoa → confirma.
3. Em uma linha: **[Dar baixa]** (marca como pago) · **[Isentar]** · **[Cancelar]** (pede motivo) · **[Reativar]** · **[Editar]** · **[Reenviar e-mail]** → abre o detalhe.
4. Vagas esgotadas, prazo vencido, isenção ou reativação: gera um pedido em **Aprovações**.

**Caminho do pastor (Aprovações):** **[Aprovações]** → vê o pedido (tipo, motivo, nota) → **[Aprovar]** ou **[Recusar]** (com nota) → a inscrição é criada ou ajustada.

### 3.4 Diretório (H3), abas
**Visão Geral** (primeira) · **Diretório** (Membros, Famílias, Igrejas, Polos e Áreas, Organograma) · **Grupos de Assistência** (agrupados por igreja) · **Funções** · **Importar**.
- Pastor e secretaria veem a **Visão Geral** só da(s) igreja(s) do seu acesso; o restante do Diretório é do administrador.
- **Visão Geral:** filtro por igreja · alternar **Visual / Simples** · **[Baixar imagem/PDF]** · clique em "O que falta no cadastro" abre a lista de quem é.
- **Organograma:** **Árvore** ou **Desenho** (a partir de 768 px) · abrir/fechar funções · **[Baixar imagem]** · **[Baixar PDF]**.
- **Importar:** envia a planilha → revisa → confirma.

### 3.5 Escalas (H4), abas
**Portaria** (gerar escala do mês, ajustar à mão, **[Publicar]** → P6) · **Flores** · **Oração 24h** (criar período, ativar no portal, importar planilha, copiar para o WhatsApp) · **Lista de Louvores** (catálogo, aprovar músicas, abrir e editar qualquer lista, **[Finalizar]**).

### 3.6 Configurações (H5), abas
**Usuários & PINs** (criar, **[Editar]**, **[Desativar/Reativar]**, escolher perfis e igrejas) · **Listas** (situação imigratória, categorias de despesa, tipos de entrada, instrumentos, vozes) · **Auditoria** (quem fez o quê e quando).

---

## 4. Estados de erro e vazio (comuns)
- **Sessão vencida:** volta ao `/login` e depois ao endereço que tentava abrir.
- **Falha ao gravar:** um aviso (toast) aparece por 3,5 s; a tela não desfaz o que mostrou (modo otimista).
- **Sem permissão para o módulo:** o cartão nem aparece no Início.
- **Sem dados:** mensagens "nenhum …" nas listas; "ainda não foi publicada" na lista de louvores.

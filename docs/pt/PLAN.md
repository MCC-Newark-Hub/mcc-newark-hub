# Plano de Implementação — MCC Newark Hub

**Retroativo + próximo ciclo** · 19/10/2026 · Parte 1 conta, em etapas pequenas e na ordem certa, **como a v1 deveria ser construída** (e foi, em essência), com o teste de cada etapa. Parte 2 organiza o que falta para fechar a v1 e abre a v2.

**Outros idiomas:** [English (original)](../PLAN.md)

✅ feito e em produção · ⚠️ feito pela metade · ⬜ ainda não

---

## Parte 1 — A v1, etapa por etapa

| # | Etapa | Entrega | Como testar antes de seguir | Estado |
|---|---|---|---|---|
| 1 | **Base** | Projeto React + Vite, rotas, tema claro/escuro, PT/EN | `npm run build` passa; `/login` abre nos dois idiomas | ✅ |
| 2 | **Banco** | Supabase, tabelas de pessoas, igrejas, eventos, inscrições; migrações numeradas | Consultar cada tabela pela API; `relrowsecurity` = `false` nas tabelas novas; refazer o banco do zero com as migrações | ✅ |
| 3 | **Login por PIN** | `app_users`, sessão com validade, perfis, escopo por igreja | PIN certo entra, errado não; sessão vence no tempo configurado; cada perfil vê só o seu menu | ✅ |
| 4 | **Cadastro (Diretório)** | Membros, famílias, grupos, funções, importação por planilha | Criar, editar, excluir um membro; importar uma planilha com erro e ver a revisão; a família tem as duas pontas | ✅ |
| 5 | **Inscrição pública** | Portal de 5 passos, número de inscrição, consulta da própria | Inscrever uma pessoa e uma família no celular; o número é único; repetir a mesma pessoa é barrado | ✅ |
| 6 | **Painel do secretário** | Lista com filtros, dar baixa, isentar, cancelar, reativar, escopo por igreja | Dar baixa e ver o resumo mudar; secretário de Newark **não** vê New York | ✅ |
| 7 | **Regras do evento** | Capacidade, lista de espera, prazo, isenção automática | Lotar o evento e ver a lista de espera; passar do prazo e ver "atrasado" | ✅ |
| 8 | **Aprovações do pastor** | Fluxo de pedidos e decisão | Pedir vaga excedente → pastor aprova → a inscrição nasce | ✅ |
| 9 | **Auditoria** | Registro de quem fez cada mudança | Alterar algo e achar a linha com o nome, a ação e a data | ✅ |
| 10 | **Dia do evento** | Check-in por QR e autoatendimento, crachás em PDF | Ler um QR; ler de novo e ver "já fez"; imprimir um crachá | ✅ |
| 11 | **Equipes e cozinha** | Equipes de serviço, planejamento da cozinha | Atribuir líder e ver o escopo dele; a cozinha calcula por presença | ✅ |
| 12 | **Tesouraria** | Balanço, despesas, outras entradas | Total arrecadado = soma dos pagos; despesa com link de comprovante | ✅ |
| 13 | **Escalas** | Portaria mensal, oração 24h, flores | Gerar o mês; publicar; abrir o link sem PIN; reservar um horário de oração | ✅ |
| 14 | **Lista de Louvores** | Banco, lista por culto, link público, exportação | Criar a lista, publicar, abrir sem PIN, baixar imagem/PDF, bloquear no fim | ✅ |
| 15 | **Organograma e Visão Geral** | Árvore e desenho por função, números do cadastro, acesso por igreja | Pastor com acesso limitado vê só as suas igrejas; os totais batem com o Diretório | ✅ |
| 16 | **Backup e e-mail** | Cópia diária; reenvio do comprovante | Rodar o backup em `dryRun`; reenviar e receber o e-mail | ⚠️ e-mail só manual |
| 17 | **Contas nominais** | Uma conta por pessoa, desativar sem apagar | Pessoa desativada não entra; a auditoria mostra o nome | ⚠️ contas compartilhadas ainda ativas |

**Regra de ouro de cada etapa:** `npm run test` e `npm run build` verdes, atualização do `CHANGELOG.md`, migração aplicada **antes** do deploy. Todo código, comentário, documento e nome novo é escrito em inglês; todo texto visível ao usuário entra nos arquivos de i18n (PT e EN).

---

## Parte 2 — Fechar a v1 e preparar a v2

Cada etapa é pequena e pode ir para produção sozinha.

### 2A. Fechar a v1 (ordem sugerida)

| # | Etapa | Como testar | Depende de |
|---|---|---|---|
| A1 | **Segurança do login:** desligar os PINs de teste do código | PIN de teste deixa de entrar; PINs reais continuam | decisão sobre a conta "Admin" de emergência (hoje mantida) |
| A2 | **Trocar a chave de serviço** exposta e removê-la do arquivo local | Backup e e-mail continuam funcionando com a chave nova | acesso ao painel do Supabase |
| A3 | **Entregar os PINs** nominais aos secretários e desativar as contas compartilhadas | Cada secretário entra; a auditoria mostra o nome | A1 |
| A4 | **Desligar o modo manutenção** | Secretário e pastor entram; o portal público segue normal | A1, A3 |
| A5 | **E-mail automático ao se inscrever** | Inscrever-se com e-mail e receber sem o secretário clicar | A4 |
| A6 | **E-mail ao dar baixa** (comprovante de pagamento) | Dar baixa e receber o e-mail com "Pago" | A5 |
| A7 | **Secretário da igreja no comprovante** (tela e e-mail) | Cada igreja mostra o contato certo | nomes e contatos por igreja |
| A8 | **Agendar a lista de espera automática** | `?dryRun=true` confere com a realidade antes de agendar | A4 |
| A9 | **Passar o texto fixo da interface para o i18n** conforme cada tela for mexida (ex.: `AdminView`, `ClerkView`, `TreasurerView`, troca de função) | Trocar para EN e PT: nenhum texto sem tradução sobra naquela tela | — |

### 2B. Preparar a v2

| # | Etapa | Saída |
|---|---|---|
| B1 | **Entrevista da v2** (uma pergunta por vez) | **PRD v2**: problema, para quem, funções, o que fica de fora |
| B2 | **TRD v2** | Decisões de login real, RLS, pagamento online, backup externo |
| B3 | **Fluxo, design, backend e plano da v2** | Mesmo conjunto de documentos, a partir do PRD v2 |
| B4 | **Medição** | Contadores mínimos do PRD (tempo de baixa, origem da inscrição) |

**Candidatos a v2 já levantados** (a decidir na entrevista): pagamento online; login real com permissões no banco (RLS); aplicativo ou instalação no celular; calendário de eventos e frequência de culto; notificações por WhatsApp/SMS; programação do seminário; Projeto Aprendiz.

---

## Como usar este plano
1. Faça **uma etapa por vez**, na ordem.
2. Só avance depois que o teste da etapa passar.
3. Mantenha o PRD como a régua: se a etapa não serve a uma função do PRD, ela não entra.

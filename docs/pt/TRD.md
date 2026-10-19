# TRD — MCC Newark Hub (v1)

**Documento técnico retroativo** · 19/10/2026 · Baseia-se no [PRD](PRD.md) e descreve o que **já está em produção**, não um plano.
**Outros idiomas:** [English (original)](../TRD.md)

Cada escolha tem uma frase de porquê. Onde a escolha hoje é uma fraqueza, está marcado com ⚠️ e a saída proposta.

---

## 1. Visão geral da arquitetura

```
Navegador (React) ──► Supabase (banco Postgres, chave pública "anon")
        │
        └──► Vercel (publica o site + 3 funções) ──► Resend (e-mail)
                         └──► Supabase (chave de serviço, só no servidor)
```

Não existe servidor próprio: o navegador conversa direto com o banco, e três pequenas funções na Vercel cuidam do que não pode ser feito no navegador (e-mail e backup).

---

## 2. Escolhas

### 2.1 Banco de dados

| Escolha | Por quê |
|---|---|
| **Supabase (Postgres)**, projeto `mcc-newark-hub` | Banco completo, com API pronta e plano gratuito; dispensa construir e manter um servidor. |
| Tempo real só em `registrations` e `approvals` | Só essas duas telas precisam mudar sozinhas quando outro secretário mexe; o resto carrega uma vez e fica leve. |
| Migrações numeradas em `migrations/` (001 a 032) | O desenho do banco fica no repositório e pode ser refeito do zero. ⚠️ Algumas tabelas já existiram só no código; hoje o rito é: nenhuma tabela nova sem migração. |
| **RLS desligado** em todas as 34 tabelas | Foi a forma mais simples de começar. ⚠️ Qualquer pessoa com a chave pública lê e altera tudo (ver §3). |

### 2.2 Login

| Escolha | Por quê |
|---|---|
| **PIN de 4 dígitos** por pessoa, na tabela `app_users` | Os secretários não usam e-mail corporativo nem senha forte no balcão; o PIN é rápido. |
| Perfis múltiplos por pessoa (`sys_roles`) e perfil principal | Uma pessoa pode ser secretária e tesoureira sem ter duas contas. |
| Escopo por igreja (`church`, `churches`) | O secretário só vê a própria igreja; o pastor, só as que lhe cabem. |
| Sessão no `localStorage` com validade ajustável (padrão 2 h, em `app_settings`) | Aparelhos compartilhados fecham sozinhos. |
| Conta **desativável** (`active`) sem apagar | Preserva a auditoria. |
| ⚠️ O PIN é conferido **no navegador** e a tabela é legível com a chave pública; PINs de teste em `src/dev/seeds.js` (repositório público) ainda entram | Fraqueza conhecida de **gravidade alta**. Saída: verificar o PIN em uma função no servidor e sair do `seeds.js`. |
| **Modo manutenção** (`MAINTENANCE_MODE`, hoje ligado) | Interruptor no código para só deixar entrar o administrador durante mudanças. |

### 2.3 Pagamento

| Escolha | Por quê |
|---|---|
| **Presencial**, registrado à mão pelo secretário (`paid`, `exempt`, `fee`) | A igreja recebe em dinheiro ou transferência; evita taxas e cadastro em processador de cartão. |
| **Sem pagamento online** | Decisão do PRD: ainda não há solução que atenda às igrejas. |
| Tesouraria própria (`treasury_expenses`, `treasury_collections`) | Fecha o evento com previsto × arrecadado, despesas e outras entradas, sem planilha. |
| Comprovantes de despesa como **link do Google Drive** | Evita pagar armazenamento de arquivos. |

### 2.4 Hospedagem

| Escolha | Por quê |
|---|---|
| **Vercel**, publicação automática a cada push na `main` | Zero servidor para cuidar; o PR já gera a prévia. |
| Site em `mcc-newark-hub.vercel.app`; o endereço antigo `mcc-newark-events.vercel.app` continua ativo | Não quebra QR codes de crachás e links já impressos ou enviados. |
| Reescrita SPA (`vercel.json`) | Atualizar a página em um link direto não dá erro 404. |
| **Um cron**: `daily-backup`, 09:00 UTC | Backup diário, já que o plano gratuito do Supabase não traz backup gerenciado. |
| Repositório no GitHub (`MCC-Newark-Hub/mcc-newark-hub`), **público** | ⚠️ Facilitou começar, mas expõe o código e os PINs de teste; ver §3. |

### 2.5 Front-end

| Escolha | Por quê |
|---|---|
| **React 19 + Vite** | Rápido de desenvolver, com build leve e testes fáceis. |
| **React Router 6** para as rotas; as abas dentro de cada tela usam `useState` | Rotas servem para links públicos; abas internas não precisam de endereço. |
| Dados carregados de uma vez (`useAppData`) e passados como propriedades | Simples para um app pequeno; sem biblioteca global de estado. |
| **Gravação otimista**: a tela muda na hora e o banco grava depois; falha só avisa | Balcão de secretário não pode esperar o servidor. (Exceção: o portal público espera a confirmação antes de mostrar o sucesso.) |
| **PT e EN** (`src/i18n/strings.js`), todo texto nas duas línguas | Participantes e equipe usam os dois idiomas. |
| **Vitest + Testing Library**, 231 testes | Rede de segurança para mexer sem quebrar. |

### 2.6 Integrações

| Integração | Para quê | Por quê |
|---|---|---|
| **Resend** (`api/send-confirmation.js`) | Reenviar o comprovante por e-mail | Barato, com API simples. A função busca a inscrição no servidor e só envia ao e-mail já cadastrado, para não virar "correio aberto". Hoje é **manual** (botão "reenviar"). |
| **Supabase Storage** (bucket privado `db-backups`) | Guardar o backup diário (30 dias) | Fica no mesmo projeto, sem custo extra. ⚠️ Não protege se o projeto inteiro for apagado. |
| `qrcode` | QR dos crachás e do autoatendimento | Biblioteca pequena, roda no navegador. |
| `html2canvas` + `jspdf` | Exportar imagem e PDF (lista de louvores, organograma, visão geral) | Roda no navegador, sem servidor. Carregadas só quando usadas. |
| `read-excel-file` | Importar planilhas (membros e oração 24h) | Lê `.xlsx` no navegador. |
| `lucide-react` e Google Fonts (Lora, Montserrat) | Ícones e tipografia | Gratuitos. |
| Docs em **mkdocs** (PT/EN/ES), abertos num modal do app | Ajuda dentro do sistema | Publica no GitHub Pages sem custo. |
| `api/auto-cancel-overdue.js` | Mover para a lista de espera quem passou do prazo | ⚠️ Existe, mas **não está agendada**; o secretário faz isso à mão. |

---

## 3. Riscos técnicos (e a saída de cada um)

| # | Risco | Gravidade | Saída |
|---|---|---|---|
| 1 | Chave pública lê e altera todas as tabelas (RLS desligado) | Alta | Ligar RLS com políticas por perfil, o que exige login real (Supabase Auth ou função de servidor) |
| 2 | PINs legíveis e conferidos no navegador | Alta | Verificação no servidor; guardar só o resumo (hash) do PIN |
| 3 | PINs de teste no repositório público | Alta | Desligar o acesso de reserva fora do desenvolvimento |
| 4 | Chave de serviço do Supabase apareceu em arquivo local de configuração | Alta | Remover do arquivo e **trocar a chave** no Supabase |
| 5 | Backup no mesmo projeto | Média | Cópia semanal fora (ex.: Google Drive) |
| 6 | Lista de espera automática sem agenda | Baixa | Agendar depois de testar com `?dryRun=true` |
| 7 | Conteúdo de e-mail só em PT, sem envio automático | Baixa | Gatilhos na inscrição e no pagamento |

---

## 4. Variáveis de ambiente

| Onde | Variáveis |
|---|---|
| Navegador | `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` (chave pública) |
| Servidor (Vercel) | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `CRON_SECRET` |

Os dois pares do Supabase apontam para o mesmo projeto e precisam ficar iguais.

---

## 5. Regra de internacionalização

O inglês é o idioma de origem do código, dos comentários, da documentação e dos nomes de arquivos. Todo texto visível ao usuário fica em `src/i18n/strings.js` com entradas em PT e EN (lidas com `useT()` / `useLang()`); nenhum texto fica escrito dentro dos componentes. Datas, números e moeda usam o formato do idioma. Acrescentar um idioma é acrescentar um conjunto de entradas, sem mexer nos componentes.

---

## 6. Decisões em aberto para a v2

- Como fazer o login de verdade (Supabase Auth com e-mail, ou PIN verificado no servidor)?
- Qual caminho para **pagamento online** (link de pagamento, Zelle manual com conferência, processador)?
- O repositório deve virar **privado**?
- Backup fora do Supabase: onde e com que frequência?

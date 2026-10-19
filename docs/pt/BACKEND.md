# Backend — MCC Newark Hub (v1)

**Esquema retroativo** · 19/10/2026 · Lido do banco de produção (Supabase, projeto `mcc-newark-hub`, 34 tabelas no esquema `public`). Mostra as tabelas principais, as ligações e **quem pode ver e editar** cada dado.

**Outros idiomas:** [English (original)](../BACKEND.md)

> ⚠️ **Leia primeiro.** Hoje o banco **não** impõe permissões: o RLS está desligado em todas as tabelas, então quem tem a chave pública consegue ler e alterar tudo. As regras da seção 4 são aplicadas **só pela tela**. Elas descrevem a intenção, não uma proteção real.

---

## 1. Diagrama das ligações

```
churches ──< church_group_members >── church_groups   (polo / área / região)
   │ pastor_id
   ▼
members ──┬── family_id ──► families   (e families.member_ids[] volta)
          ├── ga_id ─────► assistance_groups ── leader_id ──► members
          └── (id texto) ◄── registrations.member_id
                              ▲  ▲   └── event_id ──► events
approvals.reg_id ─────────────┘  └── invited_by_member_id
approvals.event_id ──► events
rosters.event_id ──► events        rosters.leader_id ──► members
teams.leader_id ──► members
schedule_oracao ── period_id ──► prayer_periods     └── member_id ──► members
door_assignments ── month ──► door_months   └── worker_id ──► door_workers ──► members
worship_list_items ── list_id ──► worship_lists   └── song_id ──► praise_songs
```

Tabelas isoladas (sem chave estrangeira): `app_users`, `app_settings`, `audit_log`, `org_responsibles`, `kitchen_plan`, `kitchen_meta`, `treasury_expenses`, `treasury_collections`, `categories`, `functions`, `instruments`, `voice_types`, `immigration_statuses`, `expense_categories`, `income_types`.

---

## 2. Tabelas e campos principais

### 2.1 Pessoas e igrejas

| Tabela | Para quê | Campos principais |
|---|---|---|
| `members` | Cadastro de pessoas (454) | `id` (texto), `name`, `badge_name`, `gender` (M/F), `category` (faixa de idade), `church`, `role`/`roles[]`, `family_id`, `ga_id`, `is_visitor`, `is_guest`, `immigration_status`, `allergies`, `special_needs`, `voice_type`, `instruments[]` |
| `families` | Famílias | `id`, `name`, `member_ids[]` (**as duas pontas** `members.family_id` e `families.member_ids` convivem; usar `familyIdOf`) |
| `assistance_groups` | Grupos de Assistência (GA) | `id`, `name`, `church`, `leader_id` |
| `churches` | Igrejas | `display`, `city`, `state_code`, `country`, `address`, `pastor_id`, `church_type` (Igreja / Ponto de Pregação), `property_ownership` |
| `church_groups` + `church_group_members` | Polos, áreas e regiões | `name`, `kind`; liga cada grupo às suas igrejas |
| `org_responsibles` | Responsáveis do organograma | `scope` (área/polo/igreja), `ref`, `kind` (responsável/co), `member_id` ou `name` |

### 2.2 Eventos e inscrições

| Tabela | Para quê | Campos principais |
|---|---|---|
| `events` | Seminário/evento | `id`, `name`, `prefix`, `date`, `capacity`, `fees` (jsonb por categoria), `registration_deadline`, `payment_deadline_days`, `payment_extension_days`, `registration_paused`, `registrations_locked` |
| `registrations` | A inscrição (núcleo) | `reg_number` (único), `event_id`, `member_id`, `member_name`, `category`, `church`, `team`, `fee`, `paid`, `exempt`, `cancelled`, `waitlisted`, `excedente`, `presence`, `checked_in_at`, `checkin_method`, `registered_by`, `timeline` (jsonb), `cancel_reason`, `deadline_extended_to` |
| `approvals` | Pedidos ao pastor | `type` (vaga excedente, fora do prazo, isenção, reativação, prorrogação), `status`, `reason`, `pastor_note`, `requested_by`, `resolved_by`, `reg_id` |
| `rosters` / `teams` | Equipes de serviço do evento | `team`, `leader_id`, `member_ids[]`, `assignments` (jsonb) |
| `categories` / `functions` | Listas de faixas e funções | `name`, `sort_order`, `fee_default` |
| `kitchen_plan` / `kitchen_meta` | Planejamento da cozinha | itens, quantidade por pessoa, custo, presença real |
| `treasury_expenses` / `treasury_collections` | Tesouraria | data, descrição, categoria, valor, comprovante (link), tipo |

### 2.3 Escalas e louvores

| Tabela | Para quê |
|---|---|
| `prayer_periods` + `schedule_oracao` | Listas de oração 24h e seus 96 horários; escopo por igreja ou polo; capacidade por horário |
| `door_workers`, `door_months`, `door_assignments` | Portaria: quem pode, o mês gerado e quem serve em cada dia |
| `praise_songs`, `worship_lists`, `worship_list_items` | Banco de louvores, a lista de cada culto e seus itens ordenados |

### 2.4 Acesso e sistema

| Tabela | Para quê | Campos principais |
|---|---|---|
| `app_users` | Contas do portal | `name`, `pin` (único), `sys_role`/`sys_roles[]`, `primary_role`, `church`, `churches[]`, `ga_ids[]`, `team_leads[]`, `active` |
| `app_settings` | Configuração única | `session_ttl_hours` |
| `audit_log` | Quem fez o quê | `actor_name`, `actor_role`, `action`, `entity_type`, `entity_id`, `entity_label`, `details` (jsonb) |
| `immigration_statuses`, `expense_categories`, `income_types`, `instruments`, `voice_types` | Listas editáveis em Configurações | `name`, `sort_order` |

### 2.5 Regras no próprio banco
- `registrations.reg_number` único; **uma inscrição ativa por pessoa e evento** (migração 013).
- Prazos e capacidades checados por `CHECK` (ex.: oração 0–95 horários, `slot_capacity` 1–20, categoria de louvor).
- Um gatilho (`trigger`) impede passar da capacidade de pessoas por horário de oração.
- A função `set_user_churches` grava a lista de igrejas de um usuário.

---

## 3. Quem pode **ver** e **editar** cada dado (regra pela tela)

Legenda: **V** = ver · **E** = editar · **—** = não vê. "Igreja" = só a(s) igreja(s) do acesso.

| Dado | Administrador | Secretaria | Pastor | Líder de GA | Líder de equipe | Tesoureiro | Público (sem PIN) |
|---|---|---|---|---|---|---|---|
| Inscrições | V·E | V·E (igreja) | V (aprova exceções) | V (seus GAs) | V (sua equipe) | V (pagamentos) | cria a sua; consulta a sua |
| Aprovações | V·E | pede | V·E (decide) | — | — | — | — |
| Membros, famílias | V·E | V·E (igreja) | V (funções) | V (seus GAs) | V (equipe) | — | busca para se inscrever |
| Visão Geral e Organograma | V | V (Visão Geral, igreja) | V (Visão Geral; Organograma só o permitido) | — | — | — | — |
| Tesouraria (balanço, despesas, entradas) | V·E | — | V (se permitido) | — | — | V·E | — |
| Cozinha, equipes, crachás | V·E | — | — | — | V·E (sua equipe) | — | — |
| Escalas (portaria, flores, oração) | V·E | V | V | V | V | V | lê portaria e oração; escolhe horário |
| Lista de Louvores | V·E | V | V | V | V·E (Grupo de Louvor) | V | cria e edita com o link; lê a lista publicada |
| Usuários, PINs, listas, auditoria | V·E | — | — | — | — | — | — |

**Dados mais sensíveis:** PINs (`app_users.pin`), contatos e saúde de menores (`members`), valores pagos (`registrations`, `treasury_*`).

---

## 4. Como isso deveria ser no banco (para a v2)

1. **Autenticação real** (Supabase Auth ou função de servidor): sem isso não há como o banco saber quem é quem.
2. **RLS ligado** com as políticas da tabela da seção 3. Ordem sugerida: `app_users` (PIN fora do alcance público), `registrations` e `members`, depois o resto.
3. **Público** só com o que precisa: inserir inscrição, ler o próprio comprovante, ler listas publicadas, escolher horário de oração. Tudo por funções específicas (`rpc`), nunca por tabela aberta.
4. **Escopo por igreja** vira regra do banco: `members`/`registrations` filtrados pela igreja do usuário.
5. **Dado a reforçar:** guardar o PIN apenas como resumo (hash) e limitar tentativas.

*Restrições novas devem vir por migração numerada em `migrations/`, com teste de que a tela continua funcionando para cada perfil.*

---

## 5. Convenções do banco
- Nova tabela: `ALTER TABLE … DISABLE ROW LEVEL SECURITY; GRANT ALL … TO anon, authenticated, service_role;` **(regra de hoje; muda na v2 conforme o item 2)**.
- Verificar `UPDATE`/`DELETE` com `.select()`: o Supabase não dá erro quando a linha não existe.
- Pessoas e famílias usam identificador em **texto**; inscrições e a maioria das tabelas novas, **uuid**.
- Nomes (tabelas, colunas, restrições e identificadores de dados iniciais) são escritos em inglês; os rótulos que o usuário vê vêm dos arquivos de i18n, não do banco.

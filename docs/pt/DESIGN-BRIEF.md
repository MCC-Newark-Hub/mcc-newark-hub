# Briefing de Design — MCC Newark Hub (v1)

**Retroativo** · 19/10/2026 · Extraído de `src/index.css` e de `FRONTEND_SYSTEM_GUIDELINES.md`. Uma regra por item, para valer em todas as telas. Os valores seguem a fonte de verdade: o **código vence o Figma**.

**Outros idiomas:** [English (original)](../DESIGN-BRIEF.md)

> Dê preferência sempre às variáveis (`var(--…)`). Cor "solta" no código ignora o modo escuro.

---

## 1. Cores

| Papel | Variável | Claro | Escuro | Regra |
|---|---|---|---|---|
| Ação principal | `--primary` | `#8B0000` | `#8B0000` | Só um botão principal por tela |
| Hover da ação | `--primary-hover` | `#b41926` | igual | Nunca como cor de fundo |
| Destaque | `--accent` | `#b41926` | igual | Ênfase secundária |
| Texto | `--text` | `#03223f` | `#f8f7f3` | Títulos e corpo |
| Texto de apoio | `--text-secondary` | `#4a5568` | `#b8ccd9` | Textos longos |
| Texto discreto | `--muted` | `#7a746e` | `#7a9bb5` | Rótulos; **só sobre `--card`** (sobre `--bg` não passa em AA) |
| Fundo da página | `--bg` | `#f8f7f3` | `#03223f` | |
| Painel | `--bg2` | `#f5f5f5` | `#021c33` | |
| Cartão | `--card` | `#ffffff` | `#02243d` | |
| Linha | `--border` | `#e2ddd8` | `#0d3a5c` | |
| Campo (borda) | `--input-border` | `#d4cfc9` | `#0d3a5c` | |
| Sucesso | `--ok` | `#2d6a4f` | `#2d8a4e` | Dinheiro, "pago" |
| Alerta | `--warn` | `#b45309` | ajustado | Capacidade, "vazio esperado" |
| Erro | `--danger` | `#c0392b` | ajustado | **Só para erro ou perda de dados** |
| Barra superior | `--topbar-bg` | `#03223f` | `#011829` | |

Marca: vinho `#8B0000` e `#b41926`; azul-marinho `#03223f` e `#003366`; creme `#f8f7f3`.
**Regra:** "vazio mas esperado" (um culto sem ninguém ainda, um mês sem escala) usa **âmbar**, nunca vermelho.

## 2. Fontes

| Uso | Fonte | Regra |
|---|---|---|
| Títulos de página, de seção e de cartão; herói público | **Lora** (serifa), 700 | Nunca em tabelas nem botões |
| Todo o resto (texto, rótulos, tabelas, botões, campos) | **Montserrat** | Pesos 400, 500, 600, 700; 800 só em números grandes |

O peso 900 não é carregado. Não usar.

## 3. Tamanhos de texto

| Papel | Tamanho / peso |
|---|---|
| Rótulo de campo, cabeçalho de tabela | 11 px / 700, maiúsculas, espaçamento .6 px |
| Legenda | 12 px / 500 |
| Tabela, botão | 13 px / 500–600 |
| Texto de interface | 14 px / 400–500 |
| Campo de texto | **16 px no celular** (≤ 768 px, evita zoom no iPhone), 14 px no computador |
| Título de cartão | 18 px / 700 Lora |
| Título de seção | 22 px / 700 Lora |
| Título de página pública | 24–28 px / 700 Lora |
| Número de destaque | 36 ou 48 px / 800 |

**Regra:** nada abaixo de 11 px.

## 4. Botões

| Variante | Classe | Uso |
|---|---|---|
| Principal | `.btn-primary` | A ação que conclui a tela |
| Secundário | `.btn-ghost` | Voltar, cancelar, ações de apoio |
| Confirmar/sucesso | `.btn-ok` | Dar baixa, aprovar |
| Perigo | `.btn-danger` | Excluir, desativar |
| Atenção | `.btn-warn` | Ações que pedem cuidado |

Regras: padding `9 × 18 px`, texto 13 px / 600, **canto 8 px**; `.btn-sm` (5 × 12, 12 px, canto 6) e `.btn-xs` (3 × 8, 11 px, canto 5) para tabelas.
Ao pressionar: `scale(.97)`. Em toque, alvo mínimo de **44 × 44 px**. Hover só em aparelhos com mouse.

## 5. Cantos

| Elemento | Raio |
|---|---|
| Cartão e painel | 10 px (`--r`) |
| Botão e campo | 8 px |
| Botão pequeno / mini | 6 px / 5 px |
| Selo (badge) | 99 px (pílula) |
| Cartão de módulo no Início | 14 px |

## 6. Espaçamento

**Escala única:** 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 px.

| Contexto | Valor |
|---|---|
| Ícone ↔ texto, selo | 4–6 |
| Entre campos e linhas relacionados | 8–12 |
| Padding do cartão | 20 (16 no celular) |
| Entre blocos dentro do cartão | 16–24 |
| Entre cartões e seções | 24–32 |
| Margem da página pública | 32 no computador, 16 no celular |

**Regra:** agrupar por proximidade antes de acrescentar borda ou caixa.

## 7. Componentes e estados

- **Selos de status:** verde (pago), amarelo (pendente), vermelho (cancelado/atrasado), azul (informação), cinza (neutro), roxo (especial).
- **Tabelas:** cabeçalho 11 px em maiúsculas, linha com hover suave, bordas finas.
- **Modais:** fundo `--modal-bg`, sombra `--shadow-lg`, camada `--overlay`.
- **Foco:** borda `--primary` e anel de 3 px (`rgba(139,0,0,.1)`).
- **Sombras:** `--shadow` (cartão), `--shadow-md` (flutuante), `--shadow-lg` (modal).
- **Sempre reaproveitar** `.card`, `.table`, `.btn`, `.badge`, `.tab`, `.modal` antes de criar estilo novo.

## 8. Movimento

- Anime só `transform` e `opacity`; nunca `transition: all`.
- Curvas: entrada e saída `cubic-bezier(0.23, 1, 0.32, 1)`; deslocamento na tela `cubic-bezier(0.77, 0, 0.175, 1)`.
- Duração: toque 160 ms, hover 150 ms, menus 200 ms, modais 240 ms, saída 160 ms.
- **Nada de animação** em ações repetidas o dia inteiro (check-in, troca de aba).
- Respeitar `prefers-reduced-motion`.

## 9. Responsivo

- Quebras principais: **900 px**, **768 px** e **480 px**.
- O desenho do organograma só aparece a partir de **768 px**; no celular fica a árvore.
- Páginas públicas funcionam primeiro no celular, com 16 px de margem.

## 10. Idioma e texto

- Todo texto visível vem de `src/i18n/strings.js` (entradas PT e EN); nenhum texto escrito dentro dos componentes.
- Os layouts precisam aguentar textos 30–40% mais longos que o inglês: sem botões de largura fixa nem rótulos cortados.
- Datas, números e moeda usam o formato do idioma, nunca concatenação manual.
- Prefira ícone mais texto a texto sozinho, e não desenhe texto dentro de imagens.

## 11. Tema e identidade

- **Claro e escuro** em todas as telas, trocados pelo topo.
- Entrada (`/login`): degradê de `#8B0000` a `#b41926` e `#03223f`, com o logo da Igreja Cristã Maranata.
- Páginas públicas (lista de louvores, portaria): visual do portal, cabeçalho "IGREJA CRISTÃ MARANATA".

## 12. Dívidas de design conhecidas
Cores e tamanhos "soltos" no código (cerca de 20 espaçamentos e 30 tamanhos de fonte diferentes) devem ser alinhados a estas escalas conforme as telas forem mexidas. O plano em fases está em `DESIGN.md` (repo root).

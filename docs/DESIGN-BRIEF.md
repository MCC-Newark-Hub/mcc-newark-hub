# Design Brief — MCC Newark Hub (v1)

**Retroactive** · 2026-10-19 · Extracted from `src/index.css` and `FRONTEND_SYSTEM_GUIDELINES.md`. One rule per item, valid on every screen. Values follow the source of truth: **the code wins over Figma**.
**Other languages:** [Português](pt/DESIGN-BRIEF.md)

> Always prefer variables (`var(--…)`). A "loose" color in code ignores dark mode.

---

## 1. Colors

| Role | Variable | Light | Dark | Rule |
|---|---|---|---|---|
| Primary action | `--primary` | `#8B0000` | `#8B0000` | One primary button per screen |
| Action hover | `--primary-hover` | `#b41926` | same | Never as a background color |
| Accent | `--accent` | `#b41926` | same | Secondary emphasis |
| Text | `--text` | `#03223f` | `#f8f7f3` | Titles and body |
| Supporting text | `--text-secondary` | `#4a5568` | `#b8ccd9` | Longer copy |
| Muted text | `--muted` | `#7a746e` | `#7a9bb5` | Labels; **only on `--card`** (on `--bg` it fails AA) |
| Page background | `--bg` | `#f8f7f3` | `#03223f` | |
| Panel | `--bg2` | `#f5f5f5` | `#021c33` | |
| Card | `--card` | `#ffffff` | `#02243d` | |
| Line | `--border` | `#e2ddd8` | `#0d3a5c` | |
| Field (border) | `--input-border` | `#d4cfc9` | `#0d3a5c` | |
| Success | `--ok` | `#2d6a4f` | `#2d8a4e` | Money, "paid" |
| Warning | `--warn` | `#b45309` | adjusted | Capacity, "expected empty" |
| Error | `--danger` | `#c0392b` | adjusted | **Only for errors or data loss** |
| Top bar | `--topbar-bg` | `#03223f` | `#011829` | |

Brand: crimson `#8B0000` and `#b41926`; navy `#03223f` and `#003366`; cream `#f8f7f3`.
**Rule:** an "empty but expected" state (a service nobody covers yet, a month with no schedule) uses **amber**, never red.

## 2. Fonts

| Use | Font | Rule |
|---|---|---|
| Page, section and card titles; public hero | **Lora** (serif), 700 | Never in tables or buttons |
| Everything else (text, labels, tables, buttons, fields) | **Montserrat** | Weights 400, 500, 600, 700; 800 only for large numbers |

Weight 900 is not loaded. Do not use it.

## 3. Text sizes

| Role | Size / weight |
|---|---|
| Field label, table header | 11 px / 700, uppercase, .6 px tracking |
| Caption | 12 px / 500 |
| Table, button | 13 px / 500–600 |
| Interface text | 14 px / 400–500 |
| Text field | **16 px on phones** (≤ 768 px, prevents iPhone zoom), 14 px on desktop |
| Card title | 18 px / 700 Lora |
| Section title | 22 px / 700 Lora |
| Public page title | 24–28 px / 700 Lora |
| Highlight number | 36 or 48 px / 800 |

**Rule:** nothing below 11 px.

## 4. Buttons

| Variant | Class | Use |
|---|---|---|
| Primary | `.btn-primary` | The action that completes the screen |
| Secondary | `.btn-ghost` | Back, cancel, supporting actions |
| Confirm/success | `.btn-ok` | Record payment, approve |
| Danger | `.btn-danger` | Delete, deactivate |
| Caution | `.btn-warn` | Actions that need care |

Rules: padding `9 × 18 px`, text 13 px / 600, **8 px corners**; `.btn-sm` (5 × 12, 12 px, 6 px corners) and `.btn-xs` (3 × 8, 11 px, 5 px corners) for tables.
On press: `scale(.97)`. On touch, a minimum target of **44 × 44 px**. Hover only on devices with a mouse.

## 5. Corners

| Element | Radius |
|---|---|
| Card and panel | 10 px (`--r`) |
| Button and field | 8 px |
| Small / mini button | 6 px / 5 px |
| Badge | 99 px (pill) |
| Module card on Home | 14 px |

## 6. Spacing

**Single scale:** 2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 px.

| Context | Value |
|---|---|
| Icon ↔ text, badge | 4–6 |
| Between related fields and rows | 8–12 |
| Card padding | 20 (16 on phones) |
| Between blocks inside a card | 16–24 |
| Between cards and sections | 24–32 |
| Public page margin | 32 on desktop, 16 on phones |

**Rule:** group by proximity before adding a border or a box.

## 7. Components and states

- **Status badges:** green (paid), yellow (pending), red (cancelled/overdue), blue (information), gray (neutral), purple (special).
- **Tables:** 11 px uppercase header, rows with a soft hover, thin borders.
- **Modals:** `--modal-bg` background, `--shadow-lg` shadow, `--overlay` layer.
- **Focus:** `--primary` border and a 3 px ring (`rgba(139,0,0,.1)`).
- **Shadows:** `--shadow` (card), `--shadow-md` (floating), `--shadow-lg` (modal).
- **Always reuse** `.card`, `.table`, `.btn`, `.badge`, `.tab`, `.modal` before creating a new style.

## 8. Motion

- Animate only `transform` and `opacity`; never `transition: all`.
- Curves: enter and exit `cubic-bezier(0.23, 1, 0.32, 1)`; on-screen movement `cubic-bezier(0.77, 0, 0.175, 1)`.
- Duration: press 160 ms, hover 150 ms, menus 200 ms, modals 240 ms, exit 160 ms.
- **No animation** on actions repeated all day (check-in, switching tabs).
- Respect `prefers-reduced-motion`.

## 9. Responsive

- Main breakpoints: **900 px**, **768 px** and **480 px**.
- The org-chart diagram appears only from **768 px**; on phones the tree is shown.
- Public pages are designed phone-first, with a 16 px margin.

## 10. Localization and text

- Every user-facing string comes from `src/i18n/strings.js` (PT and EN entries); no text hard-coded in components.
- Layouts must survive text that is 30–40% longer than English (German/Portuguese-length labels): no fixed-width buttons or truncated labels.
- Dates, numbers and currency use locale formatting, not manual concatenation.
- Prefer icons plus text over text alone, and do not draw text into images.

## 11. Theme and identity

- **Light and dark** on every screen, switched from the top bar.
- Sign-in (`/login`): gradient from `#8B0000` to `#b41926` and `#03223f`, with the Igreja Cristã Maranata logo.
- Public pages (praise list, door duty): the portal look, with the "IGREJA CRISTÃ MARANATA" header.

## 12. Known design debts
Loose colors and sizes in code (about 20 different spacings and 30 font sizes) must be aligned to these scales as screens are touched. The phased plan is in `DESIGN.md` at the repository root.

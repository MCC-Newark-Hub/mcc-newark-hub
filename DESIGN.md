# Design & UX Audit — 2026-09-22

Scope: look & feel and interaction quality of the whole app (not correctness bugs, which
live in `CHANGELOG.md`/`NOTES.md`). Method: walked the running app as admin (PIN `1234`),
in both themes and at mobile width, plus a read of `src/index.css`/`src/App.css` (the
shared design tokens) and the section/view components. Lens: Emil Kowalski's design
engineering philosophy (`.claude/skills/emil-design-eng`) — unseen details compound,
motion needs a reason, buttons must feel pressed.

Two real bugs turned up in `DoorTab.jsx`/`DoorCalendar.jsx` (Escalas › Portaria, the
module just built) while doing this pass. They're fixed in this same commit — see
`CHANGELOG.md`. Everything else here is a finding to act on separately.

## What's Working

- **A real design system exists and it's a good one.** `src/index.css` defines the ICM
  palette (`--icm-crimson-deep`, `--icm-navy-deep`, …) as semantic CSS variables
  (`--primary`, `--text`, `--card`…), a full dark-mode override block, and shared classes
  (`.btn`, `.card`, `.table`, `.badge`, `.tab`, `.modal`) that most of the app already
  uses. This is more design-system discipline than most small church-ops apps get.
- **Typography pairing is deliberate and consistent**: Lora (serif) for headings/titles,
  Montserrat for UI text — shows up correctly on the login screen, section titles, and
  the public pages.
- **The public-facing pages are genuinely well designed.** `/culto-profetico`,
  `/24h-prayers`, and the read-only shared views (`WorshipListSharedView.jsx`) use a
  crimson-to-navy gradient background with a centered white card, uppercase-tracked
  labels, and generous spacing — the best-looking screens in the app. This is the visual
  language the rest of the app should be pulled toward, not away from.
- **Dark mode has real infrastructure** — not a filter hack, a full second palette — and
  works correctly everywhere that follows the `color: var(--text)` convention (confirmed
  by toggling it across Login, Hub Home, Admin, and the older `RotationTab.jsx`/Flowers
  tab).
- **Feedback has one correct, established pattern**: `notify()` in `App.jsx:58` shows a
  bottom-right toast that auto-dismisses after 3.5s (`.toast` + `@keyframes su`), and
  newer code (`PraiseListsTab.jsx`) already routes every success/error message through
  it via a local `say()` helper. That's the right pattern — it just isn't used
  everywhere yet (see below).
- **Mobile has a real second layout**, not just a squeezed desktop one: a bottom tab bar
  (`.bottom-nav`) replaces the sidebar under 768px, stat grids reflow, modals become
  bottom sheets (`border-radius:20px 20px 0 0`). The bones are right.
- **The admin dashboard (`AdminView` Overview) is functionally strong**: color-coded
  stat cards, a capacity bar with an "over capacity" pill, collapsible category/church
  breakdowns. Dense but legible, and it reads as one system with the rest of the app's
  color language (crimson primary, semantic green/amber/red for money and status).

## What Can Be Better

### 1. The staff chrome renders two topbars, on every single role view

`HubShell.jsx` renders `HubTopbar.jsx` (home icon, logo, PT/EN, dark-mode toggle,
avatar, logout — the "global" bar), and then `EventsSection` renders each role's own
view — `AdminView`, `ClerkView`, `PastorView`, `GALeaderView`, `TeamLeaderView`,
`TreasurerView` — every one of which renders its *own* `Topbar.jsx` right underneath,
with its own logo, its own PT/EN toggle, its own avatar+name, a help button, and an
"Out" (sign-out) button. Two language switches and two ways to sign out, stacked, on
every screen a staff member uses.

On desktop this costs ~50px of dead vertical space and reads as a mistake. **On mobile
it's much worse** — the two bars together eat close to 200px (a quarter of a phone
screen) before any content shows, and the inner bar's controls (moon, PT, EN, avatar,
help, Out) get visually cramped. Given that check-in and clerk desk work happen on
phones, this is the single highest-impact fix in this audit.

**Files**: `src/hub/HubTopbar.jsx`, `src/components/Topbar.jsx`, `src/hub/HubShell.jsx`,
and the 6 views that render `<Topbar>`.

### 2. No pressed/active feedback anywhere

`grep ":active" src/index.css` returns nothing. `.btn:hover` has a `transform:
translateY(-1px)` lift, but there is no `:active` state at all — buttons don't
acknowledge a click until whatever it triggered finishes. Per the design-engineering
checklist, this is the cheapest, highest-leverage fix available: one rule, every button
in the app benefits at once.

| Before | After | Why |
| --- | --- | --- |
| `.btn{...}` (no `:active` rule) | `.btn:active{transform:scale(.97)}` with `transition:transform 160ms ease-out` | Buttons must feel responsive to press — this is a global, one-line fix |
| `.modal-bg{...}` / `.modal{...}` (no transition/animation at all) | fade+scale entrance: `.modal{opacity:1;transform:scale(1);transition:opacity 180ms ease-out,transform 180ms ease-out;@starting-style{opacity:0;transform:scale(.96)}}` | Modals are occasional (not keyboard-repeated), so per the animation-frequency table they deserve a standard entrance; instant pop-in reads as broken. Modals stay `transform-origin:center` (they're centered, not trigger-anchored) |
| `.toast{...animation:su .3s ease;}` (keyframe, entrance only) | keep the entrance, add a matching **exit** transition before unmount (currently the toast is removed from the DOM instantly when its timer fires — it just disappears) | Same asymmetry principle as elsewhere in this list: a toast that slides in but vanishes has an unfinished feel |

### 3. Newer code bypasses the shared toast for local, sticky banners

`OracaoTab.jsx` (and, before this fix, `DoorTab.jsx`) keep their own `error`/`info`
state and render a banner pinned to the top of the section that never auto-dismisses —
different visual treatment, different position, different lifetime than `notify()`.
`PraiseListsTab.jsx` (the most recently written tab) already does this right: it reads
`notify` off `useAppDataContext()` and routes every message through it. Worth sweeping
the older tabs to match, so "something happened" always looks and behaves the same way
across the app.

### 4. "Empty but expected" states shout in alarm-red

The Portaria month calendar (and its "no worker available" summary banner) render every
day nobody's assigned to in bright red (`#b91c1c` / `#c0392b`) — including days that
just haven't been staffed *yet* mid-generation, or days where coverage genuinely isn't
needed. A partially-filled month currently looks broken at a glance because most of it
is red. Reserve red for "this needs attention right now" (e.g. a day inside the current
week that's uncovered) and use a calmer neutral/amber for "not filled in yet."

**Files**: `src/components/DoorCalendar.jsx:46` (`color: editable ? "#b91c1c" : ...`),
`src/sections/schedule/DoorTab.jsx` (the `doorUncovered` banner).

### 5. Design-system drift: new screens hand-roll styles instead of reusing the shared ones

`index.css` already defines `.card`, `.table`/`.table th`/`.table td` (which sets
`color: var(--text)` — the exact thing that was missing and caused the dark-mode
contrast bug), `.section-title`, `label`. `DoorTab.jsx`/`DoorCalendar.jsx` instead
define local `card`, `th`, `td`, `h2` style objects that re-implement (and in a couple
of spots, under-implement) what the shared classes already do. This isn't just
cosmetic — it's exactly how the dark-mode bug happened, and it's how the next module
will reintroduce it. Worth treating `.table`/`.card`/`label` as the default and only
reaching for a one-off inline style when a screen genuinely needs something the system
doesn't have yet.

### 6. Every public page re-invents the same shell

`WorshipListPublicView.jsx`, `WorshipListSharedView.jsx`, `PrayerPublicView.jsx`, and
`DoorPublicView.jsx` each independently define the same "crimson→navy gradient
background, centered white rounded card, ICM logo, PT/EN toggle top-right" wrapper —
four copies of very similar JSX/inline styles. A shared `PublicPageShell` component
(logo, language toggle, gradient background, card) would mean the next public page
(and any polish applied to this one) is free everywhere, and it directly enables the
"pull the admin app toward this look" goal in the plan below.

### 7. Flat, ungrouped admin sidebar

`AdminView`'s sidebar lists 17 items in one unbroken column (Overview, Resumo,
Registrations, Teams, Assistance Groups, Approvals, Reports, Events, Importar,
Usuários & PINs, Diretório, Funções, Tesouraria, Listas, Auditoria, Cozinha, Crachás)
with no grouping or visual hierarchy. Light-touch fix: cluster into 3-4 labeled groups
(e.g. *Event*, *People*, *Money*, *System*) the way `.si` styling already supports via
its active/hover states — no new components needed, just section headers and spacing.

### 8. Small polish gaps

- The Praise Song List date field is a bare `<input type="date">` — native browser
  chrome (calendar icon, format) sitting inside an otherwise fully custom, carefully
  typeset form. Low priority, but worth a styled date picker eventually.
- The PIN login's 4-dot display is standard `type="password"` masking and is fine as-is
  (flagged during this audit, then confirmed correct on inspection — no action needed).

## What Was Fixed In This Pass

Both bugs below were introduced in the Escala de Portaria work (open PR
[#3](https://github.com/MCC-Newark-Hub/mcc-newark-hub/pull/3)) and are fixed in this
commit, not just logged as findings — they're regressions in code that hasn't merged
yet, not existing-app debt.

- **Dark-mode contrast**: `DoorTab.jsx`'s `h2`/`td`/`<strong>` and `DoorCalendar.jsx`'s
  name `<span>`/day-number `<div>` didn't set `color`, so they inherited `<body>`'s
  light-mode color instead of the theme's (dark mode is applied via `data-theme` on a
  `<div>` below `<body>` — see `App.jsx:137` — so anything that doesn't explicitly
  redeclare `color: var(--text)` keeps the light value). Worker names and section
  titles were invisible against the dark card background. Confirmed via a computed-style
  scan (20 of 175 text nodes on the Door Duty screen were near-invisible) and fixed by
  adding the explicit `color`.
- **Inconsistent feedback**: replaced `DoorTab.jsx`'s local, non-dismissing
  success/error banner with the shared `notify()` toast, matching
  `PraiseListsTab.jsx`'s convention (finding #3 above).

## Plan

Ordered by impact ÷ effort, not strictly by section number above.

**Phase 1 — global, mechanical, low-risk (do first, one PR)**
1. Add `.btn:active{transform:scale(.97)}` to `index.css` — every button in the app
   gets press feedback for free (finding #2).
2. Give `.modal`/`.modal-bg` an enter/exit transition (finding #2). Keep it under
   200ms, `ease-out`, centered origin.
3. Add a matching exit transition to `.toast` instead of an instant unmount
   (finding #2).
4. Retone the Portaria "not yet covered" red to a calmer neutral/amber, reserving red
   for genuinely urgent (this-week) gaps (finding #4).

**Phase 2 — consolidate the staff chrome (biggest visual win, needs care)**
5. Merge `HubTopbar.jsx` and `Topbar.jsx` into one bar: keep the section
   title/subtitle and per-view actions (help, pending-approval badge) from the inner
   bar, keep the home/logo/language/theme/avatar/logout from the outer one, drop the
   duplication. Touches `HubShell.jsx` and all 6 staff views
   (`AdminView`/`ClerkView`/`PastorView`/`GALeaderView`/`TeamLeaderView`/
   `TreasurerView`) that currently render `<Topbar>` directly — mechanical but
   touches a lot of files, so worth its own PR and a manual pass on mobile widths
   after (finding #1).
   - *Suggested workflow*: since you now have Figma, mock the consolidated single-bar
     header there first (desktop + mobile) before touching 7 files — cheaper to get
     buy-in on the exact layout (what stays, what moves into an overflow/kebab menu on
     narrow screens) than to iterate in code.

**Phase 3 — design-system consolidation (prevents the next dark-mode bug)**
6. Extract a shared `PublicPageShell` (gradient background, card, logo, language
   toggle) and migrate the four public views onto it (finding #6).
7. Sweep `DoorTab.jsx`/`DoorCalendar.jsx` (and any future admin screen) onto the
   existing `.card`/`.table`/`label` classes instead of local style objects, so
   dark-mode correctness comes from the shared class, not from remembering to set
   `color` on every element (finding #5).
8. Route `OracaoTab.jsx`'s local error/info banners through `notify()` to match
   `PraiseListsTab.jsx` (finding #3).

**Phase 4 — nice-to-have polish**
9. Group the Admin sidebar into labeled sections (finding #7).
10. Style the Praise Song List date input to match the rest of the form (finding #8).
11. Stagger-in the calendar cells / stat cards on first render (30-80ms between
    items) — decorative, skip if it doesn't feel right in five minutes of trying.

## Tooling note

No dedicated Playwright MCP was available in this session — the walkthrough (including
the dark-mode contrast check, done via computed-style inspection rather than eyeballing
screenshots) used Claude's built-in browser tool instead, which covers the same ground.
Figma wasn't used for this pass since there was nothing to compare against yet; it's
called out above as a good next step for Phase 2 specifically, where seeing the
consolidated header before writing code will save iteration.

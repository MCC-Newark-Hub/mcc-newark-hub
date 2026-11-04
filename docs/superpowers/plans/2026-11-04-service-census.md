# Service Census Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record the headcount of each church service via a public link where the recorder picks their own name, and give pastor and clerks an **Assistência** hub section with a Frequência tab to review, correct and summarize it.

**Architecture:** A new `service_census` table, plus two `SECURITY DEFINER` RPCs (member search, public save) so the public page never reads `members` directly. Pure rules live in `src/lib/census.js` (totals, service-day window, summary, CSV). Data calls live in `src/lib/censusData.js`. The public page `/frequencia` sits outside `PublicLayout`. The staff tab sits in a new `/assistance` section that modules 2–4 will extend.

**Tech Stack:** React 18 + React Router v6, Vite, Vitest + Testing Library, Supabase (Postgres RPCs), `qrcode`, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-11-04-service-census-design.md`

## Global Constraints

- Branch `feat/service-census`; each task ends with a commit. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- New table: `ALTER TABLE … DISABLE ROW LEVEL SECURITY;` + `GRANT ALL PRIVILEGES … TO anon, authenticated, service_role;` Verify with `SELECT relrowsecurity FROM pg_class WHERE relname = 'service_census';` → `false`.
- Every staff UPDATE/DELETE chains `.select()` and treats an empty result as a failure.
- Every UI string has a PT and an EN entry in `src/i18n/strings.js` (prefix `census`, `assist`).
- Code, comments and docs are in English. The tone is care, not control: no "faltoso" or "absent" shaming copy.
- Service types: the DB accepts `ebd | noite | outro`. The UI offers `serviceTypesFor(date)` from `src/lib/praiseLists.js` (Sunday → `ebd`, `noite`; other days → `noite`), matching the Profético, which no longer offers `outro`.
- Counts are integers from 0 to 5000. Totals are computed, never stored.
- Public page: outside `PublicLayout`, so it stays open in maintenance mode. Routes `/frequencia` and `/attendance`.
- Staff section: `/assistance`, tile "Assistência" (PT) / "Care" (EN), roles `admin`, `clerk`, `pastor`. Church scope comes from `scopeFor` / `churchesInScope` in `src/lib/directoryStats.js`.
- `CHANGELOG.md` `[Unreleased]` and the `CLAUDE.md` route tables are updated in the same branch.
- Applying the migration to the production Supabase project is an outward-facing action: **ask the user before running it**.

## Review Focus

1. **Late-evening save across midnight Eastern.** A Texas or West Coast evening service saved at 00:30 New York time must still save for that service day, while a date two days back is refused. The test lives in Task 2 (`publicDateAllowed`) and the SQL check in Task 1.
2. **Two people record the same service.** The second save must load and update the same row, not fail on the unique key and not create a duplicate. Covered in Task 1 (upsert) and Task 5 (the page loads the existing row and shows "already recorded by").
3. **Garbage in the number fields** (empty, "-3", "12abc", "99999"). Each must become a clean integer from 0 to 5000 before saving, and the totals must never show `NaN`. Test in Task 2 (`cleanCount`, `censusTotals`).
4. **The name search sends 1–2 letters or text with accents** ("joao" must find "João"). Fewer than 3 letters must not call the RPC and must return nothing. Test in Task 3 (`searchCensusMembers` short-circuit) and SQL check in Task 1.
5. **A clerk with a limited church scope opens the tab.** The clerk sees and edits only their churches, including in the CSV. Test in Task 6 (`CensusTab` filters by scope).

---

## File Structure

| File | Responsibility |
|---|---|
| `migrations/045_service_census.sql` (create) | Table, constraints, `census_member_search`, `census_save` |
| `src/lib/census.js` (create) | Pure rules: counts, totals, New York service day, summary, CSV |
| `src/lib/censusData.js` (create) | Supabase calls: RPCs (public) and table CRUD (staff) |
| `src/i18n/strings.js` (modify) | `census*` / `assist*` strings, PT and EN |
| `src/views/CensusPublicView.jsx` (create) | Public form `/frequencia` |
| `src/sections/assistance/AssistanceSection.jsx` (create) | Tab shell for the Assistência section |
| `src/sections/assistance/CensusTab.jsx` (create) | Staff list, filters, summary, edit/delete, CSV, share card |
| `src/sections/assistance/CensusEditModal.jsx` (create) | Staff add/edit form (any date) |
| `src/hub/HubHome.jsx`, `src/App.jsx` (modify) | Tile and routes |
| `src/test/census.test.js`, `censusData.test.js`, `censusPublicView.test.jsx`, `censusTab.test.jsx`, `hubAssistance.test.jsx` (create) | Tests |
| `CLAUDE.md`, `CHANGELOG.md`, `migrations/README.md` (modify) | Docs |

---

### Task 1: Migration — table and RPCs

**Files:**
- Create: `migrations/045_service_census.sql`
- Modify: `migrations/README.md` (add the 045 line in the existing list format)

**Interfaces:**
- Produces: table `service_census` (columns as below); `census_member_search(p_church text, p_query text) → TABLE(id text, name text)`; `census_save(p_church text, p_date date, p_type text, p_member_id text, p_counts jsonb, p_notes text) → service_census`.

- [ ] **Step 1: Write the migration**

```sql
-- Frequência de Culto (church part): the headcount of each service, one row per church + date + service type.
-- Recorded through the public link /frequencia (the recorder picks their own name from the directory) and corrected by
-- staff in Assistência › Frequência. Totals are computed by the app, never stored.
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS service_census (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church                text        NOT NULL CHECK (char_length(church) BETWEEN 1 AND 120),
  service_date          date        NOT NULL,
  service_type          text        NOT NULL CHECK (service_type IN ('ebd', 'noite', 'outro')),
  members_cia           int         NOT NULL DEFAULT 0 CHECK (members_cia    BETWEEN 0 AND 5000),
  members_adult         int         NOT NULL DEFAULT 0 CHECK (members_adult  BETWEEN 0 AND 5000),
  visitors_cia          int         NOT NULL DEFAULT 0 CHECK (visitors_cia   BETWEEN 0 AND 5000),
  visitors_adult        int         NOT NULL DEFAULT 0 CHECK (visitors_adult BETWEEN 0 AND 5000),
  notes                 text        CHECK (notes IS NULL OR char_length(notes) <= 2000),
  entered_by_member_id  text,
  entered_by_name       text        NOT NULL CHECK (char_length(entered_by_name) BETWEEN 1 AND 120),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_census_one_per_service UNIQUE (church, service_date, service_type),
  CONSTRAINT service_census_ebd_sunday CHECK (service_type <> 'ebd' OR extract(dow FROM service_date) = 0)
);
CREATE INDEX IF NOT EXISTS service_census_date_idx ON service_census (service_date DESC);

ALTER TABLE service_census DISABLE ROW LEVEL SECURITY;
GRANT ALL PRIVILEGES ON service_census TO anon, authenticated, service_role;

-- Name search for the public page: at most 10 members of the church, accent- and case-insensitive.
-- Fewer than 3 characters returns nothing, so the page can never list the directory.
CREATE OR REPLACE FUNCTION census_member_search(p_church text, p_query text)
RETURNS TABLE (id text, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT m.id, m.name
  FROM members m
  WHERE char_length(trim(coalesce(p_query, ''))) >= 3
    AND m.church = p_church
    AND unaccent(lower(m.name)) LIKE '%' || unaccent(lower(trim(p_query))) || '%'
  ORDER BY m.name
  LIMIT 10;
$$;

-- Public save: only the service day (today in New York, or yesterday for a late service further west), only a member
-- of that church, and the recorder's name comes from the directory. Upserts the one row of the service.
CREATE OR REPLACE FUNCTION census_save(p_church text, p_date date, p_type text, p_member_id text, p_counts jsonb, p_notes text)
RETURNS service_census
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/New_York')::date;
  v_name  text;
  v_row   service_census;
  c       jsonb := coalesce(p_counts, '{}'::jsonb);
BEGIN
  IF p_date NOT IN (v_today, v_today - 1) THEN
    RAISE EXCEPTION 'census_date_not_allowed' USING ERRCODE = 'P0001';
  END IF;
  SELECT m.name INTO v_name FROM members m WHERE m.id = p_member_id AND m.church = p_church;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'census_member_not_in_church' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO service_census AS s (church, service_date, service_type, members_cia, members_adult, visitors_cia,
                                   visitors_adult, notes, entered_by_member_id, entered_by_name)
  VALUES (p_church, p_date, p_type,
          coalesce((c->>'members_cia')::int, 0), coalesce((c->>'members_adult')::int, 0),
          coalesce((c->>'visitors_cia')::int, 0), coalesce((c->>'visitors_adult')::int, 0),
          nullif(trim(coalesce(p_notes, '')), ''), p_member_id, v_name)
  ON CONFLICT ON CONSTRAINT service_census_one_per_service DO UPDATE SET
    members_cia = EXCLUDED.members_cia, members_adult = EXCLUDED.members_adult,
    visitors_cia = EXCLUDED.visitors_cia, visitors_adult = EXCLUDED.visitors_adult,
    notes = EXCLUDED.notes, entered_by_member_id = EXCLUDED.entered_by_member_id,
    entered_by_name = EXCLUDED.entered_by_name, updated_at = now()
  RETURNING s.* INTO v_row;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION census_member_search(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION census_save(text, date, text, text, jsonb, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Ask the user to approve applying it to production, then apply it**

Ask in chat: "Apply migration 045 (new table `service_census` + 2 RPCs) to the production Supabase project?" On yes, use the Supabase MCP `apply_migration` with name `045_service_census` and the file contents.

- [ ] **Step 3: Verify in SQL** (Supabase MCP `execute_sql`)

```sql
SELECT relrowsecurity FROM pg_class WHERE relname = 'service_census';              -- false
SELECT count(*) FROM census_member_search('Newark, NJ', 'jo');                     -- 0 (too short)
SELECT count(*) > 0 FROM census_member_search('Newark, NJ', 'joao');               -- true if a "João" exists in Newark
DO $$ BEGIN PERFORM census_save('Newark, NJ', current_date - 5, 'noite', 'M287', '{}', null);
  RAISE EXCEPTION 'should have failed'; EXCEPTION WHEN others THEN
  IF SQLERRM <> 'census_date_not_allowed' THEN RAISE; END IF; END $$;              -- passes silently
DO $$ BEGIN PERFORM census_save('Philadelphia, PA', (now() AT TIME ZONE 'America/New_York')::date, 'noite', 'M180', '{}', null);
  RAISE EXCEPTION 'should have failed'; EXCEPTION WHEN others THEN
  IF SQLERRM <> 'census_member_not_in_church' THEN RAISE; END IF; END $$;          -- M180 is a Newark member
```

Expected: every line behaves as commented. No test row is left behind, because both saves raised before the insert. If any line differs, stop and report it.

- [ ] **Step 4: Commit**

```bash
git add migrations/045_service_census.sql migrations/README.md
git commit -m "Census: service_census table and public RPCs (migration 045)"
```

---

### Task 2: Pure rules — `src/lib/census.js`

**Files:**
- Create: `src/lib/census.js`
- Test: `src/test/census.test.js`

**Interfaces:**
- Consumes: `serviceTypesFor(date)` from `@/lib/praiseLists`.
- Produces:
  - `COUNT_FIELDS: string[]` = `["members_cia","members_adult","visitors_cia","visitors_adult"]`
  - `MAX_COUNT = 5000`
  - `cleanCount(v: any) → int` (0..5000)
  - `cleanCounts(obj) → {members_cia, members_adult, visitors_cia, visitors_adult}`
  - `censusTotals(row) → {members, visitors, overall}`
  - `nyDate(now?: Date) → "YYYY-MM-DD"`
  - `publicDateAllowed(date: string, now?: Date) → boolean`
  - `censusTypesFor(date) → string[]` (re-export of `serviceTypesFor`)
  - `summarizeCensus(rows) → { services, byType: {[type]: {services, avgOverall}}, avgOverall, visitorShare, ciaShare, highest, lowest }` (`highest`/`lowest` are rows or `null`; shares are 0..100 integers)
  - `censusCsv(rows, labels) → string` (`labels` = `{date, church, type, membersCia, membersAdult, members, visitorsCia, visitorsAdult, visitors, overall, notes, by, types: {ebd, noite, outro}}`)

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect } from "vitest";
import { cleanCount, cleanCounts, censusTotals, nyDate, publicDateAllowed, censusTypesFor, summarizeCensus, censusCsv } from "@/lib/census";

const row = (o) => ({ church: "Newark, NJ", service_date: "2026-11-01", service_type: "noite", members_cia: 0, members_adult: 0, visitors_cia: 0, visitors_adult: 0, notes: null, entered_by_name: "Ana", ...o });

describe("cleanCount", () => {
  it("keeps whole numbers from 0 to 5000", () => {
    expect(cleanCount(12)).toBe(12);
    expect(cleanCount("40")).toBe(40);
  });
  it("turns garbage into a clean number", () => {
    expect(cleanCount("")).toBe(0);
    expect(cleanCount(null)).toBe(0);
    expect(cleanCount("-3")).toBe(0);
    expect(cleanCount("12abc")).toBe(12);
    expect(cleanCount("abc")).toBe(0);
    expect(cleanCount(7.8)).toBe(7);
    expect(cleanCount("99999")).toBe(5000);
  });
  it("cleans the four counts of a form", () => {
    expect(cleanCounts({ members_cia: "3", members_adult: "", visitors_cia: "-1", visitors_adult: "2", other: 9 }))
      .toEqual({ members_cia: 3, members_adult: 0, visitors_cia: 0, visitors_adult: 2 });
  });
});

describe("censusTotals", () => {
  it("adds members, visitors and overall", () => {
    expect(censusTotals(row({ members_cia: 10, members_adult: 50, visitors_cia: 2, visitors_adult: 5 })))
      .toEqual({ members: 60, visitors: 7, overall: 67 });
  });
  it("never returns NaN for half-typed forms", () => {
    expect(censusTotals({ members_cia: "", members_adult: "4x", visitors_cia: undefined })).toEqual({ members: 4, visitors: 0, overall: 4 });
  });
});

describe("New York service day", () => {
  it("is the calendar date in New York, not UTC", () => {
    expect(nyDate(new Date("2026-11-05T03:30:00Z"))).toBe("2026-11-04"); // 22:30 in New York
  });
  it("accepts today and yesterday (late service further west), nothing else", () => {
    const now = new Date("2026-11-05T05:30:00Z"); // 00:30 New York on the 5th; 21:30 on the 4th in California
    expect(publicDateAllowed("2026-11-05", now)).toBe(true);
    expect(publicDateAllowed("2026-11-04", now)).toBe(true);
    expect(publicDateAllowed("2026-11-03", now)).toBe(false);
    expect(publicDateAllowed("2026-11-06", now)).toBe(false);
    expect(publicDateAllowed("", now)).toBe(false);
  });
});

describe("censusTypesFor", () => {
  it("offers EBD only on Sundays", () => {
    expect(censusTypesFor("2026-11-01")).toEqual(["ebd", "noite"]); // Sunday
    expect(censusTypesFor("2026-11-04")).toEqual(["noite"]);        // Wednesday
  });
});

describe("summarizeCensus", () => {
  it("is empty-safe", () => {
    expect(summarizeCensus([])).toEqual({ services: 0, byType: {}, avgOverall: 0, visitorShare: 0, ciaShare: 0, highest: null, lowest: null });
  });
  it("averages per type, shares and extremes", () => {
    const a = row({ service_type: "ebd", members_adult: 40, members_cia: 10 });                    // 50
    const b = row({ service_date: "2026-11-01", members_adult: 80, visitors_adult: 20 });         // 100
    const c = row({ service_date: "2026-11-04", members_adult: 60, visitors_cia: 10, members_cia: 20 }); // 90
    const s = summarizeCensus([a, b, c]);
    expect(s.services).toBe(3);
    expect(s.byType).toEqual({ ebd: { services: 1, avgOverall: 50 }, noite: { services: 2, avgOverall: 95 } });
    expect(s.avgOverall).toBe(80);
    expect(s.visitorShare).toBe(13);  // 30 / 240
    expect(s.ciaShare).toBe(17);      // 40 / 240
    expect(s.highest).toBe(b);
    expect(s.lowest).toBe(a);
  });
});

describe("censusCsv", () => {
  const labels = { date: "Data", church: "Igreja", type: "Culto", membersCia: "Membros CIAs", membersAdult: "Membros Jovens e Adultos", members: "Membros", visitorsCia: "Visitantes CIAs", visitorsAdult: "Visitantes Jovens e Adultos", visitors: "Visitantes", overall: "Total geral", notes: "Anotações", by: "Registrado por", types: { ebd: "EBD", noite: "Noite", outro: "Outro" } };
  it("writes a header and one quoted line per service with totals", () => {
    const csv = censusCsv([row({ members_adult: 5, visitors_cia: 1, notes: 'Chuva, "frio"' })], labels);
    const [head, line] = csv.split("\n");
    expect(head).toBe('"Data","Igreja","Culto","Membros CIAs","Membros Jovens e Adultos","Membros","Visitantes CIAs","Visitantes Jovens e Adultos","Visitantes","Total geral","Anotações","Registrado por"');
    expect(line).toBe('"2026-11-01","Newark, NJ","Noite","0","5","5","1","0","1","6","Chuva, ""frio""","Ana"');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/test/census.test.js`
Expected: FAIL, "Failed to resolve import @/lib/census".

- [ ] **Step 3: Implement**

```js
// Frequência de Culto (church part): pure rules for the service census — counts, totals, the service day the public
// link may write, the period summary and the CSV. Nothing here talks to the database (see censusData.js).
import { serviceTypesFor } from "@/lib/praiseLists";

export const COUNT_FIELDS = ["members_cia", "members_adult", "visitors_cia", "visitors_adult"];
export const MAX_COUNT = 5000;

// Whatever was typed becomes a whole number from 0 to 5000 ("12abc" -> 12, "-3" -> 0, "" -> 0).
export function cleanCount(v) {
  const n = parseInt(String(v ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_COUNT, n);
}

export const cleanCounts = (obj = {}) => Object.fromEntries(COUNT_FIELDS.map((k) => [k, cleanCount(obj[k])]));

export function censusTotals(row = {}) {
  const c = cleanCounts(row);
  const members = c.members_cia + c.members_adult;
  const visitors = c.visitors_cia + c.visitors_adult;
  return { members, visitors, overall: members + visitors };
}

// Calendar date in New York — the server checks the public save against it (census_save, migration 045).
export function nyDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// The public link writes only the service day: today in New York, or yesterday, so a late service further west saved
// after midnight Eastern still lands on its own day. Mirrors census_save.
export function publicDateAllowed(date, now = new Date()) {
  if (!date) return false;
  return date === nyDate(now) || date === nyDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

// Same services as the Profético: Sunday has EBD (morning) and Noite, every other day only Noite.
export const censusTypesFor = (date) => serviceTypesFor(date);

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

export function summarizeCensus(rows = []) {
  if (!rows.length) return { services: 0, byType: {}, avgOverall: 0, visitorShare: 0, ciaShare: 0, highest: null, lowest: null };
  const byType = {};
  let overall = 0, visitors = 0, cia = 0, highest = null, lowest = null, hiN = -1, loN = Infinity;
  for (const r of rows) {
    const t = censusTotals(r);
    const c = cleanCounts(r);
    overall += t.overall;
    visitors += t.visitors;
    cia += c.members_cia + c.visitors_cia;
    const bt = (byType[r.service_type] ||= { services: 0, sum: 0 });
    bt.services += 1;
    bt.sum += t.overall;
    if (t.overall > hiN) { hiN = t.overall; highest = r; }
    if (t.overall < loN) { loN = t.overall; lowest = r; }
  }
  return {
    services: rows.length,
    byType: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, { services: v.services, avgOverall: Math.round(v.sum / v.services) }])),
    avgOverall: Math.round(overall / rows.length),
    visitorShare: pct(visitors, overall),
    ciaShare: pct(cia, overall),
    highest,
    lowest,
  };
}

const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function censusCsv(rows, labels) {
  const head = [labels.date, labels.church, labels.type, labels.membersCia, labels.membersAdult, labels.members,
    labels.visitorsCia, labels.visitorsAdult, labels.visitors, labels.overall, labels.notes, labels.by];
  const lines = rows.map((r) => {
    const c = cleanCounts(r);
    const t = censusTotals(r);
    return [r.service_date, r.church, labels.types[r.service_type] || r.service_type, c.members_cia, c.members_adult, t.members,
      c.visitors_cia, c.visitors_adult, t.visitors, t.overall, r.notes || "", r.entered_by_name || ""];
  });
  return [head, ...lines].map((cols) => cols.map(q).join(",")).join("\n");
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/test/census.test.js`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/census.js src/test/census.test.js
git commit -m "Census: pure rules for counts, service day, summary and CSV"
```

---

### Task 3: Data calls — `src/lib/censusData.js`

**Files:**
- Create: `src/lib/censusData.js`
- Test: `src/test/censusData.test.js`

**Interfaces:**
- Consumes: `sb` from `@/lib/supabase`; `cleanCounts` from `@/lib/census`.
- Produces (every call returns `{ data, error }` with `error` a string or `null`):
  - `searchCensusMembers(church, query) → {data: [{id,name}], error}`. A query shorter than 3 characters returns `{data: [], error: null}` without calling the RPC.
  - `fetchCensus(church, date, type) → {data: row|null, error}`
  - `saveCensusPublic({church, date, type, memberId, counts, notes}) → {data: row, error}`. It maps the RPC errors `census_date_not_allowed` and `census_member_not_in_church` to the error codes `"date"` and `"member"`, and anything else to `"other"`.
  - `listCensus({from, to, churches}) → {data: row[], error}` (`churches` is `string[]` or `null` for all; ordered by `service_date` desc)
  - `upsertCensusStaff(row) → {data: row, error}`: insert, or update by `id` with `.select()`; zero rows returned → `error: "not_found"`.
  - `deleteCensus(id) → {data: row, error}` with `.select()`; zero rows → `"not_found"`.

- [ ] **Step 1: Write the failing tests**

```js
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/supabase", () => ({ sb: { rpc: (...a) => rpc(...a), from: (...a) => from(...a) } }));

import { searchCensusMembers, saveCensusPublic, upsertCensusStaff, deleteCensus } from "@/lib/censusData";

// A chainable fake query that resolves to `result` when awaited.
const chain = (result) => {
  const q = new Proxy({}, { get: (_, k) => (k === "then" ? (res) => Promise.resolve(result).then(res) : () => q) });
  return q;
};

beforeEach(() => { rpc.mockReset(); from.mockReset(); });

describe("searchCensusMembers", () => {
  it("does not call the server for fewer than 3 letters", async () => {
    expect(await searchCensusMembers("Newark, NJ", " jo ")).toEqual({ data: [], error: null });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("asks the RPC with the church and trimmed text", async () => {
    rpc.mockResolvedValue({ data: [{ id: "M1", name: "João" }], error: null });
    const res = await searchCensusMembers("Newark, NJ", " joao ");
    expect(rpc).toHaveBeenCalledWith("census_member_search", { p_church: "Newark, NJ", p_query: "joao" });
    expect(res.data).toEqual([{ id: "M1", name: "João" }]);
  });
});

describe("saveCensusPublic", () => {
  it("sends clean counts and maps server refusals", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "census_date_not_allowed" } });
    const res = await saveCensusPublic({ church: "Newark, NJ", date: "2026-11-04", type: "noite", memberId: "M1", counts: { members_adult: "12x" }, notes: "" });
    expect(rpc).toHaveBeenCalledWith("census_save", {
      p_church: "Newark, NJ", p_date: "2026-11-04", p_type: "noite", p_member_id: "M1",
      p_counts: { members_cia: 0, members_adult: 12, visitors_cia: 0, visitors_adult: 0 }, p_notes: "",
    });
    expect(res.error).toBe("date");
    rpc.mockResolvedValue({ data: null, error: { message: "census_member_not_in_church" } });
    expect((await saveCensusPublic({ church: "x", date: "d", type: "noite", memberId: "M", counts: {} })).error).toBe("member");
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect((await saveCensusPublic({ church: "x", date: "d", type: "noite", memberId: "M", counts: {} })).error).toBe("other");
  });
});

describe("staff writes report rows that were not found", () => {
  it("update with no row back is not_found", async () => {
    from.mockReturnValue(chain({ data: [], error: null }));
    expect((await upsertCensusStaff({ id: "x", church: "Newark, NJ", service_date: "2026-11-01", service_type: "noite" })).error).toBe("not_found");
  });
  it("delete with no row back is not_found", async () => {
    from.mockReturnValue(chain({ data: [], error: null }));
    expect((await deleteCensus("x")).error).toBe("not_found");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/test/censusData.test.js`
Expected: FAIL, "Failed to resolve import @/lib/censusData".

- [ ] **Step 3: Implement**

```js
// Frequência de Culto: database calls. The public page uses only the two RPCs of migration 045 (it never reads members
// or the table directly); staff read and write the table with their session.
import { sb } from "@/lib/supabase";
import { cleanCounts } from "@/lib/census";

const COLS = "id,church,service_date,service_type,members_cia,members_adult,visitors_cia,visitors_adult,notes,entered_by_member_id,entered_by_name,created_at,updated_at";

export async function searchCensusMembers(church, query) {
  const text = String(query || "").trim();
  if (!church || text.length < 3) return { data: [], error: null };
  const { data, error } = await sb.rpc("census_member_search", { p_church: church, p_query: text });
  return { data: data || [], error: error ? error.message : null };
}

export async function fetchCensus(church, date, type) {
  const { data, error } = await sb.from("service_census").select(COLS)
    .eq("church", church).eq("service_date", date).eq("service_type", type).maybeSingle();
  return { data: data || null, error: error ? error.message : null };
}

export async function saveCensusPublic({ church, date, type, memberId, counts, notes }) {
  const { data, error } = await sb.rpc("census_save", {
    p_church: church, p_date: date, p_type: type, p_member_id: memberId, p_counts: cleanCounts(counts), p_notes: notes ?? "",
  });
  if (!error) return { data, error: null };
  const msg = error.message || "";
  return { data: null, error: /census_date_not_allowed/.test(msg) ? "date" : /census_member_not_in_church/.test(msg) ? "member" : "other" };
}

export async function listCensus({ from, to, churches }) {
  let query = sb.from("service_census").select(COLS).gte("service_date", from).lte("service_date", to);
  if (churches) query = query.in("church", churches);
  const { data, error } = await query.order("service_date", { ascending: false }).order("service_type");
  return { data: data || [], error: error ? error.message : null };
}

const one = ({ data, error }) => {
  if (error) return { data: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { data: row, error: null } : { data: null, error: "not_found" };
};

export async function upsertCensusStaff(row) {
  const fields = {
    church: row.church, service_date: row.service_date, service_type: row.service_type, ...cleanCounts(row),
    notes: String(row.notes || "").trim() || null, entered_by_member_id: row.entered_by_member_id ?? null,
    entered_by_name: row.entered_by_name, updated_at: new Date().toISOString(),
  };
  if (row.id) return one(await sb.from("service_census").update(fields).eq("id", row.id).select(COLS));
  return one(await sb.from("service_census").insert(fields).select(COLS));
}

export async function deleteCensus(id) {
  return one(await sb.from("service_census").delete().eq("id", id).select(COLS));
}
```

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run src/test/censusData.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/censusData.js src/test/censusData.test.js
git commit -m "Census: data calls (public RPCs, staff CRUD with row checks)"
```

---

### Task 4: Strings (PT and EN)

**Files:**
- Modify: `src/i18n/strings.js`. Add the PT block before the closing `},` of `pt` (after `ovrPeople`), and the EN block in the same place in `en`.

**Interfaces:**
- Produces: the keys below, used by Tasks 5 and 6. Service type labels reuse the existing `praiseTypeEbd`, `praiseTypeNoite` and `praiseTypeOutro`.

- [ ] **Step 1: Add the PT keys**

```js
    // Frequência de Culto (census) + Assistência section
    assistTitle: "Assistência",
    assistTabCensus: "Frequência",
    censusPageTitle: "Frequência de Culto",
    censusPageIntro: "Registre quantas pessoas participaram do culto de hoje.",
    censusChurch: "Igreja",
    censusYourName: "Seu nome",
    censusNameHint: "Digite ao menos 3 letras e escolha seu nome.",
    censusNameNone: "Nenhum nome encontrado nesta igreja.",
    censusNotYou: "Não é você?",
    censusDate: "Data",
    censusService: "Culto",
    censusMembers: "Membros",
    censusVisitors: "Visitantes",
    censusCia: "CIAs",
    censusAdults: "Jovens e Adultos",
    censusSubtotal: "Total",
    censusOverall: "Total geral",
    censusNotes: "Anotações (opcional)",
    censusSave: "Salvar",
    censusSaving: "Salvando…",
    censusSaved: "Frequência salva. Obrigado!",
    censusExisting: "Já registrado por {name} — você está atualizando.",
    censusErrDate: "Pelo link só é possível registrar o culto de hoje. Fale com a secretaria para corrigir outras datas.",
    censusErrMember: "Esse nome não pertence a esta igreja. Escolha seu nome de novo.",
    censusErrOther: "Não foi possível salvar. Tente de novo.",
    censusPickChurchName: "Escolha a igreja e o seu nome para continuar.",
    censusPeriod: "Período",
    censusPeriodMonth: "Este mês",
    censusPeriod3: "Últimos 3 meses",
    censusPeriod12: "Últimos 12 meses",
    censusPeriodCustom: "Personalizado",
    censusAllChurches: "Todas as igrejas",
    censusAdd: "Adicionar culto",
    censusEdit: "Editar frequência",
    censusExport: "Exportar CSV",
    censusEmpty: "Nenhum culto registrado neste período.",
    censusSummaryServices: "Cultos registrados",
    censusSummaryAvg: "Média por culto",
    censusSummaryAvgType: "Média — {type}",
    censusSummaryVisitors: "Visitantes",
    censusSummaryCia: "CIAs",
    censusSummaryHigh: "Maior culto",
    censusSummaryLow: "Menor culto",
    censusRecordedBy: "Registrado por",
    censusShareTitle: "Link para registrar a frequência",
    censusShareHint: "Imprima o QR code e deixe na portaria. Quem contar abre no celular e escolhe o próprio nome.",
    censusCopy: "Copiar link",
    censusCopied: "Copiado!",
    censusDelete: "Excluir",
    censusDeleteLabel: "a frequência de {date} · {type}",
    censusNotFound: "Registro não encontrado — atualize a página.",
```

- [ ] **Step 2: Add the EN keys** (same keys, in the `en` block)

```js
    // Service census + Care section
    assistTitle: "Care",
    assistTabCensus: "Attendance",
    censusPageTitle: "Service Attendance",
    censusPageIntro: "Record how many people attended today's service.",
    censusChurch: "Church",
    censusYourName: "Your name",
    censusNameHint: "Type at least 3 letters and pick your name.",
    censusNameNone: "No name found in this church.",
    censusNotYou: "Not you?",
    censusDate: "Date",
    censusService: "Service",
    censusMembers: "Members",
    censusVisitors: "Visitors",
    censusCia: "Children",
    censusAdults: "Youth & Adults",
    censusSubtotal: "Total",
    censusOverall: "Overall total",
    censusNotes: "Notes (optional)",
    censusSave: "Save",
    censusSaving: "Saving…",
    censusSaved: "Attendance saved. Thank you!",
    censusExisting: "Already recorded by {name} — you are updating it.",
    censusErrDate: "The link only records today's service. Ask the church office to fix other dates.",
    censusErrMember: "That name does not belong to this church. Pick your name again.",
    censusErrOther: "Could not save. Please try again.",
    censusPickChurchName: "Pick the church and your name to continue.",
    censusPeriod: "Period",
    censusPeriodMonth: "This month",
    censusPeriod3: "Last 3 months",
    censusPeriod12: "Last 12 months",
    censusPeriodCustom: "Custom",
    censusAllChurches: "All churches",
    censusAdd: "Add service",
    censusEdit: "Edit attendance",
    censusExport: "Export CSV",
    censusEmpty: "No service recorded in this period.",
    censusSummaryServices: "Services recorded",
    censusSummaryAvg: "Average per service",
    censusSummaryAvgType: "Average — {type}",
    censusSummaryVisitors: "Visitors",
    censusSummaryCia: "Children",
    censusSummaryHigh: "Largest service",
    censusSummaryLow: "Smallest service",
    censusRecordedBy: "Recorded by",
    censusShareTitle: "Link to record attendance",
    censusShareHint: "Print the QR code and leave it at the door. Whoever counts opens it on their phone and picks their own name.",
    censusCopy: "Copy link",
    censusCopied: "Copied!",
    censusDelete: "Delete",
    censusDeleteLabel: "the attendance of {date} · {type}",
    censusNotFound: "Record not found — refresh the page.",
```

- [ ] **Step 3: Check that both languages have the same keys**

Run: `npx vitest run src/test/constants.test.js` (if it compares PT/EN keys), then:
`node --input-type=module -e "import('./src/i18n/strings.js').then(({STRINGS:s})=>{const a=Object.keys(s.pt),b=Object.keys(s.en);console.log(a.filter(k=>!b.includes(k)),b.filter(k=>!a.includes(k)))})"`
Expected: `[] []`. If Node cannot resolve the `@/` alias in that file, skip the one-liner; the test in Task 5 renders both languages.

- [ ] **Step 4: Commit**

```bash
git add src/i18n/strings.js
git commit -m "Census: PT and EN strings"
```

---

### Task 5: Public page `/frequencia`

**Files:**
- Create: `src/views/CensusPublicView.jsx`
- Modify: `src/App.jsx` (import + route next to the `/portaria` route)
- Test: `src/test/censusPublicView.test.jsx`

**Interfaces:**
- Consumes: `searchCensusMembers`, `fetchCensus` and `saveCensusPublic` (Task 3); `censusTotals`, `censusTypesFor` and `cleanCounts` (Task 2); `todayLocal` and `splitChurches` from `@/lib/prayerSlots`; `useAppDataContext` (`churches`); `logAuditEvent`, `publicActor` and `deviceInfo` from `@/lib/auditEvent`; `STRINGS` from `@/i18n/strings`.
- Produces: default export `CensusPublicView({ lang, setLang })`. localStorage keys: `mcc_census_church` (string) and `mcc_census_member` (JSON `{id,name,church}`).

- [ ] **Step 1: Write the failing tests**

```jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppDataContext } from "@/context/AppDataContext";

const search = vi.fn(), fetchOne = vi.fn(), save = vi.fn();
vi.mock("@/lib/censusData", () => ({
  searchCensusMembers: (...a) => search(...a), fetchCensus: (...a) => fetchOne(...a), saveCensusPublic: (...a) => save(...a),
}));
vi.mock("@/lib/auditEvent", () => ({ logAuditEvent: vi.fn(), publicActor: (n) => ({ name: n }), deviceInfo: () => "test" }));
vi.mock("@/lib/prayerSlots", async (orig) => ({ ...(await orig()), todayLocal: () => "2026-11-04" }));

import CensusPublicView from "@/views/CensusPublicView";

const churches = [{ display: "Newark, NJ", is_hub: true }, { display: "New York, NY", is_hub: true }];
const renderPage = (lang = "pt") => render(
  <AppDataContext.Provider value={{ churches }}>
    <MemoryRouter><CensusPublicView lang={lang} setLang={() => {}} /></MemoryRouter>
  </AppDataContext.Provider>
);

beforeEach(() => {
  localStorage.clear();
  search.mockReset(); fetchOne.mockReset(); save.mockReset();
  fetchOne.mockResolvedValue({ data: null, error: null });
});

describe("Census public page", () => {
  it("asks for church and name before the counts", () => {
    renderPage();
    expect(screen.getByText("Frequência de Culto")).toBeTruthy();
    expect(screen.getByText("Escolha a igreja e o seu nome para continuar.")).toBeTruthy();
    expect(screen.queryByText("Total geral")).toBeNull();
  });

  it("searches names only from 3 letters, then saves clean counts with live totals", async () => {
    search.mockResolvedValue({ data: [{ id: "M1", name: "João Silva" }], error: null });
    save.mockResolvedValue({ data: { id: "r1" }, error: null });
    renderPage();
    fireEvent.change(screen.getByLabelText("Igreja"), { target: { value: "Newark, NJ" } });
    const name = screen.getByLabelText("Seu nome");
    fireEvent.change(name, { target: { value: "jo" } });
    fireEvent.change(name, { target: { value: "joa" } });
    await waitFor(() => expect(search).toHaveBeenCalledWith("Newark, NJ", "joa"));
    fireEvent.click(await screen.findByText("João Silva"));

    fireEvent.change(screen.getByLabelText("Membros · Jovens e Adultos"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Visitantes · CIAs"), { target: { value: "3x" } });
    expect(screen.getByTestId("census-overall").textContent).toBe("43");

    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(save).toHaveBeenCalledWith({
      church: "Newark, NJ", date: "2026-11-04", type: "noite", memberId: "M1",
      counts: { members_cia: 0, members_adult: 40, visitors_cia: 3, visitors_adult: 0 }, notes: "",
    }));
    expect(await screen.findByText("Frequência salva. Obrigado!")).toBeTruthy();
  });

  it("loads the service another person already recorded", async () => {
    localStorage.setItem("mcc_census_church", "Newark, NJ");
    localStorage.setItem("mcc_census_member", JSON.stringify({ id: "M1", name: "João Silva", church: "Newark, NJ" }));
    fetchOne.mockResolvedValue({ data: { id: "r1", members_adult: 55, members_cia: 0, visitors_cia: 0, visitors_adult: 0, notes: "", entered_by_name: "Ana" }, error: null });
    renderPage();
    expect(await screen.findByText("Já registrado por Ana — você está atualizando.")).toBeTruthy();
    expect(screen.getByLabelText("Membros · Jovens e Adultos").value).toBe("55");
  });

  it("explains a refused date", async () => {
    localStorage.setItem("mcc_census_church", "Newark, NJ");
    localStorage.setItem("mcc_census_member", JSON.stringify({ id: "M1", name: "João Silva", church: "Newark, NJ" }));
    save.mockResolvedValue({ data: null, error: "date" });
    renderPage();
    fireEvent.click(await screen.findByText("Salvar"));
    expect(await screen.findByText(/só é possível registrar o culto de hoje/)).toBeTruthy();
  });

  it("is in English too", () => {
    renderPage("en");
    expect(screen.getByText("Service Attendance")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/test/censusPublicView.test.jsx`
Expected: FAIL, "Failed to resolve import @/views/CensusPublicView".

- [ ] **Step 3: Implement the page**

```jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { todayLocal, splitChurches, formatDate } from "@/lib/prayerSlots";
import { censusTotals, censusTypesFor, cleanCounts } from "@/lib/census";
import { searchCensusMembers, fetchCensus, saveCensusPublic } from "@/lib/censusData";
import { logAuditEvent, publicActor, deviceInfo } from "@/lib/auditEvent";

const CHURCH_KEY = "mcc_census_church";
const MEMBER_KEY = "mcc_census_member";
const EMPTY = { members_cia: "", members_adult: "", visitors_cia: "", visitors_adult: "" };
const read = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const readText = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch { /* private mode */ } };
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

const box = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 14 };
const label = { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6 };
const input = { width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" };

// Public page of the service census (/frequencia): whoever counts at the door picks the church and their own name
// (from the directory, via census_member_search) and records today's service. Outside PublicLayout, so it stays open
// in maintenance mode. Every save goes to the audit log with the name and the device.
export default function CensusPublicView({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { churches = [] } = useAppDataContext() || {};
  const { hubs, others } = splitChurches(churches);
  const today = todayLocal();
  const types = censusTypesFor(today);

  const [church, setChurch] = useState(() => readText(CHURCH_KEY));
  const [member, setMember] = useState(() => { const m = read(MEMBER_KEY, null); return m && m.church === readText(CHURCH_KEY) ? m : null; });
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [type, setType] = useState(types[types.length - 1]); // Noite by default; EBD is picked on Sunday mornings
  const [counts, setCounts] = useState(EMPTY);
  const [notes, setNotes] = useState("");
  const [existingBy, setExistingBy] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: "ok" | "error", text }
  const searchSeq = useRef(0);

  const pickChurch = (v) => { setChurch(v); write(CHURCH_KEY, v || null); setMember(null); write(MEMBER_KEY, null); setQuery(""); setMatches([]); };
  const pickMember = (m) => { const v = { id: m.id, name: m.name, church }; setMember(v); write(MEMBER_KEY, v); setQuery(""); setMatches([]); };
  const notYou = () => { setMember(null); write(MEMBER_KEY, null); };

  // Name search: nothing is asked under 3 letters; a slower older answer never overwrites a newer one.
  useEffect(() => {
    const text = query.trim();
    if (!church || text.length < 3) { setMatches([]); return; }
    const seq = ++searchSeq.current;
    searchCensusMembers(church, text).then(({ data }) => { if (seq === searchSeq.current) setMatches(data); });
  }, [church, query]);

  // The service already recorded (by anyone) opens for editing.
  useEffect(() => {
    if (!church || !member) return;
    let live = true;
    fetchCensus(church, today, type).then(({ data }) => {
      if (!live) return;
      if (data) {
        setCounts({ members_cia: String(data.members_cia), members_adult: String(data.members_adult), visitors_cia: String(data.visitors_cia), visitors_adult: String(data.visitors_adult) });
        setNotes(data.notes || "");
        setExistingBy(data.entered_by_name || "");
      } else { setCounts(EMPTY); setNotes(""); setExistingBy(""); }
    });
    return () => { live = false; };
  }, [church, member, today, type]);

  const totals = useMemo(() => censusTotals(counts), [counts]);
  const setCount = (k) => (e) => setCounts((c) => ({ ...c, [k]: e.target.value }));

  const save = async () => {
    setSaving(true); setNotice(null);
    const clean = cleanCounts(counts);
    const { data, error } = await saveCensusPublic({ church, date: today, type, memberId: member.id, counts: clean, notes });
    setSaving(false);
    if (error) {
      if (error === "member") notYou();
      setNotice({ kind: "error", text: error === "date" ? tt.censusErrDate : error === "member" ? tt.censusErrMember : tt.censusErrOther });
      return;
    }
    setExistingBy(member.name);
    setNotice({ kind: "ok", text: tt.censusSaved });
    logAuditEvent({ actor: publicActor(member.name), action: "census_saved", entityType: "service_census", entityId: data?.id,
      entityLabel: `${today} · ${type}`, details: { church, date: today, type, ...clean, via: "public link", device: deviceInfo() } });
  };

  const typeLabel = { ebd: tt.praiseTypeEbd, noite: tt.praiseTypeNoite, outro: tt.praiseTypeOutro };
  const field = (k, group, part) => {
    const id = `census-${k}`;
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <label htmlFor={id} style={{ ...label, fontWeight: 500 }}>{part}</label>
        <input id={id} aria-label={`${group} · ${part}`} type="number" inputMode="numeric" min={0} max={5000} value={counts[k]} onChange={setCount(k)} style={input} />
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <h1 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 24, color: "var(--text)", marginBottom: 4 }}>{tt.censusPageTitle}</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 18 }}>{tt.censusPageIntro}</p>

        <div style={box}>
          <label htmlFor="census-church" style={label}>{tt.censusChurch}</label>
          <select id="census-church" value={church} onChange={(e) => pickChurch(e.target.value)} style={input}>
            <option value="">{tt.praiseChurchSelect}</option>
            {hubs.map((c) => <option key={c} value={c}>{c}</option>)}
            {others.length > 0 && <optgroup label={tt.praiseOtherChurches}>{others.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>}
          </select>

          <div style={{ marginTop: 14 }}>
            <label htmlFor="census-name" style={label}>{tt.censusYourName}</label>
            {member ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ color: "var(--text)" }}>{member.name}</strong>
                <button className="btn btn-ghost" onClick={notYou}>{tt.censusNotYou}</button>
              </div>
            ) : (
              <>
                <input id="census-name" aria-label={tt.censusYourName} value={query} onChange={(e) => setQuery(e.target.value)} disabled={!church} style={input} autoComplete="off" />
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{tt.censusNameHint}</p>
                {query.trim().length >= 3 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
                    {matches.length === 0 && <li style={{ fontSize: 13, color: "var(--muted)" }}>{tt.censusNameNone}</li>}
                    {matches.map((m) => (
                      <li key={m.id}><button className="btn btn-ghost" style={{ width: "100%", textAlign: "left" }} onClick={() => pickMember(m)}>{m.name}</button></li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        {!church || !member ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>{tt.censusPickChurchName}</p>
        ) : (
          <>
            <div style={box}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <span style={label}>{tt.censusDate}</span>
                  <div style={{ padding: "12px 0", color: "var(--text)" }}>{formatDate(today, lang)}</div>
                </div>
                <div style={{ flex: 1 }}>
                  <label htmlFor="census-type" style={label}>{tt.censusService}</label>
                  <select id="census-type" value={type} onChange={(e) => setType(e.target.value)} style={input}>
                    {types.map((t) => <option key={t} value={t}>{typeLabel[t]}</option>)}
                  </select>
                </div>
              </div>
              {existingBy && !notice && <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10 }}>{fill(tt.censusExisting, { name: existingBy })}</p>}
            </div>

            <div style={box}>
              <span style={label}>{tt.censusMembers}</span>
              <div style={{ display: "flex", gap: 10 }}>{field("members_cia", tt.censusMembers, tt.censusCia)}{field("members_adult", tt.censusMembers, tt.censusAdults)}</div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>{tt.censusSubtotal}: <strong>{totals.members}</strong></p>
            </div>

            <div style={box}>
              <span style={label}>{tt.censusVisitors}</span>
              <div style={{ display: "flex", gap: 10 }}>{field("visitors_cia", tt.censusVisitors, tt.censusCia)}{field("visitors_adult", tt.censusVisitors, tt.censusAdults)}</div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>{tt.censusSubtotal}: <strong>{totals.visitors}</strong></p>
            </div>

            <div style={{ ...box, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ ...label, marginBottom: 0 }}>{tt.censusOverall}</span>
              <span data-testid="census-overall" style={{ fontSize: 32, fontWeight: 700, color: "var(--text)" }}>{totals.overall}</span>
            </div>

            <div style={box}>
              <label htmlFor="census-notes" style={label}>{tt.censusNotes}</label>
              <textarea id="census-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} style={input} />
            </div>

            {notice && <p role="status" style={{ fontSize: 14, marginBottom: 10, color: notice.kind === "ok" ? "#166534" : "#b91c1c" }}>{notice.text}</p>}
            <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: "100%", padding: 14, fontSize: 16 }}>
              {saving ? tt.censusSaving : tt.censusSave}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

Note: the visible `<label>` shows only the part ("CIAs"), because the group heading sits above it. The input's `aria-label` ("Membros · CIAs") is what screen readers and `getByLabelText` use, which keeps the four fields unambiguous.

- [ ] **Step 4: Add the route in `src/App.jsx`**

Import next to `DoorPublicView`:

```jsx
import CensusPublicView from "@/views/CensusPublicView";
```

Then add the route right after the `/portaria` route block:

```jsx
              {/* Public: service census (Frequência de Culto) — outside PublicLayout so it stays open in maintenance mode */}
              {["/frequencia", "/attendance"].map((p) => (
                <Route key={p} path={p} element={<CensusPublicView lang={lang} setLang={setLang} />} />
              ))}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/test/censusPublicView.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/views/CensusPublicView.jsx src/App.jsx src/test/censusPublicView.test.jsx
git commit -m "Census: public page /frequencia (pick church and own name, record today's service)"
```

---

### Task 6: Staff section `/assistance` › Frequência

**Files:**
- Create: `src/sections/assistance/AssistanceSection.jsx`, `src/sections/assistance/CensusTab.jsx`, `src/sections/assistance/CensusEditModal.jsx`
- Modify: `src/hub/HubHome.jsx` (tile), `src/App.jsx` (route)
- Test: `src/test/censusTab.test.jsx`, `src/test/hubAssistance.test.jsx`

**Interfaces:**
- Consumes: `listCensus`, `upsertCensusStaff` and `deleteCensus` (Task 3); `summarizeCensus`, `censusTotals`, `censusCsv` and `censusTypesFor` (Task 2); `scopeFor` and `churchesInScope` (`@/lib/directoryStats`); `useAppDataContext` (`user`, `churches`, `notify`); `logAuditEvent` and `staffActor`; `ConfirmDelete`; `Modal`; `QRCode` from `qrcode`; `todayLocal` and `formatDate` from `@/lib/prayerSlots`.
- Produces: `AssistanceSection({ lang })` (default export); `CensusTab({ lang })` (default export); `CensusEditModal({ row, churches, user, lang, onSaved, onClose })` (default export); `periodRange(kind, today) → {from, to}` (named export from `CensusTab.jsx`, `kind` ∈ `month | 3m | 12m`).

- [ ] **Step 1: Write the failing tests**

`src/test/hubAssistance.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import HubHome from "@/hub/HubHome";

const renderHome = (user, lang = "pt") => render(
  <MemoryRouter initialEntries={["/"]}>
    <Routes>
      <Route path="/" element={<HubHome user={user} lang={lang} />} />
      <Route path="/assistance" element={<div>ASSISTANCE PAGE</div>} />
    </Routes>
  </MemoryRouter>
);

describe("Home: Assistência", () => {
  it("pastor and clerk get the card and it opens /assistance", () => {
    renderHome({ name: "Pr", sysRoles: ["pastor"] });
    fireEvent.click(screen.getByText("Assistência"));
    expect(screen.getByText("ASSISTANCE PAGE")).toBeTruthy();
  });
  it("is Care in English", () => {
    renderHome({ name: "Sec", sysRoles: ["clerk"] }, "en");
    expect(screen.getByText("Care")).toBeTruthy();
  });
  it("is not shown to GA leaders yet", () => {
    renderHome({ name: "GA", sysRoles: ["ga_leader"] });
    expect(screen.queryByText("Assistência")).toBeNull();
  });
});
```

`src/test/censusTab.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppDataContext } from "@/context/AppDataContext";

const list = vi.fn();
vi.mock("@/lib/censusData", () => ({ listCensus: (...a) => list(...a), upsertCensusStaff: vi.fn(), deleteCensus: vi.fn() }));
vi.mock("qrcode", () => ({ default: { toDataURL: () => Promise.resolve("data:image/png;base64,x") } }));
vi.mock("@/lib/prayerSlots", async (orig) => ({ ...(await orig()), todayLocal: () => "2026-11-04" }));

import CensusTab, { periodRange } from "@/sections/assistance/CensusTab";

const churches = [{ display: "Newark, NJ" }, { display: "New York, NY" }, { display: "Philadelphia, PA" }];
const renderTab = (user) => render(
  <AppDataContext.Provider value={{ user, churches, notify: vi.fn() }}><CensusTab lang="pt" /></AppDataContext.Provider>
);

beforeEach(() => list.mockReset());

describe("periodRange", () => {
  it("covers this month, 3 and 12 months back to today", () => {
    expect(periodRange("month", "2026-11-04")).toEqual({ from: "2026-11-01", to: "2026-11-04" });
    expect(periodRange("3m", "2026-11-04")).toEqual({ from: "2026-09-01", to: "2026-11-04" });
    expect(periodRange("12m", "2026-11-04")).toEqual({ from: "2025-12-01", to: "2026-11-04" });
  });
});

describe("CensusTab", () => {
  it("a clerk with a limited scope only asks for their churches", async () => {
    list.mockResolvedValue({ data: [], error: null });
    renderTab({ name: "Sec", sysRoles: ["clerk"], churches: ["New York, NY"] });
    await waitFor(() => expect(list).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-04", churches: ["New York, NY"] }));
    expect(await screen.findByText("Nenhum culto registrado neste período.")).toBeTruthy();
  });

  it("admin asks for everything and sees totals and the summary", async () => {
    list.mockResolvedValue({ data: [
      { id: "1", church: "Newark, NJ", service_date: "2026-11-01", service_type: "noite", members_cia: 10, members_adult: 50, visitors_cia: 0, visitors_adult: 5, notes: null, entered_by_name: "Ana" },
    ], error: null });
    renderTab({ name: "Admin", sysRoles: ["admin"] });
    await waitFor(() => expect(list).toHaveBeenCalledWith({ from: "2026-11-01", to: "2026-11-04", churches: null }));
    expect((await screen.findAllByText("65")).length).toBe(3); // row overall + "Média por culto" + "Média — Noite" (one service)
    expect(screen.getByText("Cultos registrados")).toBeTruthy();
    expect(screen.getByText("Ana")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run src/test/hubAssistance.test.jsx src/test/censusTab.test.jsx`
Expected: FAIL. The hub test fails because there is no "Assistência" card; the tab test fails to resolve the import.

- [ ] **Step 3: Add the tile in `src/hub/HubHome.jsx`**

Add `HeartHandshake` to the `lucide-react` import, and insert this into `SECTIONS` after the `cms` entry:

```jsx
  {
    id: "assistance",
    path: "/assistance",
    icon: HeartHandshake,
    color: "#b45309",
    pt: { label: "Assistência", desc: "Frequência dos cultos e acompanhamento" },
    en: { label: "Care", desc: "Service attendance and pastoral follow-up" },
    roles: ["admin", "clerk", "pastor"],
    live: true,
  },
```

- [ ] **Step 4: Create `src/sections/assistance/AssistanceSection.jsx`**

```jsx
import { useState } from "react";
import { Users } from "lucide-react";
import CensusTab from "./CensusTab";

// Assistência (Care): pastoral follow-up. Starts with the service census; GA attendance, visits and prayer requests
// arrive as tabs here.
const TABS = [
  { id: "census", icon: Users, color: "#b45309", pt: "Frequência", en: "Attendance" },
];

export default function AssistanceSection({ lang }) {
  const pt = lang !== "en";
  const [tab, setTab] = useState("census");

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)" }}>
      <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "0 24px", display: "flex", gap: 4 }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "14px 16px",
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "'Montserrat',sans-serif", fontSize: 14, fontWeight: isActive ? 700 : 500,
                color: isActive ? t.color : "var(--muted)",
                borderBottom: isActive ? `2.5px solid ${t.color}` : "2.5px solid transparent",
                transition: "color .15s, border-color .15s",
              }}
            >
              <Icon size={16} color={isActive ? t.color : "var(--muted)"} />
              {pt ? t.pt : t.en}
            </button>
          );
        })}
      </div>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>
        {tab === "census" && <CensusTab lang={lang} />}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/sections/assistance/CensusEditModal.jsx`**

```jsx
import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { STRINGS } from "@/i18n/strings";
import { censusTotals, censusTypesFor } from "@/lib/census";
import { upsertCensusStaff } from "@/lib/censusData";
import { logAuditEvent, staffActor } from "@/lib/auditEvent";
import { todayLocal } from "@/lib/prayerSlots";

const input = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" };
const label = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text)" };

// Staff add/edit of a census, any date. The recorder of a staff save is the signed-in user.
export default function CensusEditModal({ row, churches, user, lang, onSaved, onClose }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const [form, setForm] = useState(() => row || {
    church: churches[0] || "", service_date: todayLocal(), service_type: "noite",
    members_cia: "", members_adult: "", visitors_cia: "", visitors_adult: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const types = censusTypesFor(form.service_date);
  const totals = useMemo(() => censusTotals(form), [form]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const typeLabel = { ebd: tt.praiseTypeEbd, noite: tt.praiseTypeNoite, outro: tt.praiseTypeOutro };
  const type = types.includes(form.service_type) ? form.service_type : types[types.length - 1];

  const save = async () => {
    setSaving(true); setError("");
    const { data, error: err } = await upsertCensusStaff({ ...form, service_type: type, entered_by_member_id: null, entered_by_name: user?.name || "Staff" });
    setSaving(false);
    if (err) { setError(err === "not_found" ? tt.censusNotFound : `${tt.censusErrOther} (${err})`); return; }
    logAuditEvent({ actor: staffActor(user), action: row ? "census_updated" : "census_created", entityType: "service_census", entityId: data.id,
      entityLabel: `${data.service_date} · ${data.service_type}`, details: { church: data.church } });
    onSaved(data);
  };

  const num = (k, text) => (
    <div style={{ flex: 1 }}>
      <label style={label} htmlFor={`edit-${k}`}>{text}</label>
      <input id={`edit-${k}`} type="number" inputMode="numeric" min={0} max={5000} value={form[k]} onChange={set(k)} style={input} />
    </div>
  );

  return (
    <Modal onClose={onClose} maxWidth={520}>
      <h3 style={{ marginBottom: 14 }}>{row ? tt.censusEdit : tt.censusAdd}</h3>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 2 }}>
          <label style={label} htmlFor="edit-church">{tt.censusChurch}</label>
          <select id="edit-church" value={form.church} onChange={set("church")} style={input} disabled={!!row}>
            {churches.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="edit-date">{tt.censusDate}</label>
          <input id="edit-date" type="date" value={form.service_date} onChange={set("service_date")} style={input} disabled={!!row} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="edit-type">{tt.censusService}</label>
          <select id="edit-type" value={type} onChange={set("service_type")} style={input} disabled={!!row}>
            {types.map((t) => <option key={t} value={t}>{typeLabel[t]}</option>)}
          </select>
        </div>
      </div>
      <p style={label}>{tt.censusMembers} — {totals.members}</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>{num("members_cia", tt.censusCia)}{num("members_adult", tt.censusAdults)}</div>
      <p style={label}>{tt.censusVisitors} — {totals.visitors}</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>{num("visitors_cia", tt.censusCia)}{num("visitors_adult", tt.censusAdults)}</div>
      <p style={{ fontWeight: 700, marginBottom: 12 }}>{tt.censusOverall}: {totals.overall}</p>
      <label style={label} htmlFor="edit-notes">{tt.censusNotes}</label>
      <textarea id="edit-notes" value={form.notes || ""} onChange={set("notes")} maxLength={2000} rows={3} style={input} />
      {error && <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>{lang === "en" ? "Cancel" : "Cancelar"}</button>
        <button className="btn btn-primary" onClick={save} disabled={saving || !form.church || !form.service_date} style={{ flex: 1 }}>{saving ? tt.censusSaving : tt.censusSave}</button>
      </div>
    </Modal>
  );
}
```

Note: when editing, church, date and type are locked, because changing them could collide with the unique key. To move a record, staff delete it and add it again.

- [ ] **Step 6: Create `src/sections/assistance/CensusTab.jsx`**

```jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Plus, Download, Pencil, Trash2 } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { scopeFor, churchesInScope } from "@/lib/directoryStats";
import { summarizeCensus, censusTotals, censusCsv } from "@/lib/census";
import { listCensus, deleteCensus } from "@/lib/censusData";
import { logAuditEvent, staffActor } from "@/lib/auditEvent";
import { todayLocal, formatDate } from "@/lib/prayerSlots";
import ConfirmDelete from "@/components/ConfirmDelete";
import CensusEditModal from "./CensusEditModal";

const pad = (n) => String(n).padStart(2, "0");
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

// First day of the month `back` months before today's month, through today.
export function periodRange(kind, today) {
  const [y, m] = today.split("-").map(Number);
  const back = kind === "12m" ? 11 : kind === "3m" ? 2 : 0;
  const d = new Date(y, m - 1 - back, 1);
  return { from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, to: today };
}

function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Assistência › Frequência: every recorded service in the user's churches, the period summary, staff corrections and
// the public link to print at the door.
export default function CensusTab({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { user, churches = [], notify } = useAppDataContext() || {};
  const today = todayLocal();
  const scope = useMemo(() => scopeFor(user), [user]);
  const allowed = useMemo(() => churchesInScope(churches, scope), [churches, scope]);

  const [church, setChurch] = useState("");
  const [period, setPeriod] = useState("month");
  const [custom, setCustom] = useState({ from: today, to: today });
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);     // row, {} for new, or null
  const [deleting, setDeleting] = useState(null);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  const range = period === "custom" ? custom : periodRange(period, today);
  const filterChurches = church ? [church] : scope.all ? null : allowed;
  const filterKey = JSON.stringify([range, filterChurches]);

  const load = useCallback(() => {
    listCensus({ from: range.from, to: range.to, churches: filterChurches }).then(({ data, error }) => {
      if (error) notify?.(`${tt.censusErrOther} (${error})`);
      setRows(data);
    });
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const publicUrl = `${window.location.origin}/frequencia`;
  useEffect(() => { QRCode.toDataURL(publicUrl, { margin: 1, width: 320 }).then(setQr).catch(() => setQr("")); }, [publicUrl]);

  const summary = useMemo(() => summarizeCensus(rows || []), [rows]);
  const typeLabel = { ebd: tt.praiseTypeEbd, noite: tt.praiseTypeNoite, outro: tt.praiseTypeOutro };
  const csvLabels = {
    date: tt.censusDate, church: tt.censusChurch, type: tt.censusService,
    membersCia: `${tt.censusMembers} ${tt.censusCia}`, membersAdult: `${tt.censusMembers} ${tt.censusAdults}`, members: tt.censusMembers,
    visitorsCia: `${tt.censusVisitors} ${tt.censusCia}`, visitorsAdult: `${tt.censusVisitors} ${tt.censusAdults}`, visitors: tt.censusVisitors,
    overall: tt.censusOverall, notes: tt.censusNotes, by: tt.censusRecordedBy, types: typeLabel,
  };

  const remove = async () => {
    const r = deleting;
    setDeleting(null);
    const { error } = await deleteCensus(r.id);
    if (error) { notify?.(error === "not_found" ? tt.censusNotFound : `${tt.censusErrOther} (${error})`); return; }
    logAuditEvent({ actor: staffActor(user), action: "census_deleted", entityType: "service_census", entityId: r.id, entityLabel: `${r.service_date} · ${r.service_type}`, details: { church: r.church } });
    setRows((rs) => rs.filter((x) => x.id !== r.id));
  };

  const stat = (title, value) => (
    <div className="card" style={{ padding: "12px 14px", minWidth: 140, flex: 1 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{value}</div>
    </div>
  );
  const sel = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)" };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <select aria-label={tt.censusChurch} value={church} onChange={(e) => setChurch(e.target.value)} style={sel}>
          <option value="">{tt.censusAllChurches}</option>
          {allowed.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label={tt.censusPeriod} value={period} onChange={(e) => setPeriod(e.target.value)} style={sel}>
          <option value="month">{tt.censusPeriodMonth}</option>
          <option value="3m">{tt.censusPeriod3}</option>
          <option value="12m">{tt.censusPeriod12}</option>
          <option value="custom">{tt.censusPeriodCustom}</option>
        </select>
        {period === "custom" && (
          <>
            <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} style={sel} />
            <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} style={sel} />
          </>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" disabled={!rows?.length} onClick={() => downloadCsv(`frequencia_${range.from}_${range.to}.csv`, censusCsv(rows, csvLabels))} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Download size={15} /> {tt.censusExport}
        </button>
        <button className="btn btn-primary" onClick={() => setEditing({})} disabled={!allowed.length} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Plus size={15} /> {tt.censusAdd}
        </button>
      </div>

      {rows && rows.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          {stat(tt.censusSummaryServices, summary.services)}
          {stat(tt.censusSummaryAvg, summary.avgOverall)}
          {Object.entries(summary.byType).map(([t, v]) => <div key={t} style={{ display: "contents" }}>{stat(fill(tt.censusSummaryAvgType, { type: typeLabel[t] || t }), v.avgOverall)}</div>)}
          {stat(tt.censusSummaryVisitors, `${summary.visitorShare}%`)}
          {stat(tt.censusSummaryCia, `${summary.ciaShare}%`)}
          {summary.highest && stat(tt.censusSummaryHigh, `${censusTotals(summary.highest).overall} · ${formatDate(summary.highest.service_date, lang)}`)}
          {summary.lowest && stat(tt.censusSummaryLow, `${censusTotals(summary.lowest).overall} · ${formatDate(summary.lowest.service_date, lang)}`)}
        </div>
      )}

      {rows && rows.length === 0 && <p style={{ color: "var(--muted)", padding: "24px 0" }}>{tt.censusEmpty}</p>}

      {rows && rows.length > 0 && (
        <div className="card" style={{ overflowX: "auto", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: 10 }}>{tt.censusDate}</th><th>{tt.censusChurch}</th><th>{tt.censusService}</th>
                <th>{tt.censusMembers}</th><th>{tt.censusVisitors}</th><th>{tt.censusOverall}</th><th>{tt.censusRecordedBy}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = censusTotals(r);
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: 10 }}>{formatDate(r.service_date, lang)}</td>
                    <td>{r.church}</td>
                    <td>{typeLabel[r.service_type] || r.service_type}</td>
                    <td title={`${tt.censusCia} ${r.members_cia} · ${tt.censusAdults} ${r.members_adult}`}>{t.members}</td>
                    <td title={`${tt.censusCia} ${r.visitors_cia} · ${tt.censusAdults} ${r.visitors_adult}`}>{t.visitors}</td>
                    <td style={{ fontWeight: 700 }}>{t.overall}</td>
                    <td>{r.entered_by_name}{r.notes ? " · ✎" : ""}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-ghost" aria-label={tt.censusEdit} onClick={() => setEditing(r)}><Pencil size={14} /></button>
                      <button className="btn btn-ghost" aria-label={tt.censusDelete} onClick={() => setDeleting(r)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 24, padding: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {qr && <img src={qr} alt="QR" width={120} height={120} />}
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>{tt.censusShareTitle}</strong>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 8px" }}>{tt.censusShareHint}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={publicUrl} onFocus={(e) => e.target.select()} style={{ ...sel, flex: 1 }} />
            <button className="btn btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* select by hand */ } }}>
              {copied ? tt.censusCopied : tt.censusCopy}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <CensusEditModal row={editing.id ? editing : null} churches={allowed} user={user} lang={lang}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {deleting && (
        <ConfirmDelete label={fill(tt.censusDeleteLabel, { date: formatDate(deleting.service_date, lang), type: typeLabel[deleting.service_type] })}
          onConfirm={remove} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Add the route in `src/App.jsx`**

Import `AssistanceSection from "@/sections/assistance/AssistanceSection"` next to the other sections, and inside the HubShell route:

```jsx
                  <Route path="/assistance" element={<AssistanceSection lang={lang} />} />
```

- [ ] **Step 8: Run the tests to see them pass**

Run: `npx vitest run src/test/hubAssistance.test.jsx src/test/censusTab.test.jsx src/test/hubHomeWorship.test.jsx src/test/hubSections.test.jsx`
Expected: PASS. If `hubSections.test.jsx` counts the tiles per role, update its expected counts to include Assistência for admin, clerk and pastor.

- [ ] **Step 9: Commit**

```bash
git add src/sections/assistance src/hub/HubHome.jsx src/App.jsx src/test/hubAssistance.test.jsx src/test/censusTab.test.jsx src/test/hubSections.test.jsx
git commit -m "Census: Assistência section with the Frequência tab (list, summary, edit, CSV, QR link)"
```

---

### Task 7: Docs, full checks and browser verification

**Files:**
- Modify: `CLAUDE.md`, `CHANGELOG.md`

- [ ] **Step 1: Update `CLAUDE.md`**

In the **Public routes** table, add:

```
| `/frequencia` (alias `/attendance`) | CensusPublicView — service census: pick church + own name (RPC `census_member_search`), record today's service (RPC `census_save`, migration 045); outside `PublicLayout` |
```

In the **PIN-gated routes** table, add after `/cms`:

```
| `/assistance` | AssistanceSection — Assistência/Care: Frequência (service census) tab; GA attendance, visits and prayer requests to come |
```

In **Supabase Tables**, append `service_census` to the list.

- [ ] **Step 2: Update `CHANGELOG.md` under `[Unreleased]`**

```
### Added
- Frequência de Culto: public link `/frequencia` where whoever counts picks their church and own name and records today's service (members and visitors, CIAs and Youth & Adults, notes, live totals).
- Assistência (Care) hub section with the Frequência tab: services by church and period, summary (average per service type, visitor and CIA share, largest and smallest service), staff add/edit/delete, CSV export and a QR code of the public link.

### Database
- Migration 045: `service_census` table (one row per church + date + service type) and RPCs `census_member_search`, `census_save`.
```

Use the subsection headers exactly as they already appear in the file's `[Unreleased]` block. Merge into existing headers instead of duplicating them.

- [ ] **Step 3: Run lint and the whole test suite**

Run: `npm run lint && npm run test`
Expected: no lint errors; all tests pass. Fix anything that fails before going on.

- [ ] **Step 4: Verify in the browser**

Start the dev server with the preview tools (`.claude/launch.json`, `npm run dev`, port 5173):
1. At mobile width (375), open `/frequencia`, pick Newark, type 3 letters, pick a name, fill the counts, save, and check that the success message appears and the total is right. Reload, and check that church and name are remembered and the saved values load.
2. Open `/assistance` signed in as an admin seed user. Check that the row shows up, the summary cards, editing a past date, deleting with confirmation, the CSV download, and the QR code.
3. Check both in EN (language toggle) and in dark mode.
Take a screenshot of each page as proof.

Local dev uses the production Supabase project through `VITE_SUPABASE_*`, so the RPCs only work after Task 1 is applied. Delete the test row from the tab when done.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md CHANGELOG.md
git commit -m "Census: docs and changelog"
```

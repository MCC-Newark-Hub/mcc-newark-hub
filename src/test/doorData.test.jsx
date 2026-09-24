import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { STRINGS } from "@/i18n/strings";

// Minimal chainable stand-in for the Supabase client: every awaited query is recorded in `calls`
// and answered by `handler({ table, op, args })`, which each test sets.
const calls = [];
let handler = () => ({ data: [], error: null });
vi.mock("@/lib/supabase", () => ({
  sb: {
    from: (table) => {
      const q = { table, op: null, args: null };
      const chain = {
        select: () => { if (!q.op) q.op = "select"; return chain; },
        insert: (rows) => { q.op = "insert"; q.args = rows; return chain; },
        update: (v) => { q.op = "update"; q.args = v; return chain; },
        delete: () => { q.op = "delete"; return chain; },
        upsert: (v) => { q.op = "upsert"; q.args = v; return chain; },
        eq: () => chain, in: () => chain, order: () => chain, single: () => chain, maybeSingle: () => chain,
        then: (res, rej) => { calls.push(q); return Promise.resolve(handler(q)).then(res, rej); },
      };
      return chain;
    },
  },
}));

const { replaceMonthAssignments } = await import("@/lib/doorData");
const { default: DoorTab } = await import("@/sections/schedule/DoorTab");

const OLD = [{ id: "a1", month: "2026-10", service_date: "2026-10-04", slot: "sun", worker_id: "w1", worker_name: "Ana" }];
const NEW = [{ month: "2026-10", service_date: "2026-10-04", slot: "sun", worker_id: "w2", worker_name: "Bia" }];

beforeEach(() => { calls.length = 0; });

describe("replaceMonthAssignments", () => {
  it("puts the old rows back when the insert fails", async () => {
    handler = (q) => {
      if (q.op === "select") return { data: OLD, error: null };
      if (q.op === "insert" && q.args === NEW) return { data: null, error: { message: "timeout" } };
      return { data: [], error: null };
    };
    const { data, error } = await replaceMonthAssignments("2026-10", NEW);
    expect(error).toEqual({ message: "timeout" });
    expect(data).toBeNull();
    expect(calls.filter((c) => c.op === "insert").map((c) => c.args)).toEqual([NEW, OLD]);
  });

  it("returns the inserted rows and restores nothing on success", async () => {
    handler = (q) => (q.op === "select" ? { data: OLD, error: null } : q.op === "insert" ? { data: [{ id: "a2", ...NEW[0] }], error: null } : { data: [], error: null });
    const { data, error } = await replaceMonthAssignments("2026-10", NEW);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: "a2", ...NEW[0] }]);
    expect(calls.filter((c) => c.op === "insert")).toHaveLength(1);
  });
});

describe("DoorTab save", () => {
  it("does not insert a new worker twice when a later step failed and the admin retries", async () => {
    const tt = STRINGS.pt;
    let updateFails = true;
    handler = (q) => {
      if (q.table === "door_workers" && q.op === "select") return { data: [{ id: "w1", name: "Ana", days: [], is_active: true }], error: null };
      if (q.table === "door_workers" && q.op === "insert") return { data: q.args.map((r, i) => ({ id: `db-${i}`, is_active: true, ...r })), error: null };
      if (q.table === "door_workers" && q.op === "update") return updateFails ? { data: null, error: { message: "offline" } } : { data: [{ id: "w1" }], error: null };
      if (q.table === "door_months") return { data: null, error: null };
      return { data: [], error: null };
    };
    render(<DoorTab lang="pt" />);
    await screen.findByText("Ana");

    fireEvent.change(screen.getByLabelText(tt.doorAddWorker), { target: { value: "Bia" } });
    fireEvent.click(screen.getByText(tt.doorAdd));
    fireEvent.click(screen.getByLabelText(`Ana — ${tt.doorSlotMon}`));

    const saveBtn = screen.getByText(tt.doorSave);
    fireEvent.click(saveBtn);
    await waitFor(() => expect(calls.some((c) => c.op === "update")).toBe(true));
    await waitFor(() => expect(screen.getByText(tt.doorSave)).not.toBeDisabled());

    updateFails = false;
    fireEvent.click(screen.getByText(tt.doorSave));
    await waitFor(() => expect(calls.filter((c) => c.op === "update")).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText(tt.doorUnsaved)).toBeNull());

    expect(calls.filter((c) => c.table === "door_workers" && c.op === "insert")).toHaveLength(1);
  });
});

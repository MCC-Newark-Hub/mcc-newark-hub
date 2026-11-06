import { describe, it, expect, vi, beforeEach } from "vitest";

// Chainable Supabase stand-in (same as doorData.test.jsx): each awaited query is recorded and answered by `handler`.
const calls = [];
let handler = () => ({ data: [], error: null });
vi.mock("@/lib/supabase", () => ({
  sb: {
    from: (table) => {
      const q = { table, op: null, args: null, filters: [] };
      const chain = {
        select: () => { if (!q.op) q.op = "select"; return chain; },
        insert: (rows) => { q.op = "insert"; q.args = rows; return chain; },
        update: (v) => { q.op = "update"; q.args = v; return chain; },
        delete: () => { q.op = "delete"; return chain; },
        upsert: (v) => { q.op = "upsert"; q.args = v; return chain; },
        eq: (k, v) => { q.filters.push([k, v]); return chain; },
        in: () => chain, order: () => chain, single: () => chain, maybeSingle: () => chain,
        then: (res, rej) => { calls.push(q); return Promise.resolve(handler(q)).then(res, rej); },
      };
      return chain;
    },
  },
}));

const { fetchServiceGroups, saveServiceGroup, deleteServiceGroup, setScheduleSlot } = await import("@/lib/serviceGroupsData");

beforeEach(() => { calls.length = 0; handler = () => ({ data: [], error: null }); });

describe("serviceGroupsData", () => {
  it("loads a church's groups, schedule and only those groups' workers", async () => {
    handler = (q) => ({
      service_groups: { data: [{ id: "g1", church: "Newark, NJ", name: "Newark 1" }], error: null },
      service_group_workers: { data: [{ group_id: "g1", name: "Ana" }, { group_id: "other", name: "Zé" }], error: null },
      service_group_schedule: { data: [{ church: "Newark, NJ", slot: "mon", group_id: "g1" }], error: null },
    }[q.table]);
    const { data, error } = await fetchServiceGroups("Newark, NJ");
    expect(error).toBeNull();
    expect(data.groups).toHaveLength(1);
    expect(data.workers.map((w) => w.name)).toEqual(["Ana"]);
    expect(data.schedule).toHaveLength(1);
    expect(calls.find((c) => c.table === "service_groups").filters).toContainEqual(["church", "Newark, NJ"]);
  });

  it("reports a load error with empty data", async () => {
    handler = () => ({ data: null, error: { message: "relation does not exist" } });
    const { data, error } = await fetchServiceGroups("Newark, NJ");
    expect(error).toBeTruthy();
    expect(data).toEqual({ groups: [], workers: [], schedule: [] });
  });

  it("creates a group and then its workers in order", async () => {
    handler = (q) => {
      if (q.table === "service_groups" && q.op === "insert") return { data: { id: "g9", ...q.args }, error: null };
      if (q.table === "service_group_workers" && q.op === "insert") return { data: q.args, error: null };
      return { data: [], error: null };
    };
    const { data, error } = await saveServiceGroup(
      { church: "Newark, NJ", name: " Newark 3 ", leader_member_id: "m1", leader_name: "Ana", is_active: true },
      [{ member_id: "m2", name: "Bia" }, { member_id: null, name: "Caio" }],
    );
    expect(error).toBeNull();
    expect(data.group.id).toBe("g9");
    const ins = calls.find((c) => c.table === "service_group_workers" && c.op === "insert");
    expect(ins.args).toEqual([
      { group_id: "g9", member_id: "m2", name: "Bia", position: 0 },
      { group_id: "g9", member_id: null, name: "Caio", position: 1 },
    ]);
    expect(calls.find((c) => c.table === "service_groups").args.name).toBe("Newark 3");
  });

  it("treats an update that changed no row as a failure", async () => {
    handler = (q) => (q.op === "update" ? { data: null, error: null } : { data: [], error: null });
    const { error } = await saveServiceGroup({ id: "g1", church: "Newark, NJ", name: "Newark 1", is_active: true }, []);
    expect(error).toBeTruthy();
  });

  it("treats a delete that removed nothing as a failure", async () => {
    handler = () => ({ data: [], error: null });
    expect((await deleteServiceGroup("g1")).error).toBeTruthy();
  });

  it("upserts a slot, and deletes it when the group is cleared", async () => {
    await setScheduleSlot("Newark, NJ", "mon", "g1");
    expect(calls[0]).toMatchObject({ table: "service_group_schedule", op: "upsert", args: { church: "Newark, NJ", slot: "mon", group_id: "g1" } });
    await setScheduleSlot("Newark, NJ", "mon", null);
    expect(calls[1]).toMatchObject({ table: "service_group_schedule", op: "delete" });
    expect(calls[1].filters).toEqual([["church", "Newark, NJ"], ["slot", "mon"]]);
  });

  it("returns the saved group when only the workers fail on create, so a retry updates it", async () => {
    handler = (q) => {
      if (q.table === "service_groups" && q.op === "insert") return { data: { id: "g9", ...q.args }, error: null };
      if (q.table === "service_group_workers" && q.op === "insert") return { data: null, error: { message: "dup" } };
      return { data: [], error: null };
    };
    const { data, error } = await saveServiceGroup({ church: "Newark, NJ", name: "Newark 3", is_active: true }, [{ member_id: "m2", name: "Bia" }]);
    expect(error).toBeTruthy();
    expect(data.group.id).toBe("g9");
    expect(data.workers).toEqual([]);
  });

  it("puts the old workers back when replacing them fails on edit", async () => {
    const OLD = [{ id: "w1", group_id: "g1", member_id: "m1", name: "Ana", position: 0 }];
    handler = (q) => {
      if (q.table === "service_groups" && q.op === "update") return { data: { id: "g1", name: "Newark 1" }, error: null };
      if (q.table === "service_group_workers" && q.op === "select") return { data: OLD, error: null };
      if (q.table === "service_group_workers" && q.op === "insert" && q.args !== OLD) return { data: null, error: { message: "dup" } };
      return { data: [], error: null };
    };
    const { data, error } = await saveServiceGroup({ id: "g1", church: "Newark, NJ", name: "Newark 1", is_active: true }, [{ member_id: "m2", name: "Bia" }]);
    expect(error).toBeTruthy();
    expect(calls.some((c) => c.table === "service_group_workers" && c.op === "insert" && c.args === OLD)).toBe(true);
    expect(data.workers).toEqual(OLD);
  });

  it("reports a name already used in the church as duplicate_name", async () => {
    handler = (q) => (q.table === "service_groups" ? { data: null, error: { code: "23505", message: "unique" } } : { data: [], error: null });
    const { error } = await saveServiceGroup({ church: "Newark, NJ", name: "Newark 1", is_active: true }, []);
    expect(error.code).toBe("duplicate_name");
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const from = vi.fn();
vi.mock("@/lib/supabase", () => ({ sb: { from: (...a) => from(...a) } }));

import { fetchAttendance, listAttendance, saveAttendance, deleteAttendance } from "@/lib/gaAttendanceData";

// A chainable fake query that records calls and resolves to `result` when awaited.
const chain = (result, calls = []) => {
  const q = new Proxy({}, {
    get: (_, k) => (k === "then" ? (res) => Promise.resolve(result).then(res) : (...a) => { calls.push([k, ...a]); return q; }),
  });
  return q;
};

beforeEach(() => from.mockReset());

describe("gaAttendanceData", () => {
  it("fetches one attendance by GA, date and type", async () => {
    const calls = [];
    from.mockReturnValue(chain({ data: { id: "1" }, error: null }, calls));
    expect(await fetchAttendance("g1", "2026-11-01", "ebd")).toEqual({ data: { id: "1" }, error: null });
    expect(from).toHaveBeenCalledWith("ga_attendance");
    expect(calls).toContainEqual(["eq", "ga_id", "g1"]);
    expect(calls).toContainEqual(["eq", "service_date", "2026-11-01"]);
    expect(calls).toContainEqual(["eq", "service_type", "ebd"]);
  });

  it("lists a GA's attendances from a date, newest first", async () => {
    const calls = [];
    from.mockReturnValue(chain({ data: [{ id: "1" }], error: null }, calls));
    expect((await listAttendance("g1", "2026-05-07")).data).toEqual([{ id: "1" }]);
    expect(calls).toContainEqual(["gte", "service_date", "2026-05-07"]);
    expect(calls).toContainEqual(["order", "service_date", { ascending: false }]);
  });

  it("saves with an upsert on the service key, cleaned lists and .select()", async () => {
    const calls = [];
    from.mockReturnValue(chain({ data: [{ id: "1" }], error: null }, calls));
    const res = await saveAttendance({
      ga_id: "g1", church: "Newark, NJ", service_date: "2026-11-01", service_type: "noite",
      roster_ids: ["a", "b"], present_ids: ["a", "z", "a"], visitors: [" José ", "jose"], notes: "  ",
      entered_by_user_id: 5, entered_by_name: "Leonard",
    });
    expect(res).toEqual({ data: { id: "1" }, error: null });
    const up = calls.find((c) => c[0] === "upsert");
    expect(up[1]).toMatchObject({ present_ids: ["a"], visitors: ["José"], notes: null, entered_by_user_id: "5", roster_ids: ["a", "b"] });
    expect(up[2]).toEqual({ onConflict: "ga_id,service_date,service_type" });
    expect(calls.some((c) => c[0] === "select")).toBe(true);
  });

  it("treats an empty result as not_found and passes errors through", async () => {
    from.mockReturnValue(chain({ data: [], error: null }));
    expect((await deleteAttendance("x")).error).toBe("not_found");
    from.mockReturnValue(chain({ data: null, error: { message: "boom" } }));
    expect((await saveAttendance({ roster_ids: [], present_ids: [], visitors: [], entered_by_name: "x" })).error).toBe("boom");
  });
});

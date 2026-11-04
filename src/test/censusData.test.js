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

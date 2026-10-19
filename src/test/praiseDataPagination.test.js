import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ sb: {} }));

import { fetchAllRows } from "@/lib/praiseData";

// A fake query whose .range() serves slices of `rows`, like the Supabase API does (max 1000 per request).
const fakeQuery = (rows, calls) => () => ({
  range: (from, to) => {
    calls.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  },
});

const makeRows = (n) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe("fetchAllRows", () => {
  it("reads every page, not just the first 1000 rows", async () => {
    const calls = [];
    const { data, error } = await fetchAllRows(fakeQuery(makeRows(2300), calls));
    expect(error).toBeNull();
    expect(data).toHaveLength(2300);
    expect(calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("stops after one request when the table fits in a page", async () => {
    const calls = [];
    const { data } = await fetchAllRows(fakeQuery(makeRows(49), calls));
    expect(data).toHaveLength(49);
    expect(calls).toHaveLength(1);
  });

  it("asks for one more (empty) page when the size is an exact multiple of the page", async () => {
    const calls = [];
    const { data } = await fetchAllRows(fakeQuery(makeRows(1000), calls));
    expect(data).toHaveLength(1000);
    expect(calls).toEqual([[0, 999], [1000, 1999]]);
  });

  it("returns the error and no partial data when a page fails", async () => {
    const boom = { message: "boom" };
    let n = 0;
    const query = () => ({
      range: () => Promise.resolve(++n === 1 ? { data: makeRows(1000), error: null } : { data: null, error: boom }),
    });
    const res = await fetchAllRows(query);
    expect(res).toEqual({ data: [], error: boom });
  });
});

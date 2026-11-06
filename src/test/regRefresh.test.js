import { describe, it, expect } from "vitest";
import { mergeFreshRegs } from "@/lib/regRefresh";

describe("mergeFreshRegs: catch-up reload of registrations", () => {
  it("adds registrations made elsewhere while the page was asleep", () => {
    const local = [{ id: "a", regNumber: "001" }];
    const fresh = [{ id: "a", regNumber: "001" }, { id: "b", regNumber: "058", memberId: "M213" }];
    expect(mergeFreshRegs(local, fresh).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("drops rows deleted elsewhere and takes the server's version of each row", () => {
    const local = [{ id: "a", regNumber: "001", paid: false }, { id: "gone", regNumber: "002" }];
    const fresh = [{ id: "a", regNumber: "001", paid: true }];
    expect(mergeFreshRegs(local, fresh)).toEqual([{ id: "a", regNumber: "001", paid: true }]);
  });

  it("keeps our own registrations still being saved, until the server has them", () => {
    const local = [{ id: "tmp-003", regNumber: "003" }];
    expect(mergeFreshRegs(local, []).map((r) => r.id)).toEqual(["tmp-003"]);
    expect(mergeFreshRegs(local, [{ id: "real", regNumber: "003" }]).map((r) => r.id)).toEqual(["real"]);
  });
});

import { describe, it, expect } from "vitest";
import { parseSlot, readImportRows, validateImportRows } from "@/lib/prayerImport";

describe("parseSlot", () => {
  it("reads text, ranges, fractions and dates", () => {
    expect(parseSlot("00:00")).toBe(0);
    expect(parseSlot("0:15")).toBe(1);
    expect(parseSlot("23:45-00:00")).toBe(95);
    expect(parseSlot("12:30:00")).toBe(50);
    expect(parseSlot(0.5)).toBe(48);
    expect(parseSlot(new Date(Date.UTC(1899, 11, 30, 6, 45)))).toBe(27);
  });
  it("rejects off-grid or invalid times", () => {
    expect(parseSlot("00:10")).toBeNull();
    expect(parseSlot("24:00")).toBeNull();
    expect(parseSlot("abc")).toBeNull();
    expect(parseSlot(null)).toBeNull();
  });
});

describe("readImportRows", () => {
  it("skips header, empty and nameless rows", () => {
    const rows = readImportRows([["Horário", "Nome", "Igreja"], ["00:00", "Ana Silva", "Newark, NJ"], ["00:15", "", ""], [null, null, null], ["00:30", " Bob   Lee ", ""]]);
    expect(rows.map((r) => [r.line, r.slot, r.name, r.church])).toEqual([[2, 0, "Ana Silva", "Newark, NJ"], [5, 2, "Bob Lee", ""]]);
  });
});

describe("validateImportRows", () => {
  const rows = (arr) => readImportRows(arr);
  it("flags scope, taken slots and repeats in the file", () => {
    const out = validateImportRows(
      rows([["00:00", "Ana", "Newark, NJ"], ["00:00", "Bea", "Newark, NJ"], ["00:15", "Cris", "Provo, UT"], ["00:30", "Dani", "newark, nj"], ["00:45", "Eva", "Newark, NJ"], ["00:10", "Fê", "Newark, NJ"]]),
      { allowed: ["Newark, NJ", "New York, NY"], taken: new Map([[3, "Zé"]]) }
    );
    expect(out.map((r) => `${r.status}:${r.msg || ""}`)).toEqual(["ok:", "error:dupInFile", "error:outOfScope", "ok:", "error:alreadyTaken", "error:badTime"]);
  });
  it("uses the default church, canonicalizes names and warns on unknown ones", () => {
    const out = validateImportRows(rows([["01:00", "Ana", ""], ["01:15", "Bea", "toms river, nj"], ["01:30", "Cris", "Lugar Novo"], ["01:45", "Dani / Eva", "Newark, NJ"]]), { defaultChurch: "Newark, NJ", directory: ["Newark, NJ", "Toms River, NJ"] });
    expect(out.map((r) => [r.status, r.church])).toEqual([["ok", "Newark, NJ"], ["ok", "Toms River, NJ"], ["warn", "Lugar Novo"], ["warn", "Newark, NJ"]]);
  });
  it("errors when there is no church at all", () => {
    expect(validateImportRows(rows([["02:00", "Ana", ""]]))[0].msg).toBe("noChurch");
  });
});

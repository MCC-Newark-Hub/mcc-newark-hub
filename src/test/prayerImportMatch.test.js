import { describe, it, expect } from "vitest";
import { suggestMembers, searchMembers, validateImportRows, findOtherSlots } from "@/lib/prayerImport";

const M = (id, name, church) => ({ id, name, church });
const MEMBERS = [
  M("1", "Tatiana Metzker", "Newark, NJ"),
  M("2", "Mara Nunes", "Newark, NJ"),
  M("3", "Mara Oliveira", "Newark, NJ"),
  M("4", "Alanda Silva", "Toms River, NJ"),
  M("5", "Fabio Santos", "Newark, NJ"),
  M("6", "Fabio Lima", "Toms River, NJ"),
  M("7", "Julia Costa", "Provo, UT"),
  M("8", "João da Silva", "Newark, NJ"),
  M("9", "João da Silva", "Philadelphia, PA"),
];
const ALLOWED = ["Newark, NJ", "Toms River, NJ", "New York, NY", "Philadelphia, PA"];

describe("suggestMembers", () => {
  it("an abbreviated name with an initial finds the right person and suggests it", () => {
    const r = suggestMembers("Mara N.", MEMBERS, { allowed: ALLOWED });
    expect(r.candidates.map((m) => m.id)).toEqual(["2"]);
    expect(r.auto.member.id).toBe("2");
    expect(r.auto.exact).toBe(false);
  });

  it("the full name is an exact match, ignoring accents and case", () => {
    const r = suggestMembers("TATIANA  metzker", MEMBERS, { allowed: ALLOWED });
    expect(r.auto).toEqual({ member: MEMBERS[0], exact: true });
    expect(suggestMembers("Joao da silva", MEMBERS, { allowed: ["Newark, NJ"] }).auto.member.id).toBe("8");
  });

  it("a first name alone is only a suggestion when exactly one person has it", () => {
    expect(suggestMembers("Tatiana", MEMBERS, { allowed: ALLOWED }).auto.member.id).toBe("1");
    const fabio = suggestMembers("Fabio", MEMBERS, { allowed: ALLOWED });
    expect(fabio.candidates.map((m) => m.id).sort()).toEqual(["5", "6"]);
    expect(fabio.auto).toBeNull();                       // two Fabios: the admin chooses
  });

  it("two people with the same name in different churches is ambiguous, unless the sheet's church settles it", () => {
    expect(suggestMembers("João da Silva", MEMBERS, { allowed: ALLOWED }).auto).toBeNull();
    expect(suggestMembers("João da Silva", MEMBERS, { allowed: ALLOWED, churchHint: "Philadelphia, PA" }).auto.member.id).toBe("9");
  });

  it("only offers members of the churches the list accepts", () => {
    expect(suggestMembers("Julia", MEMBERS, { allowed: ALLOWED }).candidates).toEqual([]);
    expect(suggestMembers("Julia", MEMBERS, { allowed: null }).candidates.map((m) => m.id)).toEqual(["7"]);
  });

  it("ignores a title such as Pr or Irmã in front of the name", () => {
    const withPastor = [...MEMBERS, M("10", "Nairon Pimentel", "Newark, NJ")];
    expect(suggestMembers("Pr Nairon", withPastor, { allowed: ALLOWED }).auto.member.id).toBe("10");
    expect(suggestMembers("Irmã Mara N.", withPastor, { allowed: ALLOWED }).auto.member.id).toBe("2");
  });

  it("finds nobody for a name that is not in the directory", () => {
    expect(suggestMembers("Elsa", MEMBERS, { allowed: ALLOWED })).toEqual({ candidates: [], auto: null });
    expect(suggestMembers("", MEMBERS)).toEqual({ candidates: [], auto: null });
  });
});

describe("searchMembers", () => {
  it("every typed word must start a word of the name", () => {
    expect(searchMembers(MEMBERS, "ma nu", { allowed: ALLOWED }).map((m) => m.id)).toEqual(["2"]);
    expect(searchMembers(MEMBERS, "silva", { allowed: ALLOWED }).map((m) => m.id).sort()).toEqual(["4", "8", "9"]);
    expect(searchMembers(MEMBERS, "", { allowed: ALLOWED })).toEqual([]);
  });
});

describe("the same person in more than one time slot", () => {
  const row = (line, time, name) => ({ line, rawTime: time, slot: time === "03:00" ? 12 : time === "12:00" ? 48 : 91, name, church: "Newark, NJ" });

  it("is allowed: only the same person in the same slot is a duplicate", () => {
    const rows = validateImportRows([row(1, "03:00", "Mara Nunes"), row(2, "12:00", "Mara Nunes"), row(3, "22:45", "Mara Nunes")], { capacity: 3, directory: ["Newark, NJ"] });
    expect(rows.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
  });

  it("the same person twice in the same slot (or already saved there) is a duplicate", () => {
    const twice = validateImportRows([row(1, "03:00", "Mara Nunes"), row(2, "03:00", "mara nunes")], { capacity: 3, directory: ["Newark, NJ"] });
    expect(twice.map((r) => r.status)).toEqual(["ok", "error"]);
    const saved = validateImportRows([row(1, "03:00", "Mara Nunes")], { capacity: 3, directory: ["Newark, NJ"], existing: new Map([[12, [{ member_name: "Mara Nunes", church: "Newark, NJ" }]]]) });
    expect(saved[0]).toMatchObject({ status: "error", msg: "samePerson" });
  });
});

describe("findOtherSlots", () => {
  const saved = [
    { id: "a", slot_index: 10, member_id: "m1", member_name: "Mara Nunes", church: "Newark, NJ" },
    { id: "b", slot_index: 12, member_id: null, member_name: "Elsa Costa", church: "Newark, NJ" },
    { id: "c", slot_index: 40, member_id: null, member_name: "Elsa Costa", church: "Toms River, NJ" },
  ];
  it("finds the same member at another time, by member id", () => {
    expect(findOtherSlots({ slot: 12, memberId: "m1", name: "Mara N.", church: "Newark, NJ" }, saved).map((s) => s.id)).toEqual(["a"]);
  });
  it("finds the same name and church, ignoring accents and case", () => {
    expect(findOtherSlots({ slot: 20, memberId: null, name: "ELSA COSTA", church: "Newark, NJ" }, saved).map((s) => s.id)).toEqual(["b"]);
  });
  it("ignores the same slot (that is a duplicate, not 'another time') and other people", () => {
    expect(findOtherSlots({ slot: 12, memberId: null, name: "Elsa Costa", church: "Newark, NJ" }, saved)).toEqual([]);
    expect(findOtherSlots({ slot: 5, memberId: null, name: "Elsa Costa", church: "New York, NY" }, saved)).toEqual([]);
  });
});

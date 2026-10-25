import { describe, it, expect } from "vitest";
import { suggestMembers, searchMembers } from "@/lib/prayerImport";

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

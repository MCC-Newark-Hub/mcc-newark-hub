import { describe, it, expect } from "vitest";
import { buildCarryOverRegs, localChurchesOf, CARRY_OVER_NOTE } from "../lib/carryOver.js";
import { regFeeFlags } from "../lib/regFee.js";
import { isDeadlineExempt } from "../constants/index.js";

const event = { id: "EVT009", prefix: "PA202703", fees: { Adulto: 25, Jovem: 25, Criança: 0, "0-3": 0 } };
const today = "2027-01-10";

const m = (id, name, extra = {}) => ({ id, name, category: "Adulto", church: "Newark, NJ", role: "", ...extra });
const members = [
  m("M287", "Nairon Pimentel", { role: "Pastor", familyId: "F1" }),
  m("M500", "Rose Pimentel", { familyId: "F1" }),
  m("M501", "Lucas Pimentel", { category: "Jovem", familyId: "F1" }),
  m("M180", "Jairo Oliveira", { role: "Pastor" }),
  m("M099", "Dilton Rodrigues", { role: "Pastor", church: "New York, NY" }),
  m("M600", "Armando Rocha", { role: "Pastor", church: "Provo, UT" }),
  m("M700", "Ana Costa"),
  m("M701", "Bia Costa", { category: "Criança" }), // linked only via families.memberIds
  m("M800", "Zeca Dias"),
];
const families = [
  { id: "F1", memberIds: ["M287", "M500", "M501"] },
  { id: "F2", memberIds: ["M700", "M701"] },
];
const sourceRosters = [
  { team: "Pastores", memberIds: ["M600", "M099", "M180", "M287"] },
  { team: "Grupo de Louvor", memberIds: ["M501", "M800"] },
  { team: "Cozinha", memberIds: ["M700", "M800"] },
];
const localChurches = ["Newark, NJ", "New York, NY", "Philadelphia, PA", "Toms River, NJ"];

const build = () => buildCarryOverRegs({ sourceRosters, members, families, localChurches, event, today, byName: "Admin" });
const byMember = (rows, id) => rows.find((r) => r.member_id === id);

describe("buildCarryOverRegs", () => {
  it("numbers Nairon 001, Jairo 002, Dilton 003, each with their family", () => {
    const rows = build();
    expect(rows.slice(0, 5).map((r) => [r.reg_number, r.member_name])).toEqual([
      ["PA202703-0110-001-1", "Nairon Pimentel"],
      ["PA202703-0110-001-2", "Rose Pimentel"],
      ["PA202703-0110-001-3", "Lucas Pimentel"],
      ["PA202703-0110-002-1", "Jairo Oliveira"],
      ["PA202703-0110-003-1", "Dilton Rodrigues"],
    ]);
  });

  it("skips pastors outside the home polo (they stay on the roster)", () => {
    expect(byMember(build(), "M600")).toBeUndefined();
  });

  it("registers everyone once, keeping their own team when they are on one", () => {
    const rows = build();
    expect(new Set(rows.map((r) => r.member_id)).size).toBe(rows.length);
    expect(byMember(rows, "M501").team).toBe("Grupo de Louvor"); // came in with Nairon's family
    expect(byMember(rows, "M800").team).toBe("Cozinha"); // Cozinha sorts before Grupo de Louvor
    expect(byMember(rows, "M500").team).toBe("Participante");
  });

  it("families share the submission and family_id, adults first", () => {
    const rows = build();
    const ana = byMember(rows, "M700");
    const bia = byMember(rows, "M701");
    expect(ana.reg_number).toBe("PA202703-0110-004-1");
    expect(bia.reg_number).toBe("PA202703-0110-004-2");
    expect(ana.family_id).toBe("F2");
    expect(bia.family_id).toBe("F2");
  });

  it("applies fees and exemptions, never payments", () => {
    const rows = build();
    expect(byMember(rows, "M287")).toMatchObject({ exempt: true, fee: 0 }); // Pastor
    expect(byMember(rows, "M701")).toMatchObject({ exempt: true, fee: 0 }); // $0 category
    expect(byMember(rows, "M700")).toMatchObject({ exempt: false, fee: 25 });
    expect(rows.every((r) => r.paid === false && r.note === CARRY_OVER_NOTE && r.registered_at === today)).toBe(true);
  });

  it("no carried registration has a payment deadline (auto-cancel can't touch them)", () => {
    const regs = build().map((r) => ({ ...r, memberId: r.member_id, familyId: r.family_id }));
    expect(regs.every((r) => isDeadlineExempt(r, regs))).toBe(true);
  });
});

describe("localChurchesOf", () => {
  it("lists the churches of the Newark polo", () => {
    const groups = [{ id: "g1", name: "Newark", kind: "polo" }, { id: "g2", name: "Texas", kind: "polo" }];
    const links = [{ group_id: "g1", church_id: 1 }, { group_id: "g2", church_id: 2 }];
    const churches = [{ id: 1, display: "Newark, NJ" }, { id: 2, display: "Austin, TX" }];
    expect(localChurchesOf(groups, links, churches)).toEqual(["Newark, NJ"]);
    expect(localChurchesOf([], links, churches)).toEqual([]);
  });
});

describe("regFeeFlags", () => {
  it("matches addReg's rules", () => {
    expect(regFeeFlags(event, "Adulto", "")).toEqual({ fee: 25, isExempt: false, bypassesCapacity: false });
    expect(regFeeFlags(event, "Adulto", "Ungido")).toEqual({ fee: 0, isExempt: true, bypassesCapacity: true });
    expect(regFeeFlags(event, "Criança", "")).toEqual({ fee: 0, isExempt: true, bypassesCapacity: false });
    expect(regFeeFlags(event, "Adulto", "", true)).toEqual({ fee: 0, isExempt: true, bypassesCapacity: true });
  });
});

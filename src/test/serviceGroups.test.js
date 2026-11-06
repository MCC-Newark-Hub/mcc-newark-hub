import { describe, it, expect } from "vitest";
import { SLOTS, slotFor, groupForService, sameGroupName, validateGroup, editableChurches } from "@/lib/serviceGroups";

const G1 = { id: "g1", church: "Newark, NJ", name: "Newark 1", leader_name: "Ana", is_active: true };
const G2 = { id: "g2", church: "Newark, NJ", name: "Newark 2", leader_name: "Bia", is_active: false };
const DATA = {
  groups: [G1, G2],
  workers: [
    { id: "w2", group_id: "g1", name: "Caio", position: 1 },
    { id: "w1", group_id: "g1", name: "Davi", position: 0 },
    { id: "w3", group_id: "g2", name: "Eva", position: 0 },
  ],
  schedule: [
    { church: "Newark, NJ", slot: "mon", group_id: "g1" },
    { church: "Newark, NJ", slot: "ebd", group_id: "g1" },
    { church: "Newark, NJ", slot: "tue", group_id: "g2" },
  ],
};

describe("slotFor", () => {
  it("maps weekdays to their slot", () => {
    expect(slotFor("2026-11-02", "noite")).toBe("mon");
    expect(slotFor("2026-11-03", "noite")).toBe("tue");
    expect(slotFor("2026-11-04", "noite")).toBe("wed");
    expect(slotFor("2026-11-05", "noite")).toBe("thu");
    expect(slotFor("2026-11-06", "noite")).toBe("fri");
    expect(slotFor("2026-11-07", "noite")).toBe("sat");
  });
  it("splits Sunday into EBD and Noite", () => {
    expect(slotFor("2026-11-08", "ebd")).toBe("ebd");
    expect(slotFor("2026-11-08", "noite")).toBe("noite");
    expect(slotFor("2026-11-08", "outro")).toBe("noite");
  });
  it("returns null for a bad date", () => {
    expect(slotFor("", "noite")).toBeNull();
  });
  it("lists the eight slots in order", () => {
    expect(SLOTS).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "ebd", "noite"]);
  });
});

describe("groupForService", () => {
  it("returns the scheduled group with its leader and ordered workers", () => {
    const r = groupForService(DATA, "Newark, NJ", "2026-11-02", "noite");
    expect(r.group.id).toBe("g1");
    expect(r.leaderName).toBe("Ana");
    expect(r.workerNames).toEqual(["Davi", "Caio"]);
  });
  it("uses the EBD slot on Sunday morning", () => {
    expect(groupForService(DATA, "Newark, NJ", "2026-11-08", "ebd").group.id).toBe("g1");
    expect(groupForService(DATA, "Newark, NJ", "2026-11-08", "noite")).toBeNull();
  });
  it("returns null for an empty slot, another church, or no church", () => {
    expect(groupForService(DATA, "Newark, NJ", "2026-11-04", "noite")).toBeNull();
    expect(groupForService(DATA, "New York, NY", "2026-11-02", "noite")).toBeNull();
    expect(groupForService(DATA, "", "2026-11-02", "noite")).toBeNull();
  });
  it("ignores an inactive group on the schedule", () => {
    expect(groupForService(DATA, "Newark, NJ", "2026-11-03", "noite")).toBeNull();
  });
  it("returns null when the scheduled group no longer exists", () => {
    const data = { ...DATA, schedule: [{ church: "Newark, NJ", slot: "mon", group_id: "gone" }] };
    expect(groupForService(data, "Newark, NJ", "2026-11-02", "noite")).toBeNull();
  });
  it("tolerates missing data", () => {
    expect(groupForService(null, "Newark, NJ", "2026-11-02", "noite")).toBeNull();
  });
});

describe("sameGroupName", () => {
  it("ignores case, accents and extra spaces", () => {
    expect(sameGroupName("  newark   2 ", "Newark 2")).toBe(true);
    expect(sameGroupName("Grupo São Paulo", "grupo sao paulo")).toBe(true);
    expect(sameGroupName("Newark 1", "Newark 2")).toBe(false);
    expect(sameGroupName("", "Newark 2")).toBe(false);
  });
});

describe("validateGroup", () => {
  it("requires a name", () => {
    expect(validateGroup({ church: "Newark, NJ", name: "  " }, [])).toBe("sgNameRequired");
  });
  it("refuses a name already used in the same church, but not in another", () => {
    expect(validateGroup({ church: "Newark, NJ", name: "newark 1" }, [G1])).toBe("sgNameTaken");
    expect(validateGroup({ church: "New York, NY", name: "Newark 1" }, [G1])).toBeNull();
  });
  it("lets a group keep its own name when edited", () => {
    expect(validateGroup({ id: "g1", church: "Newark, NJ", name: "Newark 1" }, [G1])).toBeNull();
  });
});

describe("editableChurches", () => {
  const ALL = ["Newark, NJ", "New York, NY", "Philadelphia, PA"];
  it("gives admins every church", () => {
    expect(editableChurches({ sysRoles: ["admin"] }, ALL)).toEqual(ALL);
  });
  it("gives a clerk only the church of their account, matched by city", () => {
    expect(editableChurches({ sysRoles: ["clerk"], church: "Newark, NJ" }, ALL)).toEqual(["Newark, NJ"]);
    expect(editableChurches({ sysRole: "clerk", church: "Newark" }, ALL)).toEqual(["Newark, NJ"]);
  });
  it("gives a clerk with a church list exactly those", () => {
    expect(editableChurches({ sysRoles: ["clerk"], churches: ["New York, NY", "Philadelphia, PA"] }, ALL)).toEqual(["New York, NY", "Philadelphia, PA"]);
  });
  it("gives nothing to a clerk without a church, or to other roles", () => {
    expect(editableChurches({ sysRoles: ["clerk"] }, ALL)).toEqual([]);
    expect(editableChurches({ sysRoles: ["pastor"], church: "Newark, NJ" }, ALL)).toEqual([]);
    expect(editableChurches(null, ALL)).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { STRINGS } from "@/i18n/strings";
import {
  addDays, attendanceDateAllowed, attendanceTypesFor, gasInScope, rosterFor, shownRoster,
  cleanVisitors, cleanPresent, followUp, sinceLabel, isAttendanceAdmin, defaultAttendance, localDay,
} from "@/lib/gaAttendance";

const tt = STRINGS.pt;
const att = (service_date, roster_ids, present_ids, service_type = "noite") => ({ service_date, service_type, roster_ids, present_ids });

describe("dates", () => {
  it("adds days across months", () => {
    expect(addDays("2026-11-05", -14)).toBe("2026-10-22");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });
  it("allows today back to 14 days, never the future; admin any past date", () => {
    expect(attendanceDateAllowed("2026-11-05", "2026-11-05")).toBe(true);
    expect(attendanceDateAllowed("2026-10-22", "2026-11-05")).toBe(true);
    expect(attendanceDateAllowed("2026-10-21", "2026-11-05")).toBe(false);
    expect(attendanceDateAllowed("2026-11-06", "2026-11-05")).toBe(false);
    expect(attendanceDateAllowed("2025-01-01", "2026-11-05", { isAdmin: true })).toBe(true);
    expect(attendanceDateAllowed("2026-11-06", "2026-11-05", { isAdmin: true })).toBe(false);
    expect(attendanceDateAllowed("", "2026-11-05")).toBe(false);
  });
  it("Sunday has EBD and Noite, other days Noite", () => {
    expect(attendanceTypesFor("2026-11-01")).toEqual(["ebd", "noite"]);
    expect(attendanceTypesFor("2026-11-04")).toEqual(["noite"]);
  });
});

describe("scope and roster", () => {
  const gas = [{ id: "g2", name: "Newark 10" }, { id: "g1", name: "Newark 2" }, { id: "g3", name: "York 1" }];
  it("admin sees every GA, a leader only their gaIds, nobody else nothing", () => {
    expect(gasInScope({ sysRoles: ["admin"] }, gas).map((g) => g.id)).toEqual(["g1", "g2", "g3"]);
    expect(gasInScope({ sysRoles: ["ga_leader"], gaIds: ["g3", "gX"] }, gas).map((g) => g.id)).toEqual(["g3"]);
    expect(gasInScope({ sysRoles: ["ga_leader"] }, gas)).toEqual([]);
    expect(isAttendanceAdmin({ sysRole: "admin" })).toBe(true);
    expect(isAttendanceAdmin({ sysRoles: ["ga_leader"] })).toBe(false);
  });
  it("roster is the GA's members by name", () => {
    const members = [{ id: "b", name: "Bruno", gaId: "g1" }, { id: "a", name: "Álvaro", gaId: "g1" }, { id: "c", name: "Carla", gaId: "g2" }];
    expect(rosterFor("g1", members).map((m) => m.id)).toEqual(["a", "b"]);
  });
  it("an existing attendance keeps who has left and adds who has joined", () => {
    const members = [{ id: "a", name: "Ana", gaId: "g1" }, { id: "n", name: "Nova", gaId: "g1" }, { id: "x", name: "Xavier", gaId: "g2" }];
    const roster = rosterFor("g1", members);
    const shown = shownRoster({ roster_ids: ["a", "x", "gone"] }, roster, members);
    expect(shown).toEqual([{ id: "a", name: "Ana" }, { id: "n", name: "Nova" }, { id: "x", name: "Xavier" }, { id: "gone", name: null }]);
    expect(shownRoster(null, roster, members).map((m) => m.id)).toEqual(["a", "n"]);
  });
});

describe("cleaning", () => {
  it("visitors: trimmed, no blanks, no duplicates ignoring case and accents, 120 chars, at most 50", () => {
    expect(cleanVisitors([" José ", "jose", "", "  ", "Maria"])).toEqual(["José", "Maria"]);
    expect(cleanVisitors(["x".repeat(130)])[0]).toHaveLength(120);
    expect(cleanVisitors(Array.from({ length: 60 }, (_, i) => `V${i}`))).toHaveLength(50);
    expect(cleanVisitors(undefined)).toEqual([]);
  });
  it("present: only roster ids, once", () => {
    expect(cleanPresent(["a", "a", "z"], ["a", "b"])).toEqual(["a"]);
  });
});

describe("followUp", () => {
  const roster = [{ id: "a", name: "Ana" }, { id: "b", name: "Bia" }, { id: "n", name: "Nova" }];
  const list = [
    att("2026-10-18", ["a", "b"], ["a", "b"]),
    att("2026-10-25", ["a", "b"], ["a"]),
    att("2026-11-01", ["a", "b"], ["a"], "ebd"),
    att("2026-11-01", ["a", "b", "n"], ["n"], "noite"),
  ];
  const res = followUp(list, roster, "2026-11-05");
  const by = Object.fromEntries(res.map((r) => [r.member.id, r]));

  it("last presence and days since", () => {
    expect(by.a.lastPresent).toBe("2026-11-01");
    expect(by.a.since).toBe(4);
    expect(by.b.lastPresent).toBe("2026-10-18");
    expect(by.b.since).toBe(18);
  });
  it("recent is newest first (Noite before EBD on a Sunday), none when not on the roster", () => {
    expect(by.a.recent).toEqual(["absent", "present", "present", "present"]);
    expect(by.n.recent).toEqual(["present", "none", "none", "none"]);
  });
  it("needs care after 3 absences on their own rosters, listed first", () => {
    expect(by.b.needsCare).toBe(true);
    expect(by.a.needsCare).toBe(false);
    expect(by.n.needsCare).toBe(false); // only one attendance on the roster
    expect(res[0].member.id).toBe("b");
  });
  it("then longest since last presence; never present counts as longest", () => {
    const r2 = followUp([att("2026-11-01", ["a", "b"], ["a"])], [{ id: "a", name: "Ana" }, { id: "b", name: "Bia" }], "2026-11-05");
    expect(r2.map((r) => r.member.id)).toEqual(["b", "a"]);
    expect(r2[0].lastPresent).toBeNull();
    expect(r2[0].since).toBeNull();
  });
  it("keeps only the last 8", () => {
    const many = Array.from({ length: 10 }, (_, i) => att(addDays("2026-09-01", i * 7), ["a"], ["a"]));
    expect(followUp(many, [{ id: "a", name: "Ana" }], "2026-11-10")[0].recent).toHaveLength(8);
  });
});

describe("sinceLabel", () => {
  it("speaks in days, weeks and months, gently", () => {
    expect(sinceLabel(null, tt)).toBe("Ainda sem presença registrada");
    expect(sinceLabel(0, tt)).toBe("hoje");
    expect(sinceLabel(1, tt)).toBe("há 1 dia");
    expect(sinceLabel(5, tt)).toBe("há 5 dias");
    expect(sinceLabel(14, tt)).toBe("há 2 semanas");
    expect(sinceLabel(21, tt)).toBe("há 3 semanas");
    expect(sinceLabel(70, tt)).toBe("há 2 meses");
    expect(sinceLabel(21, STRINGS.en)).toBe("3 weeks ago");
  });
});

describe("review fixes: defaults and local day", () => {
  it("Sunday morning opens the EBD; Sunday afternoon and night the Noite; weekdays the Noite", () => {
    expect(defaultAttendance(new Date(2026, 10, 1, 10, 0))).toEqual({ date: "2026-11-01", type: "ebd" });
    expect(defaultAttendance(new Date(2026, 10, 1, 19, 30))).toEqual({ date: "2026-11-01", type: "noite" });
    expect(defaultAttendance(new Date(2026, 10, 4, 10, 0))).toEqual({ date: "2026-11-04", type: "noite" });
  });
  it("after midnight (before 4am) it is still last night's service", () => {
    expect(defaultAttendance(new Date(2026, 10, 2, 1, 15))).toEqual({ date: "2026-11-01", type: "noite" });
  });
  it("a timestamp shows the local day, not the UTC one", () => {
    expect(localDay(new Date(2026, 10, 1, 23, 30).toISOString())).toBe("2026-11-01");
    expect(localDay("")).toBe("");
  });
});

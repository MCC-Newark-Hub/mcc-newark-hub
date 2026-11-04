import { describe, it, expect } from "vitest";
import * as census from "@/lib/census";
import { cleanCount, cleanCounts, censusTotals, nyDate, publicDateAllowed, censusTypesFor, summarizeCensus, censusCsv } from "@/lib/census";

const row = (o) => ({ church: "Newark, NJ", service_date: "2026-11-01", service_type: "noite", members_cia: 0, members_adult: 0, visitors_cia: 0, visitors_adult: 0, notes: null, entered_by_name: "Ana", ...o });

describe("cleanCount", () => {
  it("keeps whole numbers from 0 to 5000", () => {
    expect(cleanCount(12)).toBe(12);
    expect(cleanCount("40")).toBe(40);
  });
  it("turns garbage into a clean number", () => {
    expect(cleanCount("")).toBe(0);
    expect(cleanCount(null)).toBe(0);
    expect(cleanCount("-3")).toBe(0);
    expect(cleanCount("12abc")).toBe(12);
    expect(cleanCount("abc")).toBe(0);
    expect(cleanCount(7.8)).toBe(7);
    expect(cleanCount("99999")).toBe(5000);
  });
  it("cleans the four counts of a form", () => {
    expect(cleanCounts({ members_cia: "3", members_adult: "", visitors_cia: "-1", visitors_adult: "2", other: 9 }))
      .toEqual({ members_cia: 3, members_adult: 0, visitors_cia: 0, visitors_adult: 2 });
  });
});

describe("censusTotals", () => {
  it("adds members, visitors and overall", () => {
    expect(censusTotals(row({ members_cia: 10, members_adult: 50, visitors_cia: 2, visitors_adult: 5 })))
      .toEqual({ members: 60, visitors: 7, overall: 67 });
  });
  it("never returns NaN for half-typed forms", () => {
    expect(censusTotals({ members_cia: "", members_adult: "4x", visitors_cia: undefined })).toEqual({ members: 4, visitors: 0, overall: 4 });
  });
});

describe("New York service day", () => {
  it("is the calendar date in New York, not UTC", () => {
    expect(nyDate(new Date("2026-11-05T03:30:00Z"))).toBe("2026-11-04"); // 22:30 in New York
  });
  it("accepts today and yesterday (late service further west), nothing else", () => {
    const now = new Date("2026-11-05T05:30:00Z"); // 00:30 New York on the 5th; 21:30 on the 4th in California
    expect(publicDateAllowed("2026-11-05", now)).toBe(true);
    expect(publicDateAllowed("2026-11-04", now)).toBe(true);
    expect(publicDateAllowed("2026-11-03", now)).toBe(false);
    expect(publicDateAllowed("2026-11-06", now)).toBe(false);
    expect(publicDateAllowed("", now)).toBe(false);
  });
});

describe("censusTypesFor", () => {
  it("offers EBD only on Sundays", () => {
    expect(censusTypesFor("2026-11-01")).toEqual(["ebd", "noite"]); // Sunday
    expect(censusTypesFor("2026-11-04")).toEqual(["noite"]);        // Wednesday
  });
});

describe("summarizeCensus", () => {
  it("is empty-safe", () => {
    expect(summarizeCensus([])).toEqual({ services: 0, byType: {}, avgOverall: 0, visitorShare: 0, ciaShare: 0, highest: null, lowest: null });
  });
  it("averages per type, shares and extremes", () => {
    const a = row({ service_type: "ebd", members_adult: 40, members_cia: 10 });                    // 50
    const b = row({ service_date: "2026-11-01", members_adult: 80, visitors_adult: 20 });         // 100
    const c = row({ service_date: "2026-11-04", members_adult: 60, visitors_cia: 10, members_cia: 20 }); // 90
    const s = summarizeCensus([a, b, c]);
    expect(s.services).toBe(3);
    expect(s.byType).toEqual({ ebd: { services: 1, avgOverall: 50 }, noite: { services: 2, avgOverall: 95 } });
    expect(s.avgOverall).toBe(80);
    expect(s.visitorShare).toBe(13);  // 30 / 240
    expect(s.ciaShare).toBe(17);      // 40 / 240
    expect(s.highest).toBe(b);
    expect(s.lowest).toBe(a);
  });
});

describe("censusCsv", () => {
  const labels = { date: "Data", church: "Igreja", type: "Culto", membersCia: "Membros CIAs", membersAdult: "Membros Jovens e Adultos", members: "Membros", visitorsCia: "Visitantes CIAs", visitorsAdult: "Visitantes Jovens e Adultos", visitors: "Visitantes", overall: "Total geral", notes: "Anotações", by: "Registrado por", types: { ebd: "EBD", noite: "Noite", outro: "Outro" } };
  it("writes a header and one quoted line per service with totals", () => {
    const csv = censusCsv([row({ members_adult: 5, visitors_cia: 1, notes: 'Chuva, "frio"' })], labels);
    const [head, line] = csv.split("\n");
    expect(head).toBe('"Data","Igreja","Culto","Membros CIAs","Membros Jovens e Adultos","Membros","Visitantes CIAs","Visitantes Jovens e Adultos","Visitantes","Total geral","Anotações","Registrado por"');
    expect(line).toBe('"2026-11-01","Newark, NJ","Noite","0","5","5","1","0","1","6","Chuva, ""frio""","Ana"');
  });
});

describe("serviceDateOptions (public page service day)", () => {
  it("after midnight and before 4am offers yesterday's service first, then today", () => {
    const { serviceDateOptions } = census;
    expect(serviceDateOptions(new Date(2026, 10, 9, 0, 15))).toEqual({ options: ["2026-11-08", "2026-11-09"], initial: "2026-11-08" });
    expect(serviceDateOptions(new Date(2026, 10, 9, 3, 59))).toEqual({ options: ["2026-11-08", "2026-11-09"], initial: "2026-11-08" });
  });
  it("the rest of the day offers only today", () => {
    const { serviceDateOptions } = census;
    expect(serviceDateOptions(new Date(2026, 10, 9, 4, 0))).toEqual({ options: ["2026-11-09"], initial: "2026-11-09" });
    expect(serviceDateOptions(new Date(2026, 10, 1, 23, 50))).toEqual({ options: ["2026-11-01"], initial: "2026-11-01" });
  });
  it("crosses month and year boundaries", () => {
    const { serviceDateOptions } = census;
    expect(serviceDateOptions(new Date(2027, 0, 1, 1, 0)).options).toEqual(["2026-12-31", "2027-01-01"]);
  });
});

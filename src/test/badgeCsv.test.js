import { describe, it, expect } from "vitest";
import { badgeCsvRegs, badgeCsvRows, badgeCsvText, badgeCsvFilename, BADGE_CSV_HEADERS } from "@/lib/badgeCsv";
import { regChurchFilter, clerkCities } from "@/lib/clerkScope";

const NWK = "Newark, NJ - EUA";
const KRN = "Kearny, NJ - EUA";
const event = { id: "e1", name: "Seminário de Dezembro", date: "2026-12-12", location: "Newark, NJ" };
const members = [{ id: "M1", firstName: "Ana", lastName: "Souza Lima" }];
const regs = [
  { id: 1, eventId: "e1", memberId: "M1", memberName: "Ana S. Lima", church: NWK, category: "Adulto", team: "", regNumber: "0001" },
  { id: 2, eventId: "e1", memberId: "M2", memberName: "José da Silva", church: KRN, category: "Jovem", team: "Louvor", regNumber: "0002" },
  { id: 3, eventId: "e1", memberId: "M3", memberName: "Caio", church: NWK, cancelled: true },
  { id: 4, eventId: "e1", memberId: "M4", memberName: "Duda", church: NWK, waitlisted: true },
  { id: 5, eventId: "e2", memberId: "M5", memberName: "Eva", church: NWK },
];

describe("badge CSV", () => {
  it("takes the event's active registrations only", () => {
    expect(badgeCsvRegs(regs, "e1").map((r) => r.id)).toEqual([1, 2]);
  });

  it("a secretary's church filter narrows it to their own church by default", () => {
    expect(badgeCsvRegs(regs, "e1", regChurchFilter("mine", [], clerkCities({ church: NWK }))).map((r) => r.id)).toEqual([1]);
    expect(badgeCsvRegs(regs, "e1", regChurchFilter("pick", [KRN], clerkCities({ church: NWK }))).map((r) => r.id)).toEqual([2]);
  });

  it("builds the Canva columns: directory first/last name, team default, place and month", () => {
    expect(badgeCsvRows(badgeCsvRegs(regs, "e1"), event, members)).toEqual([
      ["Ana", "Souza Lima", "Participante", NWK, "Adulto", "Newark", "Dezembro 2026", "0001"],
      ["José", "da Silva", "Louvor", KRN, "Jovem", "Newark", "Dezembro 2026", "0002"],
    ]);
  });

  it("writes a BOM, the headers and quoted cells with CRLF", () => {
    const text = badgeCsvText([["Ana", 'diz "oi"']]);
    expect(text).toBe("﻿" + BADGE_CSV_HEADERS.join(",") + '\r\n"Ana","diz ""oi"""');
  });

  it("names the file after the event, plus the church when given", () => {
    expect(badgeCsvFilename(event)).toBe("crachas-Seminário-de-Dezembro.csv");
    expect(badgeCsvFilename(event, "Newark")).toBe("crachas-Seminário-de-Dezembro-Newark.csv");
  });
});

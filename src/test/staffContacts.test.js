import { describe, it, expect } from "vitest";
import { staffContactCheck } from "@/lib/contact";
import { contactExportRows, CONTACT_EXPORT_HEADERS, toCsv } from "@/lib/contactExport";

const ev = { id: "e1", require_contact: true };
const ana = { id: "m1", name: "Ana", category: "Adulto" };
const bia = { id: "m2", name: "Bia", category: "Jovem" };
const kid = { id: "m3", name: "Caio", category: "CIA 4-7" };

describe("staffContactCheck: contact asked in staff registration", () => {
  it("asks nothing when the event does not require contact", () => {
    const r = staffContactCheck({ event: { id: "e1" }, people: [ana] });
    expect(r.needed).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it("asks young people and adults with no contact, not children", () => {
    const r = staffContactCheck({ event: ev, people: [ana, bia, kid] });
    expect(r.needed.map((p) => p.id)).toEqual(["m1", "m2"]);
    expect(r.valid).toBe(false);
  });

  it("skips who already has both on file, and only asks the missing field", () => {
    const status = { m1: { hasPhone: true, hasEmail: true }, m2: { hasPhone: true, hasEmail: false } };
    const r = staffContactCheck({ event: ev, people: [ana, bia], status, values: { m2: { email: "bia@x.com" } } });
    expect(r.needed.map((p) => p.id)).toEqual(["m2"]);
    expect(r.valid).toBe(true);
  });

  it("rejects an invalid phone or e-mail", () => {
    const r = staffContactCheck({ event: ev, people: [ana], values: { m1: { phone: "123", email: "nope" } } });
    expect(r.errors.m1).toEqual({ phone: "invalid", email: "invalid" });
    expect(r.valid).toBe(false);
  });

  it("is valid once everything is filled in", () => {
    const r = staffContactCheck({ event: ev, people: [ana], values: { m1: { phone: "+1 973 555 0100", email: "ana@x.com" } } });
    expect(r.valid).toBe(true);
  });
});

describe("contacts CSV export", () => {
  const regs = [
    { id: "r1", eventId: "e1", memberId: "m2", memberName: "Bia", regNumber: "002", category: "Jovem", church: "Newark", team: "Louvor", paid: true },
    { id: "r2", eventId: "e1", memberId: "m1", memberName: "Ana", regNumber: "001", category: "Adulto", church: "Newark" },
    { id: "r3", eventId: "e1", memberId: "m3", memberName: "Caio", cancelled: true },
    { id: "r4", eventId: "e2", memberId: "m4", memberName: "Outro" },
  ];
  const contacts = { m1: { phone: "+1 973 555 0100", email: "ana@x.com" } };

  it("lists the event's active registrations by name, with phone and e-mail", () => {
    const rows = contactExportRows(regs, "e1", contacts);
    expect(rows).toEqual([
      ["001", "Ana", "Adulto", "Newark", "", "Pendente", "+1 973 555 0100", "ana@x.com"],
      ["002", "Bia", "Jovem", "Newark", "Louvor", "Pago", "", ""],
    ]);
  });

  it("writes quoted CSV with a BOM", () => {
    const csv = toCsv(CONTACT_EXPORT_HEADERS, [["1", 'A "b"']]);
    expect(csv.startsWith("﻿\"Inscrição\"")).toBe(true);
    expect(csv).toContain('"A ""b"""');
  });
});

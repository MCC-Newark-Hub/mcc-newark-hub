import { describe, it, expect } from "vitest";
import {
  contactTargets, contactErrors, eventRequiresContact, isValidEmail, isValidPhone, contactStatusMap, hasFullContact, splitContactChange,
} from "../lib/contact.js";

const p = (id, category) => ({ id, name: id, category });

describe("contactTargets", () => {
  it("asks every Jovem and Adulto, not the children", () => {
    expect(contactTargets([p("a", "Adulto"), p("k", "Criança"), p("j", "Jovem"), p("b", "0-3")]).map((x) => x.id)).toEqual(["a", "j"]);
  });

  it("asks the first person when nobody is Jovem or Adulto", () => {
    expect(contactTargets([p("t", "Adolescente"), p("k", "Criança")]).map((x) => x.id)).toEqual(["t"]);
    expect(contactTargets([])).toEqual([]);
  });
});

describe("eventRequiresContact", () => {
  it("reads the DB column or the camelCase copy", () => {
    expect(eventRequiresContact({ require_contact: true })).toBe(true);
    expect(eventRequiresContact({ requireContact: true })).toBe(true);
    expect(eventRequiresContact({})).toBe(false);
    expect(eventRequiresContact(null)).toBe(false);
  });
});

describe("validation", () => {
  it("phone needs at least 10 digits", () => {
    expect(isValidPhone("+1 (973) 555-0100")).toBe(true);
    expect(isValidPhone("555-0100")).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });

  it("e-mail needs a user, a domain and a dot", () => {
    expect(isValidEmail(" Ana@Example.com ")).toBe(true);
    expect(isValidEmail("ana@example")).toBe(false);
    expect(isValidEmail("ana example.com")).toBe(false);
  });

  it("contactErrors: required only when the event asks and nothing is on file", () => {
    expect(contactErrors({}, { required: false })).toEqual({});
    expect(contactErrors({}, { required: true })).toEqual({ phone: "required", email: "required" });
    expect(contactErrors({}, { required: true, onFile: { hasPhone: true, hasEmail: true } })).toEqual({});
    expect(contactErrors({ phone: "123", email: "x@y.com" }, { required: true })).toEqual({ phone: "invalid" });
    expect(contactErrors({ email: "bad" })).toEqual({ email: "invalid" });
  });
});

describe("contactStatusMap", () => {
  it("maps the RPC rows", () => {
    const map = contactStatusMap([{ member_id: "M1", has_phone: true, has_email: false }]);
    expect(map).toEqual({ M1: { hasPhone: true, hasEmail: false } });
    expect(hasFullContact(map.M1)).toBe(false);
    expect(hasFullContact(undefined)).toBe(false);
  });
});

describe("splitContactChange", () => {
  it("fills what is empty on file and asks staff to change what is on file", () => {
    expect(splitContactChange({ phone: " 973 555 0101 ", email: "Ana@X.com" }, {}))
      .toEqual({ fill: { phone: "973 555 0101", email: "ana@x.com" }, change: null });
    expect(splitContactChange({ phone: "9735550101", email: "ana@x.com" }, { hasPhone: true }))
      .toEqual({ fill: { email: "ana@x.com" }, change: { phone: "9735550101" } });
    expect(splitContactChange({ email: "new@x.com" }, { hasPhone: true, hasEmail: true }))
      .toEqual({ fill: null, change: { email: "new@x.com" } });
  });

  it("leaves blank fields out", () => {
    expect(splitContactChange({}, { hasPhone: true, hasEmail: true })).toEqual({ fill: null, change: null });
    expect(splitContactChange(undefined, undefined)).toEqual({ fill: null, change: null });
  });
});

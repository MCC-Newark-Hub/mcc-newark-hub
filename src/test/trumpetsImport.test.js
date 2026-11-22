import { describe, it, expect } from "vitest";
import { parseCsv } from "@/lib/csv";
import { mapColumns, buildImportPreview, templateRows, foldHeader, EXAMPLE } from "@/lib/trumpetsImport";
import { guestKey, IMPORT_MAX } from "@/lib/trumpets";
import { STRINGS } from "@/i18n/strings";

const NWK = "Newark, NJ - EUA";
const gas = [
  { id: "GA1", name: "GA Central", church: NWK },
  { id: "GA2", name: "GA Norte", church: NWK },
];
const members = [
  { id: "M1", name: "Ana Souza", church: NWK, gaId: "GA1" },
  { id: "M2", name: "José Lima", church: NWK, gaId: "GA2" },
  { id: "M3", name: "Paulo", church: NWK, gaId: "GA1" },
  { id: "M4", name: "Paulo", church: NWK, gaId: "GA2" },
  { id: "M5", name: "Rui", church: "Kearny, NJ - EUA", gaId: "GA9" },
  { id: "M6", name: "Lia", church: NWK, gaId: "GA1" },
  { id: "M7", name: "Lia", church: NWK, gaId: "GA1" },
];
const preview = (text, opts = {}) => buildImportPreview(parseCsv(text), { gas, defaultGaId: "GA1", members, existing: [], ...opts });

describe("mapColumns", () => {
  it("recognizes PT headers, accents and case ignored", () => {
    const m = mapColumns(["Nome", "Telefone", "E-mail (opcional)", "Convidado por", "GA", "Observações"]);
    expect(m.columns).toEqual({ name: 0, phone: 1, email: 2, invitedBy: 3, ga: 4, notes: 5 });
    expect(m.missing).toEqual([]);
    expect(m.unknown).toEqual([]);
  });

  it("recognizes EN headers and synonyms (celular, WhatsApp, quem convidou, grupo)", () => {
    expect(mapColumns(["NAME", "Phone", "Email", "Invited by", "Group", "Notes"]).columns).toEqual({ name: 0, phone: 1, email: 2, invitedBy: 3, ga: 4, notes: 5 });
    expect(mapColumns(["Nome completo", "WhatsApp", "Quem convidou", "Grupo de Assistência"]).columns).toEqual({ name: 0, phone: 1, invitedBy: 2, ga: 3 });
    expect(mapColumns(["nome", "celular"]).columns).toEqual({ name: 0, phone: 1 });
  });

  it("lists unknown and repeated columns, and the required ones that are missing", () => {
    const m = mapColumns(["Nome", "Idade", "Nome", ""]);
    expect(m.unknown).toEqual(["Idade", "Nome"]);
    expect(m.missing).toEqual([]);
    expect(mapColumns(["Telefone", "E-mail"]).missing).toEqual(["name"]);
  });

  it("the template headers map back to every field, in both languages", () => {
    for (const lang of ["pt", "en"]) {
      const [head] = templateRows(STRINGS[lang].tf, "GA Central");
      expect(Object.keys(mapColumns(head).columns).sort()).toEqual(["email", "ga", "invitedBy", "name", "notes", "phone"]);
    }
    expect(foldHeader("  E-MAIL (Opcional) ")).toBe("e mail opcional");
  });
});

describe("buildImportPreview", () => {
  it("builds the input for valid rows: GA by name, inviter by name in the GA's church, default GA when empty", () => {
    const p = preview("Nome,Telefone,E-mail,Convidado por,GA,Notas\nRita,(973) 555-0101,RITA@x.com,ana souza,ga norte,vem sábado\nBeto,973 555 0102,,,,");
    expect(p.counts).toEqual({ valid: 2, invalid: 0, duplicate: 0 });
    expect(p.rows[0]).toMatchObject({
      line: 2,
      status: "valid",
      input: { gaId: "GA2", name: "Rita", phone: "(973) 555-0101", email: "RITA@x.com", invitedByMemberId: "M1", notes: "vem sábado" },
      view: { ga: "GA Norte", invitedBy: "Ana Souza" },
    });
    expect(p.rows[1].input).toMatchObject({ gaId: "GA1", invitedByMemberId: "" });
  });

  it("works with no GA column and with ; delimited files", () => {
    const p = preview("Nome;Telefone\nRita;9735550101", { defaultGaId: "GA2" });
    expect(p.rows[0].input.gaId).toBe("GA2");
  });

  it("marks invalid rows with every reason", () => {
    const p = preview([
      "Nome,Telefone,E-mail,Convidado por,GA",
      ",,,,",                                   // blank → skipped by the parser
      ",123,nope,,",                            // line 3
      "Rita,9735550101,,Fulano,GA Sul",         // line 4
      "Caio,9735550103,,Rui,",                  // line 5: Rui is in another church
      "Duda,9735550104,,Lia,",                  // line 6: two Lias in the GA
      `${"x".repeat(121)},9735550105,,,`,        // line 7
    ].join("\n"));
    expect(p.counts).toEqual({ valid: 0, invalid: 5, duplicate: 0 });
    const codes = Object.fromEntries(p.rows.map((r) => [r.line, r.reasons.map((x) => x.code)]));
    expect(codes).toEqual({
      3: ["missing_name", "invalid_phone", "invalid_email"],
      4: ["unknown_ga", "unknown_inviter"],
      5: ["unknown_inviter"],
      6: ["ambiguous_inviter"],
      7: ["invalid_name"],
    });
    expect(p.rows[0].reasons[1]).toEqual({ code: "invalid_phone", value: "123" });
    expect(p.rows.every((r) => r.input === null)).toBe(true);
  });

  it("an inviter name shared by members of two GAs picks the one in the row's GA", () => {
    const p = preview("Nome,Telefone,Convidado por,GA\nRita,9735550101,Paulo,GA Norte\nBia,9735550102,Paulo,");
    expect(p.rows.map((r) => r.input.invitedByMemberId)).toEqual(["M4", "M3"]);
  });

  it("the phone is optional: no phone column, or an empty cell, is a valid row", () => {
    const noColumn = preview("Nome,E-mail\nRita,r@x.com");
    expect(noColumn.rows[0]).toMatchObject({ status: "valid", input: { name: "Rita", phone: "", email: "r@x.com" } });
    const emptyCell = preview("Nome,Telefone\nRita,");
    expect(emptyCell.rows[0]).toMatchObject({ status: "valid", input: { phone: "" } });
  });

  it("without a phone, the same name is a duplicate only of another guest without a phone", () => {
    const p = preview("Nome,Telefone\nRita,\nrita,\nRita,9735550101", { existing: [{ name: "Beto", phone: "" }] });
    expect(p.rows.map((r) => r.status)).toEqual(["valid", "duplicate", "valid"]);
  });

  it("a missing default GA asks for the GA", () => {
    const p = preview("Nome,Telefone\nRita,", { defaultGaId: "", gas: [] });
    expect(p.rows[0].reasons.map((r) => r.code)).toEqual(["missing_ga"]);
  });

  it("flags duplicates against the list and inside the file (same name and phone, format ignored)", () => {
    const existing = [{ name: "Rita Alves", phone: "+1 973-555-0101" }];
    const p = preview("Nome,Telefone\nrita  alves,(973) 555-0101\nBeto,9735550102\nBETO,973.555.0102\nBeto,9735550199", { existing });
    expect(p.rows.map((r) => r.status)).toEqual(["duplicate", "valid", "duplicate", "valid"]);
    expect(p.rows[0].reasons).toEqual([{ code: "dup_existing" }]);
    expect(p.rows[2].reasons).toEqual([{ code: "dup_file", line: 3 }]);
    expect(p.counts).toEqual({ valid: 2, invalid: 0, duplicate: 2 });
  });

  it("never imports the template's example line", () => {
    const p = preview(`Nome,Telefone\n${EXAMPLE.name},${EXAMPLE.phone}`);
    expect(p.rows[0]).toMatchObject({ status: "invalid", reasons: [{ code: "example_row" }] });
  });

  it("stops with no rows when a required column is missing or the file is too big", () => {
    const missing = preview("Telefone,E-mail\n9735550101,r@x.com");
    expect(missing.missing).toEqual(["name"]);
    expect(missing.rows).toEqual([]);
    const big = preview("Nome,Telefone\n" + Array.from({ length: IMPORT_MAX + 1 }, (_, i) => `G${i},97355${String(i).padStart(5, "0")}`).join("\n"));
    expect(big.tooMany).toBe(true);
    expect(big.rows).toEqual([]);
  });
});

describe("guestKey", () => {
  it("ignores accents, case, spaces and phone formatting / country code", () => {
    expect(guestKey(" José  Lima ", "+1 (973) 555-0101")).toBe(guestKey("jose lima", "9735550101"));
    expect(guestKey("Ana", "9735550101")).not.toBe(guestKey("Ana", "9735550102"));
  });
});

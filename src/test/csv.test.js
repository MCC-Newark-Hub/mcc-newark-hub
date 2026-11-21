import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvObjects, detectDelimiter, decodeCsvBuffer, toCsv, sanitizeCsvText } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads headers and records with the file line of each record", () => {
    const { headers, records } = parseCsv("Nome,Telefone\nAna,973-555-0101\n\nBeto,973-555-0102\n");
    expect(headers).toEqual(["Nome", "Telefone"]);
    expect(records).toEqual([
      { line: 2, cells: ["Ana", "973-555-0101"] },
      { line: 4, cells: ["Beto", "973-555-0102"] },
    ]);
  });

  it("handles quoted commas, escaped quotes, CRLF and line breaks inside quotes", () => {
    const text = 'Nome,Notas\r\n"Silva, Ana","disse ""sim"""\r\n"Beto","linha 1\nlinha 2"\r\nCaio,ok';
    const { records } = parseCsv(text);
    expect(records.map((r) => r.cells)).toEqual([["Silva, Ana", 'disse "sim"'], ["Beto", "linha 1\nlinha 2"], ["Caio", "ok"]]);
    expect(records.map((r) => r.line)).toEqual([2, 3, 5]);
  });

  it("detects ; (Excel in Portuguese) and tab delimiters", () => {
    expect(detectDelimiter("Nome;Telefone;E-mail\nAna;1;x")).toBe(";");
    expect(detectDelimiter("Nome\tTelefone")).toBe("\t");
    expect(detectDelimiter('"a;b",c')).toBe(",");
    expect(parseCsv("Nome;Telefone\nAna;(973) 555-0101").records[0].cells).toEqual(["Ana", "(973) 555-0101"]);
  });

  it("drops a UTF-8 BOM, trims cells and turns smart quotes straight", () => {
    const { headers, records } = parseCsv("\uFEFF Nome , Notas\n  Ana  ,\u201cvip\u201d");
    expect(headers).toEqual(["Nome", "Notas"]);
    expect(records[0].cells).toEqual(["Ana", "vip"]); // smart quotes become straight, so they quote the cell
    expect(sanitizeCsvText("it\u2019s\uFFFD")).toBe("it's");
  });

  it("keeps empty cells and returns nothing for an empty file", () => {
    expect(parseCsv("a,b,c\n1,,3").records[0].cells).toEqual(["1", "", "3"]);
    expect(parseCsv("")).toEqual({ headers: [], records: [] });
  });
});

describe("parseCsvObjects (AdminImport)", () => {
  it("keys every row by header, filling missing cells with empty strings", () => {
    expect(parseCsvObjects("id,name,church\n1,Ana\n,,\n2,Beto,Newark")).toEqual([
      { id: "1", name: "Ana", church: "" },
      { id: "2", name: "Beto", church: "Newark" },
    ]);
  });
});

describe("decodeCsvBuffer", () => {
  it("reads UTF-8, and falls back to Windows-1252 for old Excel files", () => {
    expect(decodeCsvBuffer(new TextEncoder().encode("João"))).toBe("João");
    expect(decodeCsvBuffer(new Uint8Array([0x4a, 0x6f, 0xe3, 0x6f]))).toBe("João");
  });
});

describe("toCsv", () => {
  it("quotes only cells that need it", () => {
    expect(toCsv([["Nome", "Notas"], ["Silva, Ana", 'diz "oi"'], ["Beto", ""]])).toBe('Nome,Notas\n"Silva, Ana","diz ""oi"""\nBeto,');
  });
  it("round-trips through parseCsv", () => {
    const rows = [["a", "b"], ["x;y", "1,2"], ["quebra\nlinha", '"']];
    expect(parseCsv(toCsv(rows)).records.map((r) => r.cells)).toEqual(rows.slice(1));
  });
});

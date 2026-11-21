// CSV import helpers shared by Diretório › Importar (AdminImport) and Trombetas › Importar CSV.
// Pure: no React, no Supabase.

// Smart quotes from Word / Excel → straight quotes; drop U+FFFD left by a bad decode.
export function sanitizeCsvText(s) {
  if (typeof s !== "string") return s;
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c === 0x2018 || c === 0x2019) out += "'";
    else if (c === 0x201c || c === 0x201d) out += '"';
    else if (c !== 0xfffd) out += ch;
  }
  return out;
}

// Excel saves CSV with ";" where the decimal separator is a comma (pt-BR and many other locales), so the
// delimiter is whichever of , ; or tab appears most in the header line, outside quotes.
export function detectDelimiter(text) {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let inQ = false;
  for (const ch of String(text || "")) {
    if (ch === '"') inQ = !inQ;
    else if (!inQ && (ch === "\n" || ch === "\r")) break;
    else if (!inQ && ch in counts) counts[ch] += 1;
  }
  return Object.keys(counts).reduce((best, d) => (counts[d] > counts[best] ? d : best), ",");
}

// RFC 4180-ish: quoted cells may hold the delimiter, "" for a quote and line breaks. Returns
// { headers, records: [{ line, cells }] } with every cell trimmed; `line` is the file line where the record
// starts (the header is line 1), so an error can point at the right row in the spreadsheet. Blank rows are skipped.
export function parseCsv(input, { delimiter } = {}) {
  const text = sanitizeCsvText(String(input || "")).replace(/^\uFEFF/, "");
  const d = delimiter || detectDelimiter(text);
  const records = [];
  let cells = [];
  let cur = "";
  let inQ = false;
  let line = 1;
  let start = 1;
  const endCell = () => { cells.push(cur.trim()); cur = ""; };
  const endRecord = () => {
    endCell();
    if (cells.some((c) => c !== "")) records.push({ line: start, cells });
    cells = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else {
        if (ch === "\n") line += 1;
        cur += ch;
      }
    } else if (ch === '"') inQ = true;
    else if (ch === d) endCell();
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRecord();
      line += 1;
      start = line;
    } else cur += ch;
  }
  if (cur !== "" || cells.length) endRecord();
  const [head, ...rest] = records;
  return { headers: head ? head.cells : [], records: rest };
}

// Rows as objects keyed by the header text (what AdminImport's templates validate).
export function parseCsvObjects(text) {
  const { headers, records } = parseCsv(text);
  return records.map(({ cells }) => Object.fromEntries(headers.map((h, j) => [h, cells[j] || ""])));
}

// Bytes from a FileReader: UTF-8 when it decodes cleanly, else Windows-1252 (old Excel on Windows).
export function decodeCsvBuffer(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

const quote = (v) => {
  const s = String(v ?? "");
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// rows: arrays of cells → CSV text (comma-separated, quoted only when needed).
export const toCsv = (rows) => rows.map((cols) => cols.map(quote).join(",")).join("\n");

// Saves CSV text as a file. The BOM makes Excel read accents as UTF-8.
export function downloadCsvFile(filename, text) {
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

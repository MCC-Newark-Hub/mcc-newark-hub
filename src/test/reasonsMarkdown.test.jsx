import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { parseReasons, parseInlineMarkdown, markdownToWhatsApp, parseReasonBlocks, reasonsToWhatsApp, buildShareText } from "@/lib/prayerSlots";
import { STRINGS } from "@/i18n/strings";

const exportImage = vi.fn(() => Promise.resolve());
vi.mock("@/lib/exportElement", () => ({ exportImage: (...a) => exportImage(...a) }));

import ReasonsMarkdown from "@/components/ReasonsMarkdown";
import ReasonsImageButton from "@/components/ReasonsImageButton";

describe("reasons: block markdown", () => {
  it("keeps one line per reason and no longer eats the stars of **bold** at the start of a line", () => {
    expect(parseReasons("# Eleições\n**Atenção** aos prazos\n- Pátria\n• Paz\n* Justiça")).toEqual(["# Eleições", "**Atenção** aos prazos", "Pátria", "Paz", "Justiça"]);
  });

  it("recognizes headings of every level, dividers, quotes and numbered items; the rest are list items", () => {
    const blocks = parseReasonBlocks(["# Um", "###### Seis", "Pela pátria", "Pela paz", "---", "1. Primeiro", "2. Segundo", "> Orai sem cessar", "> 1 Ts 5.17", "#sem espaço não é título"]);
    expect(blocks).toEqual([
      { type: "heading", level: 1, text: "Um" },
      { type: "heading", level: 6, text: "Seis" },
      { type: "list", ordered: false, items: ["Pela pátria", "Pela paz"] },
      { type: "rule" },
      { type: "list", ordered: true, items: ["Primeiro", "Segundo"] },
      { type: "quote", lines: ["Orai sem cessar", "1 Ts 5.17"] },
      { type: "list", ordered: false, items: ["#sem espaço não é título"] },
    ]);
  });

  it("knows strikethrough and code inline", () => {
    expect(parseInlineMarkdown("~~velho~~ e `novo`")).toEqual([
      { type: "strike", text: "velho" }, { type: "text", text: " e " }, { type: "code", text: "novo" },
    ]);
  });

  it("converts the blocks to WhatsApp text (headings in bold, lists, quotes)", () => {
    expect(reasonsToWhatsApp(["# Eleições", "Pela **pátria**", "1. Um", "2. Dois", "> citação", "---"]))
      .toEqual(["", "*Eleições*", "- Pela *pátria*", "1. Um", "2. Dois", "> citação", "———"]);
    expect(markdownToWhatsApp("~~x~~")).toBe("~x~");
    const text = buildShareText({ title: "T", start_date: "2026-10-26", end_date: "2026-10-31", reasons: ["## Pátria", "Paz"] }, [], "pt");
    expect(text).toContain("*Pátria*");
    expect(text).toContain("- Paz");
  });
});

describe("<ReasonsMarkdown>", () => {
  it("renders headings as real headings (a # is an h2 under the page's h1), lists, quotes and dividers", () => {
    const { container } = render(<ReasonsMarkdown reasons={["# Eleições", "### Detalhe", "Pela **pátria**", "1. Um", "> citação", "---"]} />);
    expect(screen.getByRole("heading", { level: 2, name: "Eleições" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 4, name: "Detalhe" })).toBeTruthy();
    expect(container.querySelector("ul li strong").textContent).toBe("pátria");
    expect(container.querySelector("ol li").textContent).toBe("Um");
    expect(container.querySelector("blockquote").textContent).toBe("citação");
    expect(container.querySelector("hr")).toBeTruthy();
  });

  it("never injects HTML", () => {
    const { container } = render(<ReasonsMarkdown reasons={["# <img src=x onerror=alert(1)>", "<script>alert(1)</script>", "[x](javascript:alert(1))"]} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("<ReasonsImageButton>", () => {
  const period = { id: "oracao24h-003", title: "ORAÇÃO 24H", circular: "163-26", start_date: "2026-10-26", end_date: "2026-10-31", reasons: ["# Motivos", "Pela pátria"] };
  beforeEach(() => exportImage.mockClear());

  it("exports the intentions sheet as an image, mounting the sheet only while exporting", async () => {
    render(<ReasonsImageButton period={period} lang="pt" />);
    expect(screen.queryByText("IGREJA CRISTÃ MARANATA")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(STRINGS.pt.prayerReasonsImage) }));
    await waitFor(() => expect(exportImage).toHaveBeenCalledTimes(1));
    expect(exportImage.mock.calls[0][1]).toBe("motivos-oracao24h-003");
    await waitFor(() => expect(screen.queryByText("IGREJA CRISTÃ MARANATA")).toBeNull());
  });

  it("shows an error when the export fails", async () => {
    exportImage.mockImplementationOnce(() => Promise.reject(new Error("boom")));
    render(<ReasonsImageButton period={period} lang="en" />);
    fireEvent.click(screen.getByRole("button", { name: /Download image/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("renders nothing when the list has no intentions", () => {
    const { container } = render(<ReasonsImageButton period={{ ...period, reasons: [] }} lang="pt" />);
    expect(container.innerHTML).toBe("");
  });

  it("has its texts in both languages", () => {
    for (const lang of ["pt", "en"]) {
      for (const k of ["prayerReasonsImage", "prayerReasonsExporting", "prayerReasonsExportFailed", "prayerReasonsHint"]) expect(STRINGS[lang][k]).toBeTruthy();
    }
  });
});

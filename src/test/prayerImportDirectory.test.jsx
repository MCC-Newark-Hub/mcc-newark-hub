import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

const insert = vi.fn((rows) => ({ select: () => Promise.resolve({ data: rows.map((_, i) => ({ id: String(i) })), error: null }) }));
const deleted = vi.fn();
vi.mock("@/lib/supabase", () => ({
  sb: { from: () => ({
    insert: (rows) => insert(rows),
    select: () => ({ in: () => Promise.resolve({ data: [] }) }),
    delete: () => ({ in: (_col, ids) => ({ select: () => { deleted(ids); return Promise.resolve({ data: ids.map((id) => ({ id })), error: null }); } }) }),
  }) },
}));

const SHEET = [
  ["HORÁRIO", "NOME", "IGREJA"],
  ["03:00", "Mara N.", "Newark, NJ"],
  ["03:15", "Fabio", "Newark, NJ"],
  ["03:30", "Elsa", "Newark, NJ"],
];
vi.mock("read-excel-file/browser", () => ({ readSheet: () => Promise.resolve(SHEET) }));

import PrayerImportModal from "@/components/PrayerImportModal";

const members = [
  { id: "m1", name: "Mara Nunes", church: "Newark, NJ" },
  { id: "m2", name: "Fabio Santos", church: "Newark, NJ" },
  { id: "m3", name: "Fabio Lima", church: "Toms River, NJ" },
];
const churches = [{ display: "Newark, NJ" }, { display: "Toms River, NJ" }];
const period = { id: "oracao24h-003", title: "T", scope_kind: "all", scope_group_ids: [], scope_churches: [], slot_capacity: 3 };

async function open(slots = []) {
  const onDone = vi.fn();
  const { container } = render(<PrayerImportModal period={period} slots={slots} churches={churches} groups={[]} members={members} lang="pt" onClose={() => {}} onDone={onDone} />);
  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(["x"], "p.xlsx")] } });
  await screen.findByText("Mara Nunes");
  return onDone;
}
const rowOf = (text) => screen.getAllByRole("row").find((r) => r.textContent.includes(text));

describe("import: the names are checked against the directory before saving", () => {
  beforeEach(() => { insert.mockClear(); deleted.mockClear(); });

  it("links a clear match automatically and shows who it is", async () => {
    await open();
    const row = rowOf("Mara Nunes");
    expect(within(row).getByRole("combobox").value).toBe("m1");
    expect(within(row).getByText(/na planilha: Mara N\./)).toBeTruthy();
    expect(within(row).getByText("Confira a sugestão do cadastro")).toBeTruthy();
  });

  it("an ambiguous first name is not guessed: the admin is asked to choose", async () => {
    await open();
    const row = rowOf("Fabio");
    expect(within(row).getByRole("combobox").value).toBe("");
    expect(within(row).getByText("Há mais de uma opção: escolha quem é")).toBeTruthy();
    expect(within(row).getAllByRole("option").map((o) => o.textContent)).toEqual(expect.arrayContaining(["Fabio Santos — Newark, NJ", "Fabio Lima — Toms River, NJ"]));
  });

  it("a name that is not in the directory stays as typed", async () => {
    await open();
    expect(within(rowOf("Elsa")).getByText("Não está no cadastro: fica como digitado")).toBeTruthy();
  });

  it("choosing a person changes the name and the church of the row and is what gets saved", async () => {
    const onDone = await open();
    const fabio = rowOf("Fabio");
    fireEvent.change(within(fabio).getByRole("combobox"), { target: { value: "m3" } });
    const updated = rowOf("Fabio Lima");
    expect(within(updated).getByText("Toms River, NJ")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Importar/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const payload = insert.mock.calls[0][0];
    expect(payload.find((p) => p.member_name === "Mara Nunes")).toMatchObject({ member_id: "m1", church: "Newark, NJ", slot_index: 12 });
    expect(payload.find((p) => p.member_name === "Fabio Lima")).toMatchObject({ member_id: "m3", church: "Toms River, NJ" });
    expect(payload.find((p) => p.member_name === "Elsa")).toMatchObject({ member_id: null, church: "Newark, NJ" });
  });

  it("'keep as typed' undoes the automatic suggestion", async () => {
    await open();
    fireEvent.change(within(rowOf("Mara Nunes")).getByRole("combobox"), { target: { value: "" } });
    expect(within(rowOf("Mara N.")).getByText("Newark, NJ")).toBeTruthy();
    expect(screen.queryByText("Mara Nunes")).toBeNull();
  });

  it("'search someone else' finds any member of the accepted churches", async () => {
    await open();
    fireEvent.change(within(rowOf("Elsa")).getByRole("combobox"), { target: { value: "__search" } });
    fireEvent.change(screen.getByPlaceholderText("Buscar no cadastro…"), { target: { value: "fabio li" } });
    fireEvent.click(screen.getByRole("button", { name: "Fabio Lima — Toms River, NJ" }));
    const row = screen.getAllByRole("row").find((r) => r.cells[1]?.textContent.startsWith("03:30"));
    expect(within(row).getByText("No cadastro")).toBeTruthy();
    expect(within(row).getByText("Toms River, NJ")).toBeTruthy();
  });

  it("'Não importar' leaves a person out of the import, and can be undone", async () => {
    const onDone = await open();
    fireEvent.click(within(rowOf("Elsa")).getByRole("button", { name: "Não importar Elsa" }));
    const out = rowOf("Elsa");
    expect(within(out).getByText("Não será importada")).toBeTruthy();
    expect(screen.getByText(/1 fora da importação/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Importar 2/ })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Importar 2/ }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    const payload = insert.mock.calls[0][0];
    expect(payload.map((p) => p.member_name)).toEqual(["Mara Nunes", "Fabio"]);
  });

  it("'Incluir de novo' brings the row back", async () => {
    await open();
    fireEvent.click(within(rowOf("Elsa")).getByRole("button", { name: "Não importar Elsa" }));
    fireEvent.click(within(rowOf("Elsa")).getByRole("button", { name: "Incluir Elsa de novo" }));
    expect(screen.queryByText("Não será importada")).toBeNull();
    expect(screen.getByRole("button", { name: /Importar 3/ })).toBeTruthy();
    expect(screen.queryByText(/fora da importação/)).toBeNull();
  });

  it("with every row left out there is nothing to import", async () => {
    await open();
    for (const name of ["Mara Nunes", "Fabio", "Elsa"]) {
      fireEvent.click(within(rowOf(name)).getByRole("button", { name: new RegExp(`^Não importar ${name}`) }));
    }
    expect(screen.getByRole("button", { name: /Importar 0/ }).disabled).toBe(true);
    expect(screen.getByText(/3 fora da importação/)).toBeTruthy();
  });

  it("has the new texts in both languages", async () => {
    const { STRINGS } = await import("@/i18n/strings");
    for (const lang of ["pt", "en"]) for (const k of ["prayerImportSkip", "prayerImportSkipRow", "prayerImportSkippedRow", "prayerImportSkippedCount", "prayerImportRestore", "prayerImportRestoreRow"]) expect(STRINGS[lang][k]).toBeTruthy();
  });

  describe("a person who is already in the list at another time", () => {
    // Mara Nunes (m1) is already saved at 10:00 (slot 40); the sheet puts "Mara N." at 03:00
    const saved = [{ id: "old1", slot_index: 40, member_id: "m1", member_name: "Mara Nunes", church: "Newark, NJ" }];
    const choice = () => within(rowOf("Mara Nunes")).getByRole("combobox", { name: /já estava no período/ });

    it("is flagged with the time she is already in, and by default both are kept", async () => {
      const onDone = await open(saved);
      expect(within(rowOf("Mara Nunes")).getByText("Já estava neste período às 10:00-10:15")).toBeTruthy();
      expect(choice().value).toBe("both");
      fireEvent.click(screen.getByRole("button", { name: /Importar 3/ }));
      await waitFor(() => expect(onDone).toHaveBeenCalled());
      expect(insert.mock.calls[0][0].map((p) => p.member_name)).toContain("Mara Nunes");
      expect(deleted).not.toHaveBeenCalled();
    });

    it("'keep only what was already there' leaves her out of the import", async () => {
      const onDone = await open(saved);
      fireEvent.change(choice(), { target: { value: "keep" } });
      expect(within(rowOf("Mara Nunes")).getByText("Não será importada: fica o horário que já estava")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /Importar 2/ }));
      await waitFor(() => expect(onDone).toHaveBeenCalled());
      expect(insert.mock.calls[0][0].map((p) => p.member_name)).not.toContain("Mara Nunes");
      expect(deleted).not.toHaveBeenCalled();
    });

    it("'use the sheet's' saves the new time and deletes the old one", async () => {
      const onDone = await open(saved);
      fireEvent.change(choice(), { target: { value: "replace" } });
      fireEvent.click(screen.getByRole("button", { name: /Importar 3/ }));
      await waitFor(() => expect(onDone).toHaveBeenCalled());
      expect(insert.mock.calls[0][0].find((p) => p.member_name === "Mara Nunes")).toMatchObject({ slot_index: 12 });
      expect(deleted).toHaveBeenCalledWith(["old1"]);
      expect(onDone.mock.calls[0][0]).toContain("1 horários antigos substituídos");
    });

    it("nothing is asked about people who are not in the list yet", async () => {
      await open(saved);
      expect(within(rowOf("Elsa")).queryByRole("combobox", { name: /já estava no período/ })).toBeNull();
    });
  });
});

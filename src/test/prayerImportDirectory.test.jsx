import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

const insert = vi.fn((rows) => ({ select: () => Promise.resolve({ data: rows.map((_, i) => ({ id: String(i) })), error: null }) }));
vi.mock("@/lib/supabase", () => ({ sb: { from: () => ({ insert: (rows) => insert(rows), select: () => ({ in: () => Promise.resolve({ data: [] }) }) }) } }));

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

async function open() {
  const onDone = vi.fn();
  const { container } = render(<PrayerImportModal period={period} slots={[]} churches={churches} groups={[]} members={members} lang="pt" onClose={() => {}} onDone={onDone} />);
  const input = container.querySelector('input[type="file"]');
  fireEvent.change(input, { target: { files: [new File(["x"], "p.xlsx")] } });
  await screen.findByText("Mara Nunes");
  return onDone;
}
const rowOf = (text) => screen.getAllByRole("row").find((r) => r.textContent.includes(text));

describe("import: the names are checked against the directory before saving", () => {
  beforeEach(() => insert.mockClear());

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
});

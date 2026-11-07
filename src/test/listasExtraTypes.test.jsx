import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({ sb: { from: () => ({}) } }));
import ListasTab from "@/views/admin/ListasTab";

describe("Configurações › Listas: Instrumentos and Vozes", () => {
  it("lists them next to the other lists and opens their own editor", () => {
    render(
      <ListasTab dbFunctions={[{ id: 1, name: "Diácono", group_name: "Obreiro", sort_order: 1 }]} notify={vi.fn()}
        extraTypes={[
          { key: "instruments", label: "Instrumentos", render: () => <p>editor de instrumentos</p> },
          { key: "voice_types", label: "Vozes", render: () => <p>editor de vozes</p> },
        ]} />,
    );
    expect(screen.getByText("Diácono")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Instrumentos/ }));
    expect(screen.getByText("editor de instrumentos")).toBeTruthy();
    expect(screen.queryByText("Diácono")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Vozes/ }));
    expect(screen.getByText("editor de vozes")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Funções/ }));
    expect(screen.getByText("Diácono")).toBeTruthy();
  });
});

describe("switching between two custom editors", () => {
  it("opens a fresh editor, not the previous one with its state", async () => {
    const { useState } = await import("react");
    function Editor({ start }) { const [which] = useState(start); return <p>{which}</p>; }
    render(
      <ListasTab notify={vi.fn()} extraTypes={[
        { key: "instruments", label: "Instrumentos", render: () => <Editor start="instrumentos" /> },
        { key: "voice_types", label: "Vozes", render: () => <Editor start="vozes" /> },
      ]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Instrumentos/ }));
    fireEvent.click(screen.getByRole("button", { name: /Vozes/ }));
    expect(screen.getByText("vozes")).toBeTruthy();
  });
});

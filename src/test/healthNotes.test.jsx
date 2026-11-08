import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { emptyHealth, healthNote, healthProblem, personHealth, pruneHealth } from "@/lib/healthNotes";
import HealthPicker from "@/components/HealthPicker";

const family = [{ id: "a", name: "Ana" }, { id: "b", name: "Bia" }, { id: "c", name: "Caio" }];

describe("health notes", () => {
  it("one person: their description", () => {
    const s = { hasAny: true, other: " camarão ", who: {} };
    expect(healthNote("B1", s, emptyHealth(), "a", true)).toBe("[B1] | Alergias: camarão");
  });

  it("a family: only the people chosen, each with their own text", () => {
    const allergies = { hasAny: true, other: "", who: { b: "amendoim" } };
    const needs = { hasAny: true, other: "", who: { c: "cadeira de rodas" } };
    expect(healthNote("B1", allergies, needs, "a", false)).toBe("[B1]");
    expect(healthNote("B1", allergies, needs, "b", false)).toBe("[B1] | Alergias: amendoim");
    expect(healthNote("B1", allergies, needs, "c", false)).toBe("[B1] | Nec. especiais: cadeira de rodas");
  });

  it("asks to choose someone and describe it", () => {
    expect(healthProblem({ hasAny: true, other: "", who: {} }, false)).toBe("pick");
    expect(healthProblem({ hasAny: true, other: "", who: { a: " " } }, false)).toBe("describe");
    expect(healthProblem({ hasAny: true, other: "", who: { a: "x" } }, false)).toBeNull();
    expect(healthProblem({ hasAny: true, other: "", who: {} }, true)).toBe("describe");
    expect(healthProblem(emptyHealth(), false)).toBeNull();
  });

  it("drops people no longer in the registration", () => {
    const s = pruneHealth({ hasAny: true, other: "", who: { a: "x", z: "y" } }, family);
    expect(Object.keys(s.who)).toEqual(["a"]);
    expect(personHealth(s, "z", false)).toBe("");
  });
});

describe("health picker with a family", () => {
  function Harness({ onState }) {
    const [s, setS] = useState(emptyHealth());
    onState(s);
    return <HealthPicker id="al" title="Alergias" state={s} onChange={setS} people={family} lang="pt" placeholder="…" />;
  }

  it("lets each person be chosen with their own description", () => {
    let last;
    render(<Harness onState={(s) => { last = s; }} />);
    fireEvent.click(screen.getByLabelText("Alergias"));
    fireEvent.click(screen.getByLabelText("Bia"));
    fireEvent.change(screen.getByLabelText("Alergias — Bia"), { target: { value: "amendoim" } });
    expect(last.who).toEqual({ b: "amendoim" });
    expect(screen.queryByLabelText("Alergias — Ana")).toBeNull();
    expect(healthNote("B", last, emptyHealth(), "a", false)).toBe("[B]");
  });
});

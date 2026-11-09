import { describe, it, expect } from "vitest";
import { devTrumpets } from "@/dev/trumpetsDevStore";
import { INIT_GAS } from "@/dev/seeds";

describe("dev store", () => {
  it("creates, lists, marks attendance and builds stats in memory", () => {
    const ga = INIT_GAS[0].id;
    const { guest } = devTrumpets({ action: "create", year: 2026, gaId: ga, name: "Teste", phone: "9735550101" });
    expect(devTrumpets({ action: "list", year: 2026 }).guests.map((g) => g.name)).toContain("Teste");
    expect(devTrumpets({ action: "attend", id: guest.id, attended: true }).guest.attendedAt).toBeTruthy();
    expect(devTrumpets({ action: "stats", year: 2026 }).stats.attended).toBeGreaterThan(0);
  });

  it("answers summary and keeps the motivos", () => {
    expect(devTrumpets({ action: "summary", year: 2026 }).summary.invited).toBeGreaterThan(0);
    devTrumpets({ action: "setEdition", year: 2026, reasons: "Orar", reasonsEn: "Pray" });
    expect(devTrumpets({ action: "edition", year: 2026 }).edition).toEqual({ reasons: "Orar", reasonsEn: "Pray" });
    expect(devTrumpets({ action: "edition", year: 2025 }).edition).toEqual({ reasons: "", reasonsEn: "" });
  });
});

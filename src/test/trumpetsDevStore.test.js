import { describe, it, expect } from "vitest";
import { devTrumpets } from "@/dev/trumpetsDevStore";
import { INIT_GAS } from "@/dev/seeds";

describe("dev store", () => {
  it("creates, lists, marks attendance and builds stats in memory", () => {
    const ga = INIT_GAS[0].id;
    const { guest } = devTrumpets({ action: "create", year: 2026, gaId: ga, name: "Teste" });
    expect(devTrumpets({ action: "list", year: 2026 }).guests.map((g) => g.name)).toContain("Teste");
    expect(devTrumpets({ action: "attend", id: guest.id, attended: true }).guest.attendedAt).toBeTruthy();
    expect(devTrumpets({ action: "stats", year: 2026 }).stats.attended).toBeGreaterThan(0);
  });
});

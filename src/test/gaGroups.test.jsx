import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { groupGasByChurch } from "@/lib/gaGroups";
import { AdminGA } from "@/views/AdminView";

const GAS = [
  { id: "g1", name: "Newark 10", church: "Newark, NJ" }, { id: "g2", name: "Newark 2", church: "Newark, NJ" },
  { id: "g3", name: "Philadelphia 1", church: "Philadelphia, PA" }, { id: "g4", name: "Toms River", church: "Toms River, NJ" },
  { id: "g5", name: "Órfão", church: "" },
];
const MEMBERS = [
  { id: "1", name: "Ana", gaId: "g1" }, { id: "2", name: "Bia", gaId: "g2" }, { id: "3", name: "Caio", gaId: "g2" },
  { id: "4", name: "Davi", gaId: "g3" }, { id: "5", name: "Eli" },
];

describe("groupGasByChurch", () => {
  const groups = groupGasByChurch(GAS, MEMBERS);

  it("groups by church A-Z, with groups without a church last", () => {
    expect(groups.map((g) => g.church)).toEqual(["Newark, NJ", "Philadelphia, PA", "Toms River, NJ", ""]);
  });

  it("orders the groups of a church naturally (2 before 10)", () => {
    expect(groups[0].gas.map((g) => g.name)).toEqual(["Newark 2", "Newark 10"]);
  });

  it("totals the members of each church's groups and ignores people without a group", () => {
    expect(groups.map((g) => g.members)).toEqual([3, 1, 0, 0]);
  });
});

describe("AdminGA", () => {
  it("lists the groups under their church heading, never loose", () => {
    render(<AdminGA gas={GAS} setGas={() => {}} members={MEMBERS} churches={[]} regs={[]} event={{ id: "e" }} notify={() => {}} />);
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Newark, NJ", "Philadelphia, PA", "Toms River, NJ", "Sem igreja"]);
    expect(screen.getByText(/2 grupos · 3/)).toBeTruthy(); // Newark: 2 groups, 3 members
  });
});

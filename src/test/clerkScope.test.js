import { describe, it, expect } from "vitest";
import { clerkCities, inClerkScope, regChurchFilter, ALL_CHURCHES } from "@/lib/clerkScope";

describe("Secretaria church scope", () => {
  it("is the clerk's own church by default", () => {
    const c = clerkCities({ church: "Newark, NJ", churches: [] });
    expect(c).toEqual(["newark"]);
    expect(inClerkScope(c, "Newark, NJ")).toBe(true);
    expect(inClerkScope(c, "Philadelphia, PA")).toBe(false);
  });

  it("covers every church for the main secretary, inside or outside the Pólo", () => {
    const c = clerkCities({ church: "Newark, NJ", churches: [ALL_CHURCHES] });
    expect(c).toBeNull();
    expect(inClerkScope(c, "Chicago/Carol Springs, IL")).toBe(true);
    expect(inClerkScope(c, "")).toBe(true);
  });

  it("adds listed churches to the clerk's own", () => {
    const c = clerkCities({ church: "Newark, NJ", churches: ["Philadelphia"] });
    expect(c.sort()).toEqual(["newark", "philadelphia"]);
    expect(inClerkScope(c, "Philadelphia, PA")).toBe(true);
    expect(inClerkScope(c, "New York, NY")).toBe(false);
  });
});

describe("Secretaria's Inscrições church filter", () => {
  const cities = ["newark"];
  it("opens on the clerk's own church", () => {
    const f = regChurchFilter("mine", [], cities);
    expect(f("Newark, NJ")).toBe(true);
    expect(f("Outra: Igreja Americana em Boca Raton, Florida")).toBe(false);
  });
  it("can show every church or a chosen few", () => {
    expect(regChurchFilter("all", [], cities)("Everett, MA")).toBe(true);
    const some = regChurchFilter("pick", ["Everett, MA", ""], cities);
    expect(some("Everett, MA")).toBe(true);
    expect(some("")).toBe(true);
    expect(some("Newark, NJ")).toBe(false);
  });
});

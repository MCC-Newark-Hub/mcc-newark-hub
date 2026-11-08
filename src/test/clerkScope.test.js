import { describe, it, expect } from "vitest";
import { clerkCities, inClerkScope, ALL_CHURCHES } from "@/lib/clerkScope";

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

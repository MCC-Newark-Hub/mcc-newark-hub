import { describe, it, expect } from "vitest";
import { escapeHtml } from "../../api/_lib/email.js";

describe("escapeHtml", () => {
  it("neutralizes markup typed into a name", () => {
    expect(escapeHtml('<a href="x">Maria</a>')).toBe("&lt;a href=&quot;x&quot;&gt;Maria&lt;/a&gt;");
  });

  it("escapes ampersands and single quotes", () => {
    expect(escapeHtml("João & D'Ávila")).toBe("João &amp; D&#39;Ávila");
  });

  it("turns missing values into an empty string", () => {
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(null)).toBe("");
  });
});

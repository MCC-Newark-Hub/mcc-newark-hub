import { describe, it, expect } from "vitest";
import { Buffer } from "node:buffer";
import { hashPin, generatePin, isWeakPin, signToken, verifyToken, PIN_PATTERN } from "../../api/_lib/auth.js";

describe("PIN hashing", () => {
  it("is deterministic per pepper and differs across peppers", () => {
    expect(hashPin("482913", "pepper-a")).toBe(hashPin("482913", "pepper-a"));
    expect(hashPin("482913", "pepper-a")).not.toBe(hashPin("482913", "pepper-b"));
    expect(hashPin("482913", "pepper-a")).not.toContain("482913");
  });

  it("refuses to hash without a pepper", () => {
    expect(() => hashPin("482913", "")).toThrow();
  });
});

describe("PIN generation", () => {
  it("always gives 6 digits and never an easy run", () => {
    for (let i = 0; i < 2000; i++) {
      const pin = generatePin();
      expect(pin).toMatch(PIN_PATTERN);
      expect(isWeakPin(pin)).toBe(false);
    }
  });

  it("flags repeated digits and straight runs", () => {
    for (const weak of ["000000", "777777", "123456", "654321", "345678"]) expect(isWeakPin(weak)).toBe(true);
    for (const ok of ["482913", "121212", "135791"]) expect(isWeakPin(ok)).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips the claims", () => {
    const token = signToken({ sub: "7" }, "secret", 60);
    expect(verifyToken(token, "secret")?.sub).toBe("7");
  });

  it("rejects a wrong secret, a tampered body and an expired token", () => {
    const token = signToken({ sub: "7" }, "secret", 60);
    expect(verifyToken(token, "other")).toBeNull();
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "1", exp: 9e9 })).toString("base64url");
    expect(verifyToken(`${h}.${forged}.${s}`, "secret")).toBeNull();
    expect(verifyToken(signToken({ sub: "7" }, "secret", -1), "secret")).toBeNull();
    expect(verifyToken("not-a-token", "secret")).toBeNull();
  });
});

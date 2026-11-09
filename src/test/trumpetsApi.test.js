import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listGuests, createGuest, setAttended, saveGoal, fetchSummary, getEdition, saveEdition } from "@/lib/trumpetsApi";

// This Node + jsdom setup has no usable localStorage (see censusPublicView.test): no session here.
beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} }));
afterEach(() => vi.unstubAllGlobals());

const reply = (status, body) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

describe("trumpetsApi", () => {
  it("posts the action and returns the guests", async () => {
    const f = reply(200, { guests: [{ id: "g1" }] });
    vi.stubGlobal("fetch", f);
    expect(await listGuests(2026)).toEqual([{ id: "g1" }]);
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe("/api/trumpet-guests");
    expect(JSON.parse(opts.body)).toEqual({ action: "list", year: 2026 });
  });

  it("throws the API error code", async () => {
    vi.stubGlobal("fetch", reply(403, { error: "forbidden" }));
    await expect(createGuest(2026, { gaId: "GA1", name: "X" })).rejects.toThrow("forbidden");
  });

  it("sends attend and setGoal bodies", async () => {
    const f = reply(200, { guest: { id: "g1", attendedAt: "t" }, ok: true });
    vi.stubGlobal("fetch", f);
    await setAttended("g1", true);
    await saveGoal(2026, "", 80);
    expect(f.mock.calls.map(([, o]) => JSON.parse(o.body))).toEqual([
      { action: "attend", id: "g1", attended: true },
      { action: "setGoal", year: 2026, church: "", goal: 80 },
    ]);
  });

  it("reads the summary and the motivos, and saves the motivos", async () => {
    const f = vi.fn(async (url, o) => {
      const b = JSON.parse(o.body);
      const body = b.action === "summary" ? { summary: { invited: 3 } } : b.action === "edition" ? { edition: { reasons: "R", reasonsEn: "E" } } : { ok: true };
      return { ok: true, status: 200, json: async () => body };
    });
    vi.stubGlobal("fetch", f);
    expect(await fetchSummary(2026)).toEqual({ invited: 3 });
    expect(await getEdition(2026)).toEqual({ reasons: "R", reasonsEn: "E" });
    await saveEdition(2026, { reasons: "R2", reasonsEn: "E2" });
    expect(JSON.parse(f.mock.calls[2][1].body)).toEqual({ action: "setEdition", year: 2026, reasons: "R2", reasonsEn: "E2" });
  });
});

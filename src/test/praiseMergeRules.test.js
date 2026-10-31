import { describe, it, expect } from "vitest";
import { serviceTypesFor, songHistory, duplicateServices, songMergePreview, listMergePreview } from "@/lib/praiseLists";

describe("serviceTypesFor: one list per day, Sunday has EBD and Noite", () => {
  it("offers EBD and Noite on a Sunday", () => {
    expect(serviceTypesFor("2026-10-25")).toEqual(["ebd", "noite"]); // Sunday
  });
  it("offers only Noite on the other days", () => {
    expect(serviceTypesFor("2026-10-26")).toEqual(["noite"]); // Monday
    expect(serviceTypesFor("2026-10-31")).toEqual(["noite"]); // Saturday
  });
  it("never offers Outro", () => {
    expect(serviceTypesFor("2026-10-25")).not.toContain("outro");
  });
});

describe("songHistory: each church has its own", () => {
  const song = { last_sung_on: "2026-10-25", times_sung: 3, sung_by_church: { "Newark, NJ": { last_sung_on: "2026-10-12", times_sung: 2 }, "New York, NY": { last_sung_on: "2026-10-25", times_sung: 1 } } };
  it("uses the church's own history", () => {
    expect(songHistory(song, "Newark, NJ")).toEqual({ last_sung_on: "2026-10-12", times_sung: 2 });
  });
  it("a church that never sang it has no history, even if another did", () => {
    expect(songHistory(song, "Philadelphia, PA")).toEqual({ last_sung_on: null, times_sung: 0 });
  });
  it("without a church, the total of every church", () => {
    expect(songHistory(song, "")).toEqual({ last_sung_on: "2026-10-25", times_sung: 3 });
  });
});

const L = (id, church, date, type, songIds, extra = {}) => ({ id, church, service_date: date, service_type: type, items: songIds.map((song_id, position) => ({ id: `${id}-${song_id}`, song_id, position })), ...extra });

describe("duplicateServices", () => {
  it("groups lists of the same church, date and service; EBD/Noite and other churches are not duplicates", () => {
    const lists = [
      L("a", "Newark, NJ", "2026-10-26", "noite", []), L("b", "Newark, NJ", "2026-10-26", "noite", []),
      L("c", "Newark, NJ", "2026-10-25", "ebd", []), L("d", "Newark, NJ", "2026-10-25", "noite", []),
      L("e", "New York, NY", "2026-10-26", "noite", []),
    ];
    expect(duplicateServices(lists).map((g) => g.map((l) => l.id))).toEqual([["a", "b"]]);
  });
});

describe("songMergePreview", () => {
  it("counts the lists that change and those that already had the right song", () => {
    const lists = [L("1", "N", "2026-10-26", "noite", ["dup"]), L("2", "N", "2026-10-19", "noite", ["dup", "right"]), L("3", "N", "2026-10-12", "noite", ["right"])];
    expect(songMergePreview("dup", "right", lists)).toEqual({ moved: 1, alreadyThere: 1 });
  });
});

describe("listMergePreview", () => {
  it("lists the details the kept list lacks and the songs it gains", () => {
    const keep = L("k", "Newark, NJ", "2026-10-26", "noite", ["s1", "s2"], { group_name: null, leader: "Ana" });
    const drop = L("d", "Newark, NJ", "2026-10-26", "noite", ["s2", "s3"], { group_name: "Anderson", leader: "Bia", published_at: "2026-10-26T23:00:00Z" });
    expect(listMergePreview(keep, drop)).toEqual({ filled: [{ field: "group_name", value: "Anderson" }], songsAdded: ["s3"], publishes: true });
  });
});

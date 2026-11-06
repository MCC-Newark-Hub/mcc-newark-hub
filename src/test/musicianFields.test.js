import { describe, it, expect } from "vitest";
import { musicRow, musicPicks, applyMusicPicks, isMusicPick } from "@/lib/musicianFields";

describe("musicRow", () => {
  it("moves voice and instrument picks out of roles", () => {
    expect(musicRow(["Grupo de Louvor", "Tenor", "Violão", "Flauta"])).toEqual({
      roles: ["Grupo de Louvor"],
      voice_type: "Tenor",
      instruments: ["Violão", "Flauta"],
    });
  });

  it("reads the old Mezzo name as Mezzo-Soprano", () => {
    expect(musicRow(["Mezzo"]).voice_type).toBe("Mezzo-Soprano");
  });

  it("clears voice and instruments when none are picked", () => {
    expect(musicRow(["Diácono"])).toEqual({ roles: ["Diácono"], voice_type: null, instruments: [] });
  });
});

describe("musicPicks", () => {
  it("merges the fields with picks still stored in roles", () => {
    const m = { roles: ["Grupo de Louvor", "Violino"], voiceType: "Soprano", instruments: ["Flauta"] };
    expect(musicPicks(m)).toEqual(["Grupo de Louvor", "Soprano", "Flauta", "Violino"]);
  });

  it("round-trips through musicRow, so unticking removes", () => {
    const m = { roles: ["Grupo de Louvor"], voiceType: "Tenor", instruments: ["Violão", "Bateria"] };
    const picks = musicPicks(m).filter((r) => r !== "Bateria" && r !== "Tenor");
    expect(musicRow(picks)).toEqual({ roles: ["Grupo de Louvor"], voice_type: null, instruments: ["Violão"] });
  });
});

describe("applyMusicPicks", () => {
  it("adds a picked instrument to the form's instruments, keeping the voice", () => {
    const form = { roles: ["Grupo de Louvor"], voiceType: "Baixo", instruments: ["Teclado"] };
    expect(applyMusicPicks(form, ["Grupo de Louvor", "Bateria"])).toMatchObject({
      roles: ["Grupo de Louvor"],
      voiceType: "Baixo",
      instruments: ["Teclado", "Bateria"],
    });
  });

  it("a picked voice replaces the form's voice", () => {
    expect(applyMusicPicks({ roles: [], voiceType: "Baixo" }, ["Tenor"]).voiceType).toBe("Tenor");
  });
});

it("isMusicPick", () => {
  expect(isMusicPick("Piano")).toBe(true);
  expect(isMusicPick("Mezzo")).toBe(true);
  expect(isMusicPick("Instrumentista")).toBe(false);
});

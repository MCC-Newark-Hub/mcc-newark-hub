import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { STRINGS } from "@/i18n/strings";

vi.mock("@/lib/praiseData", () => ({ createSong: vi.fn() }));
import SongPicker from "@/components/SongPicker";

const tt = STRINGS.pt;
const church = "Newark, NJ";
const song = (id, code, title, sung) => ({
  id, code, title, category: "coletanea", theme: "Clamor", status: "active", sung_by_church: sung ? { [church]: sung } : {},
});
const SONGS = [
  song("34", "CL-034", "QUANDO BUSCAMOS", { last_sung_on: "2026-11-07", times_sung: 5 }),
  song("15", "CL-015", "CLAMAREI, CLAMAREI", { last_sung_on: "2026-08-01", times_sung: 3 }),
];

const setup = (props = {}) => {
  const onPick = vi.fn();
  render(<SongPicker songs={SONGS} church={church} onPick={onPick} onCreated={vi.fn()} tt={tt} today="2026-11-10" suggestDays={7} {...props} />);
  fireEvent.change(screen.getByPlaceholderText(tt.praiseSearchPlaceholder), { target: { value: "buscamos" } });
  fireEvent.click(screen.getByRole("button", { name: /QUANDO BUSCAMOS/ }));
  return onPick;
};

describe("SongPicker same-theme suggestions", () => {
  it("offers another Clamor song when the picked one was sung 3 days ago", () => {
    const onPick = setup();
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByText(/foi cantado há 3 dias\. Que tal outro louvor de Clamor\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /CLAMAREI, CLAMAREI/ }));
    expect(onPick).toHaveBeenCalledWith(SONGS[1]);
  });

  it("still adds the picked song when asked", () => {
    const onPick = setup();
    fireEvent.click(screen.getByRole("button", { name: /mesmo assim/ }));
    expect(onPick).toHaveBeenCalledWith(SONGS[0]);
  });

  it("adds straight away when the suggestions are off (0 days)", () => {
    const onPick = setup({ suggestDays: 0 });
    expect(onPick).toHaveBeenCalledWith(SONGS[0]);
  });

  it("follows the configured window: 3 days ago is outside a 2-day window", () => {
    const onPick = setup({ suggestDays: 2 });
    expect(onPick).toHaveBeenCalledWith(SONGS[0]);
  });
});

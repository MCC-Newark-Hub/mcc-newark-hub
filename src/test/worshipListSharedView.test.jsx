import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WorshipListSharedView from "@/views/WorshipListSharedView";
import { fetchListById, fetchSongsByIds } from "@/lib/praiseData";

vi.mock("@/lib/praiseData", () => ({ fetchListById: vi.fn(), fetchSongsByIds: vi.fn() }));
vi.mock("@/components/ICMLogo", () => ({ default: () => null }));

const fakeCanvas = { width: 10, height: 10, toDataURL: () => "data:image/png;base64,AAA", toBlob: (cb) => cb(new Blob(["x"], { type: "image/png" })) };
vi.mock("html2canvas", () => ({ default: vi.fn(async () => fakeCanvas) }));
vi.mock("jspdf", () => ({ jsPDF: vi.fn(function FakeJsPDF() { this.addImage = vi.fn(); this.output = () => new Blob(["x"], { type: "application/pdf" }); }) }));

const LIST = {
  id: "l1", service_date: "2026-08-02", service_type: "noite", church: "New York, NY", group_name: "Grupo A", leader: "Ana", preacher: "Pr. João",
  published_at: "2026-08-02T23:00:00Z",
  items: [
    { id: "i1", song_id: "s1", position: 0 },
    { id: "i2", song_id: "s2", position: 1 },
  ],
};
const SONGS = [
  { id: "s1", code: "CL-004", title: "Quando te prostrares", category: "coletanea" },
  { id: "s2", code: null, title: "Olhos da fé", category: "avulso" },
];

describe("WorshipListSharedView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a published list like the paper one: title, weekday - date, number and hymn name", async () => {
    fetchListById.mockResolvedValue({ data: LIST, error: null });
    fetchSongsByIds.mockResolvedValue({ data: SONGS, error: null });
    render(<WorshipListSharedView id="l1" lang="pt" />);
    expect(await screen.findByText("DOMINGO - 02/08/2026")).toBeTruthy();
    expect(screen.getByText("LOUVORES")).toBeTruthy();
    expect(screen.getByText("Nome do Hino")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
    expect(screen.queryByText("CL-004")).toBeNull();
    expect(screen.getByText("Quando te prostrares")).toBeTruthy();
    expect(screen.getByText("AVL")).toBeTruthy();
  });

  it("shows the group but never who led or preached — that stays internal", async () => {
    fetchListById.mockResolvedValue({ data: LIST, error: null });
    fetchSongsByIds.mockResolvedValue({ data: SONGS, error: null });
    render(<WorshipListSharedView id="l1" lang="pt" />);
    expect(await screen.findByText("Grupo A")).toBeTruthy();
    expect(screen.queryByText(/Ana/)).toBeNull();
    expect(screen.queryByText(/João/)).toBeNull();
  });

  it("shares the list as an image, falling back to nothing but a native share sheet when available", async () => {
    fetchListById.mockResolvedValue({ data: LIST, error: null });
    fetchSongsByIds.mockResolvedValue({ data: SONGS, error: null });
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.canShare = () => true;
    navigator.share = share;
    render(<WorshipListSharedView id="l1" lang="pt" />);
    fireEvent.click(await screen.findByText("Baixar imagem"));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const file = share.mock.calls[0][0].files[0];
    expect(file.name).toBe("louvores-new-york-2026-08-02.png");
    expect(file.type).toBe("image/png");
  });

  it("shares the list as a PDF the same way", async () => {
    fetchListById.mockResolvedValue({ data: LIST, error: null });
    fetchSongsByIds.mockResolvedValue({ data: SONGS, error: null });
    const share = vi.fn().mockResolvedValue(undefined);
    navigator.canShare = () => true;
    navigator.share = share;
    render(<WorshipListSharedView id="l1" lang="pt" />);
    fireEvent.click(await screen.findByText("Baixar PDF"));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const file = share.mock.calls[0][0].files[0];
    expect(file.name).toBe("louvores-new-york-2026-08-02.pdf");
    expect(file.type).toBe("application/pdf");
  });

  it("shows the church name, and EBD before the date only for the EBD service", async () => {
    fetchSongsByIds.mockResolvedValue({ data: SONGS, error: null });
    fetchListById.mockResolvedValue({ data: LIST, error: null });
    const { unmount } = render(<WorshipListSharedView id="l1" lang="pt" />);
    expect(await screen.findByText("IGREJA CRISTÃ MARANATA")).toBeTruthy();
    expect(screen.getByText("NEW YORK")).toBeTruthy();
    expect(screen.queryByText(/^EBD/)).toBeNull();
    expect(screen.queryByText("Noite")).toBeNull();
    unmount();

    fetchListById.mockResolvedValue({ data: { ...LIST, service_type: "ebd" }, error: null });
    render(<WorshipListSharedView id="l1" lang="pt" />);
    expect(await screen.findByText("EBD · DOMINGO - 02/08/2026")).toBeTruthy();
  });

  it("does not show the songs of a list that is not published yet", async () => {
    fetchListById.mockResolvedValue({ data: { ...LIST, published_at: null }, error: null });
    render(<WorshipListSharedView id="l1" lang="pt" />);
    expect(await screen.findByText("Esta lista ainda não foi publicada.")).toBeTruthy();
    expect(fetchSongsByIds).not.toHaveBeenCalled();
  });

  it("says so when the list does not exist", async () => {
    fetchListById.mockResolvedValue({ data: null, error: null });
    render(<WorshipListSharedView id="nope" lang="pt" />);
    expect(await screen.findByText("Lista não encontrada.")).toBeTruthy();
  });
});

import { useState } from "react";
import { PAUSE_FULL, PAUSE_WAITLIST } from "@/lib/pause";

// "Pausar Inscrições" with its two ways (src/lib/pause.js), or "Retomar Inscrições".
export default function PauseControl({ event, onToggle, lang }) {
  const en = lang === "en";
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!event || event.registrations_locked || !onToggle) return null;

  const run = async (mode) => {
    setBusy(true);
    try {
      await onToggle(mode);
    } finally {
      setBusy(false);
      setChoosing(false);
    }
  };

  if (event.registration_paused) {
    return (
      <button className="btn btn-sm btn-primary" style={{ background: "var(--warn)", borderColor: "var(--warn)" }} disabled={busy} onClick={() => run()}>
        {en ? "▶ Resume registrations" : "▶ Retomar Inscrições"}
      </button>
    );
  }
  if (!choosing) {
    return (
      <button className="btn btn-sm btn-ghost" onClick={() => setChoosing(true)}>
        {en ? "⏸ Pause registrations" : "⏸ Pausar Inscrições"}
      </button>
    );
  }
  return (
    <div role="group" aria-label={en ? "Pause registrations" : "Pausar inscrições"} style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <button className="btn btn-sm btn-primary" style={{ background: "var(--warn)", borderColor: "var(--warn)" }} disabled={busy} onClick={() => run(PAUSE_FULL)}
        title={en ? "Nobody can register, not even to the waitlist" : "Ninguém se inscreve, nem na lista de espera"}>
        {en ? "⏸ Pause completely" : "⏸ Pausar tudo"}
      </button>
      <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => run(PAUSE_WAITLIST)}
        title={en ? "New registrations go to the waitlist; on resume they move to the main list while spots remain" : "Novas inscrições vão para a lista de espera; ao retomar, passam para a lista principal enquanto houver vagas"}>
        {en ? "⏸ Pause with waitlist" : "⏸ Pausar com lista de espera"}
      </button>
      <button className="btn btn-sm btn-ghost" disabled={busy} onClick={() => setChoosing(false)}>
        {en ? "Cancel" : "Cancelar"}
      </button>
    </div>
  );
}

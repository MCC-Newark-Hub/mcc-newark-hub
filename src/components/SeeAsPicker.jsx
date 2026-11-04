import { useState } from "react";
import { mapAppUser } from "@/lib/appUsers";

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// "Ver como": the admin picks an active user to see the app as them.
export default function SeeAsPicker({ dbUsers, currentId, roleLabel, lang, onPick, onClose }) {
  const en = lang === "en";
  const [query, setQuery] = useState("");
  const users = (dbUsers || [])
    .filter((u) => u.active !== false && u.id !== currentId && u.name)
    .map(mapAppUser)
    .filter((u) => !query.trim() || norm(u.name).includes(norm(query.trim())))
    .sort((a, b) => a.name.localeCompare(b.name, "pt", { sensitivity: "base" }));

  return (
    <div className="modal-bg" style={{ zIndex: 9998 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 380 }}>
        <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 4 }}>{en ? "View as" : "Ver como"}</h3>
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          {en
            ? "See the portal exactly as this person sees it. Anything you do meanwhile is recorded under your name."
            : "Veja o portal exatamente como essa pessoa vê. O que você fizer enquanto isso fica registrado no seu nome."}
        </p>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={en ? "Search by name…" : "Buscar pelo nome…"} aria-label={en ? "Search by name" : "Buscar pelo nome"} autoFocus style={{ marginBottom: 10 }} />
        <div style={{ maxHeight: "50vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {users.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>{en ? "Nobody found." : "Ninguém encontrado."}</p>}
          {users.map((u) => (
            <button key={u.id} className="btn btn-ghost" style={{ textAlign: "left", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2 }} onClick={() => onPick(u.id)}>
              <span style={{ fontWeight: 700 }}>{u.name}</span>
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>
                {u.sysRoles.map((r) => (r === "team_leader" && u.teamLeads.length ? `${roleLabel(r)} — ${u.teamLeads.join(", ")}` : roleLabel(r))).join(" · ")}
                {u.church ? ` · ${u.church}` : ""}
              </span>
            </button>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={onClose}>{en ? "Cancel" : "Cancelar"}</button>
      </div>
    </div>
  );
}

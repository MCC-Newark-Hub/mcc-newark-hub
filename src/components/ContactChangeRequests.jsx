import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import { useLang } from "@/i18n/strings";
import { staffContactRequests, staffResolveContactRequest } from "@/lib/contactApi";

// Inscrições: phone / e-mail changes people asked for on the public form (migration 051).
// Staff see what is on file next to what was asked and approve or reject each one.
// Hidden when there are none (or outside Vercel, where /api is unavailable).
//   memberIds: the members of this event's registrations
export default function ContactChangeRequests({ memberIds, notify }) {
  const en = useLang() === "en";
  const key = [...new Set((memberIds || []).filter(Boolean))].sort().join(",");
  const [requests, setRequests] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    const ids = key.split(",");
    (async () => {
      const all = [];
      for (let i = 0; i < ids.length; i += 1000) all.push(...(await staffContactRequests(ids.slice(i, i + 1000))));
      if (alive) setRequests(all);
    })();
    return () => { alive = false; };
  }, [key]);

  if (!requests.length) return null;

  const resolve = async (q, approve) => {
    setBusyId(q.id);
    try {
      await staffResolveContactRequest(q.id, approve);
      setRequests((prev) => prev.filter((x) => x.id !== q.id));
      notify?.(approve
        ? (en ? `Contact updated: ${q.memberName}` : `Contato atualizado: ${q.memberName}`)
        : (en ? `Change rejected: ${q.memberName}` : `Alteração recusada: ${q.memberName}`));
    } catch {
      notify?.(en ? "Could not save. Please try again." : "Não foi possível salvar. Tente de novo.");
    } finally {
      setBusyId(null);
    }
  };

  const row = (label, from, to) =>
    to && (
      <div style={{ fontSize: 13, color: "#374151" }}>
        <span style={{ color: "#6b7280" }}>{label}: </span>
        <span style={{ textDecoration: "line-through", color: "#9ca3af" }}>{from || "—"}</span>
        {" → "}
        <strong>{to}</strong>
      </div>
    );

  return (
    <div style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        <Phone size={15} />
        {en ? `Contact changes to review (${requests.length})` : `Alterações de contato para revisar (${requests.length})`}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {requests.map((q) => (
          <div key={q.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{q.memberName}</div>
              {row(en ? "Phone" : "Telefone", q.currentPhone, q.phone)}
              {row("E-mail", q.currentEmail, q.email)}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-ghost btn-sm" disabled={busyId === q.id} onClick={() => resolve(q, false)}>
                {en ? "Reject" : "Recusar"}
              </button>
              <button className="btn btn-primary btn-sm" disabled={busyId === q.id} onClick={() => resolve(q, true)}>
                {en ? "Approve" : "Aprovar"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

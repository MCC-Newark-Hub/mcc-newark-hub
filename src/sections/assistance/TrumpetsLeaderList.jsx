import { useEffect, useState } from "react";
import { Plus, Download } from "lucide-react";
import { fill } from "@/i18n/strings";
import { guestsCsv } from "@/lib/trumpets";
import { listGuests, createGuest, updateGuest, setAttended, deleteGuest } from "@/lib/trumpetsApi";
import TrumpetGuestModal from "./TrumpetGuestModal";
import TrumpetsSheetButton from "./TrumpetsSheetButton";

function downloadCsv(filename, text) {
  const blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const byName = (a, b) => a.name.localeCompare(b.name, "pt");

// The GA leader's own list: the only place guest names and phones appear (spec rev. 3). Add / edit / attendance /
// delete, a full CSV for the leader, and the image for the WhatsApp group (motivos + names + who invited).
// `myGas` are the leader's GAs; rows of any other GA (e.g. while an admin uses "Ver como") are filtered out.
export default function TrumpetsLeaderList({ tt, year, myGas, gas, members, notify, reasonsText, onChanged }) {
  const [gaId, setGaId] = useState(myGas[0]?.id || "");
  const [query, setQuery] = useState("");
  const [guests, setGuests] = useState(null);
  const [modal, setModal] = useState(null); // null | { guest?: Guest }
  const fail = (e) => notify(tt.errors[e?.message] || tt.errors.generic);

  useEffect(() => {
    // the parent remounts this per year (key), so the list starts at null on each year
    let off = false;
    listGuests(year)
      .then((list) => !off && setGuests(list))
      .catch((e) => { if (!off) { setGuests([]); fail(e); } });
    return () => { off = true; };
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps

  const memberName = Object.fromEntries(members.map((m) => [m.id, m.name]));
  const ga = myGas.find((g) => g.id === gaId) || myGas[0];
  const inGa = (guests || []).filter((g) => g.gaId === ga?.id).sort(byName);
  const q = query.trim().toLowerCase();
  const rows = inGa.filter((g) => !q || g.name.toLowerCase().includes(q));

  const replace = (g) => setGuests((prev) => (prev || []).map((x) => (x.id === g.id ? g : x)));
  const changed = () => onChanged?.();

  const toggle = (g) => {
    const next = !g.attendedAt;
    replace({ ...g, attendedAt: next ? new Date().toISOString() : null });
    setAttended(g.id, next).then((saved) => { replace(saved); changed(); }).catch(fail);
  };

  const save = async (input) => {
    if (modal?.guest) {
      replace({ ...modal.guest, ...input });
      setModal(null);
      updateGuest(modal.guest.id, input).then((saved) => { replace(saved); changed(); }).catch(fail);
      return;
    }
    const created = await createGuest(year, input); // throws → the modal shows the error
    setGuests((prev) => [...(prev || []), created]);
    setModal(null);
    changed();
  };

  const remove = () => {
    const g = modal.guest;
    if (!window.confirm(fill(tt.confirmRemove, { name: g.name }))) return;
    setGuests((prev) => prev.filter((x) => x.id !== g.id));
    setModal(null);
    deleteGuest(g.id).then(changed).catch(fail);
  };

  const csvLabels = { name: tt.name, phone: tt.phone, email: tt.email, invitedBy: tt.invitedBy, ga: tt.ga, attended: tt.attended, yes: tt.yes, no: tt.no };

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <style>{`
        .tf-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1.3fr) minmax(0,1.5fr) auto;gap:12px;align-items:center;background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px 14px}
        .tf-row .tf-name{background:none;border:none;text-align:left;padding:0;cursor:pointer;color:var(--text);font:inherit;font-weight:700}
        .tf-row .tf-muted{color:var(--muted);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .tf-toggle{width:28px;height:28px;accent-color:var(--ok)}
        @media (max-width:640px){.tf-row{grid-template-columns:minmax(0,1fr) auto}.tf-row .tf-hide{display:none}}
      `}</style>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{tt.myList}{myGas.length === 1 ? ` · ${ga.name}` : ""}</h3>
        {myGas.length > 1 && (
          <select aria-label={tt.ga} value={ga?.id} onChange={(e) => setGaId(e.target.value)}>
            {myGas.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input type="search" placeholder={tt.search} value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: "1 1 160px" }} />
        <button className="btn btn-primary" onClick={() => setModal({})} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Plus size={16} /> {tt.add}
        </button>
        <TrumpetsSheetButton tt={tt} label={tt.groupImage} className="btn btn-ghost" filename={`trombetas-${year}-${ga?.id}`}
          title={`${tt.title} ${year}`} subtitle={ga?.name} reasonsText={reasonsText}
          rows={inGa.map((g) => ({ name: g.name, by: memberName[g.invitedByMemberId] || "" }))} />
        <button className="btn btn-ghost" disabled={!inGa.length} onClick={() => downloadCsv(`trombetas_${year}_${ga?.id}.csv`, guestsCsv(inGa, { gas, members, labels: csvLabels }))} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Download size={16} /> {tt.exportCsv}
        </button>
      </div>

      {guests === null ? (
        <div style={{ color: "var(--muted)" }}>{tt.loading}</div>
      ) : !rows.length ? (
        <div style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>{tt.empty}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((g) => (
            <div key={g.id} className="tf-row">
              <div style={{ minWidth: 0 }}>
                <button type="button" className="tf-name" onClick={() => setModal({ guest: g })}>{g.name}</button>
                <div className="tf-muted"><a href={`tel:${g.phone}`}>{g.phone}</a>{g.email ? ` · ${g.email}` : ""}</div>
              </div>
              <div className="tf-muted tf-hide">{memberName[g.invitedByMemberId] || "—"}</div>
              <div className="tf-muted tf-hide" title={g.notes}>{g.notes}</div>
              <input type="checkbox" className="tf-toggle" aria-label={`${tt.attended}: ${g.name}`} checked={!!g.attendedAt} onChange={() => toggle(g)} />
            </div>
          ))}
        </div>
      )}

      {modal && (
        <TrumpetGuestModal
          tt={tt}
          guest={modal.guest}
          gaOptions={[ga, ...myGas.filter((g) => g.id !== ga.id)]}
          members={members}
          onSave={save}
          onDelete={modal.guest ? remove : null}
          onClose={() => setModal(null)}
        />
      )}
    </section>
  );
}

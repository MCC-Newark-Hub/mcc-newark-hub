import { useState } from "react";
import { Search } from "lucide-react";
import { useT, fill } from "@/i18n/strings";
import { sb } from "@/lib/supabase";
import Modal from "@/components/Modal";
import RoleBadges from "@/components/directory/RoleBadges";
import MemberEditModal from "@/components/directory/MemberEditModal";
import { newMemberForm, memberToForm } from "@/lib/memberForm";
import { groupByFamily, familyIdOf } from "@/lib/family";
import { GA_NONE, filterByGa, groupByGa } from "@/lib/gaGroups";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Diretório › Membros for a scoped profile (church secretary, GA leader): the members in `list` only, with search,
// group-by-family, new and edit (church-locked MemberEditModal). Delete is opt-in (`canDelete`) and refused while the
// member still has an active registration — same rules the secretary already had under Eventos.
// `gaTools` (church secretary) adds a filter by assistance group and "Agrupar por Grupo" next to "Agrupar por Família".
export default function ScopedMembersPanel({ gaTools = false, list, members, setMembers, families, setFamilies, gas, churches, defaultChurch, regs, setRegs, canDelete, notify, logAudit }) {
  const t = useT();
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState(""); // "" | "family" | "ga"
  const [gaFilter, setGaFilter] = useState(""); // "" | GA_NONE | GA id
  const [editingMember, setEditingMember] = useState(null);
  const [savingMember, setSavingMember] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name, regCount }
  const [deleting, setDeleting] = useState(false);

  const q = norm(search);
  const gaOptions = [...(gas || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt", { numeric: true }));
  const shown = filterByGa(list, gas, gaTools ? gaFilter : "").filter((m) => norm(m.name).includes(q)).sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt"));

  const openNew = () => { setEditingMember(newMemberForm()); setNewFamilyName(""); };
  const openEdit = (m) => { setEditingMember(memberToForm(m, families)); setNewFamilyName(""); };
  const requestDelete = (m) => setConfirmDelete({ id: m.id, name: m.name, regCount: (regs || []).filter((r) => r.memberId === m.id && !r.cancelled).length });

  const deleteNow = async () => {
    if (!confirmDelete || confirmDelete.regCount > 0) return;
    setDeleting(true);
    try {
      const { data, error } = await sb.from("members").delete().eq("id", confirmDelete.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error(t.dirMemberNotFound);
      setMembers((prev) => prev.filter((m) => m.id !== confirmDelete.id));
      logAudit?.("member_deleted", "member", confirmDelete.id, confirmDelete.name, null);
      notify(t.dirMemberRemoved);
      setConfirmDelete(null);
    } catch (err) {
      notify(t.dirMemberRemoveError + (err?.message || ""));
    } finally {
      setDeleting(false);
    }
  };

  const familyName = (m) => families.find((f) => f.id === familyIdOf(m, families))?.name;
  const row = (m) => (
    <tr key={m.id}>
      <td>
        <div style={{ fontWeight: 600 }}>{m.name}</div>
        {m.badgeName && m.badgeName !== m.name && <div style={{ fontSize: 11, color: "var(--muted)" }}>🏷 {m.badgeName}</div>}
      </td>
      <td><RoleBadges member={m} /></td>
      <td><span className="badge badge-blue">{m.category}</span></td>
      <td style={{ fontSize: 12 }}>{familyName(m) || <span style={{ color: "var(--muted)" }}>—</span>}</td>
      <td>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(m)}>{t.edit}</button>
          {canDelete && <button className="btn btn-danger btn-sm" aria-label={t.dirDelete} onClick={() => requestDelete(m)}>🗑</button>}
        </div>
      </td>
    </tr>
  );

  return (
    <>
      <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div className="sb" style={{ flex: 1, minWidth: 200 }}>
          <span className="si-icon"><Search size={16} /></span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.dirSearchMember} />
        </div>
        {gaTools && (
          <select value={gaFilter} onChange={(e) => setGaFilter(e.target.value)} aria-label={t.dirGaFilterLabel} title={t.dirGaFilterLabel} style={{ maxWidth: 260 }}>
            <option value="">{t.dirGaFilterAll}</option>
            {gaOptions.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
            <option value={GA_NONE}>{t.dirGaNone}</option>
          </select>
        )}
        <button className={`btn btn-sm ${groupBy === "family" ? "btn-primary" : "btn-ghost"}`} aria-pressed={groupBy === "family"} onClick={() => setGroupBy((p) => (p === "family" ? "" : "family"))}>👪 {t.dirGroupByFamily}</button>
        {gaTools && (
          <button className={`btn btn-sm ${groupBy === "ga" ? "btn-primary" : "btn-ghost"}`} aria-pressed={groupBy === "ga"} onClick={() => setGroupBy((p) => (p === "ga" ? "" : "ga"))}>🤝 {t.dirGroupByGa}</button>
        )}
        <button className="btn btn-primary" onClick={openNew}>+ {t.dirNewMember}</button>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "11px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 16 }}>{t.dirMembersTitle}</h3>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{shown.length}</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}>
              <tr><th>{t.memberName}</th><th>{t.cargo}</th><th>{t.cat}</th><th>{t.dirFamily}</th><th>{t.actions}</th></tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 28 }}>{t.noRecords}</td></tr>}
              {groupBy === "ga"
                ? groupByGa(shown, gas, t.dirGaNone).flatMap((g) => [
                    <tr key={`gg-${g.gaId ?? "none"}`} style={{ background: "var(--bg2)" }}>
                      <td colSpan={5} style={{ fontWeight: 700, fontSize: 12, padding: "6px 10px" }}>
                        🤝 {g.gaName} <span style={{ opacity: .65, fontWeight: 400 }}>({g.members.length})</span>
                      </td>
                    </tr>,
                    ...g.members.map(row),
                  ])
                : groupBy !== "family"
                ? shown.map(row)
                : groupByFamily(shown, families).flatMap((g) => [
                    <tr key={`fg-${g.familyId ?? "none"}`} style={{ background: "var(--bg2)" }}>
                      <td colSpan={5} style={{ fontWeight: 700, fontSize: 12, padding: "6px 10px" }}>
                        👪 {g.familyName} <span style={{ opacity: .65, fontWeight: 400 }}>({g.members.length})</span>
                      </td>
                    </tr>,
                    ...g.members.map(row),
                  ])}
            </tbody>
          </table>
        </div>
      </div>

      <MemberEditModal
        editingMember={editingMember}
        setEditingMember={setEditingMember}
        savingMember={savingMember}
        setSavingMember={setSavingMember}
        newFamilyName={newFamilyName}
        setNewFamilyName={setNewFamilyName}
        families={families}
        setFamilies={setFamilies}
        members={members}
        setMembers={setMembers}
        gas={gas}
        churches={churches}
        defaultChurch={defaultChurch}
        notify={notify}
        setRegs={setRegs}
        logAudit={logAudit}
      />

      {confirmDelete && (
        <Modal onClose={() => !deleting && setConfirmDelete(null)} maxWidth={360}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 8 }}>{t.dirDeleteTitle}</h3>
            <p style={{ color: confirmDelete.regCount > 0 ? "#c0392b" : "var(--muted)", fontSize: 14, marginBottom: 20 }}>
              {confirmDelete.regCount > 0
                ? fill(t.dirDeleteBlocked, { name: confirmDelete.name, count: confirmDelete.regCount })
                : fill(t.dirDeleteConfirm, { name: confirmDelete.name })}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDelete(null)} disabled={deleting}>
                {confirmDelete.regCount > 0 ? t.close : t.cancel}
              </button>
              {confirmDelete.regCount === 0 && (
                <button className="btn btn-danger" style={{ flex: 1 }} onClick={deleteNow} disabled={deleting}>
                  {deleting ? t.dirDeleting : t.dirDelete}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

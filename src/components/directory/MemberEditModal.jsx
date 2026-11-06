import { CATEGORIES } from "@/constants";
import { sb } from "@/lib/supabase";
import { mapMember } from "@/hooks/useAppData";
import { genMemberId } from "@/lib/genMemberId";
import { memberRoleFields } from "@/lib/memberRoles";
import Modal from "@/components/Modal";
import SearchSelect from "@/components/SearchSelect";
import RolesMultiSelect from "@/components/directory/RolesMultiSelect";
import { syncMemberToRegistrations } from "@/lib/syncMemberName";
import StaffContactEditor from "@/components/StaffContactEditor";
import AcessibilidadeField from "@/components/directory/AcessibilidadeField";
import { isCiaCategory } from "@/lib/acessibilidade";

// Church-locked member editor: the acting user's church is always the value written to
// `members.church`, regardless of what's shown/typed elsewhere — mirrors GroupsPanel's
// lockChurch pattern, since every current caller (Clerk, GA leader) is church-scoped.
export default function MemberEditModal({
  editingMember,
  setEditingMember,
  savingMember,
  setSavingMember,
  newFamilyName,
  setNewFamilyName,
  families,
  setFamilies,
  members,
  setMembers,
  gas,
  churches,
  defaultChurch,
  notify,
  setRegs,
  logAudit,
}) {
  if (!editingMember) return null;

  // Hub churches (Newark, Philadelphia, New York, Toms River) must have every member
  // in a group — outside the hub, a group may not exist yet, so it stays optional.
  const isHubChurch = (churches || []).find((c) => c.display === defaultChurch)?.is_hub;

  const MINOR_CATEGORIES = ["0-3", "Criança", "Intermediário", "Adolescente"];
  const isMinor = MINOR_CATEGORIES.includes(editingMember.category);
  const isCia = isCiaCategory(editingMember.category);

  const saveMember = async () => {
    const fn = editingMember.firstName.trim();
    const ln = editingMember.lastName.trim();
    const fullName = (fn + " " + ln).trim();
    if (!fullName) { notify("Nome é obrigatório."); return; }
    if (isHubChurch && !editingMember.gaId) { notify("Grupo é obrigatório para igrejas do Pólo."); return; }
    if (isMinor && !editingMember.emergencyContact?.trim()) { notify("Contato de emergência é obrigatório para menores."); return; }
    if (editingMember.familyId === "__new__" && !newFamilyName.trim()) { notify("Nome da família é obrigatório."); return; }
    setSavingMember(true);
    try {
      const row = {
        name: fullName,
        first_name: fn || null,
        last_name: ln || null,
        badge_name: editingMember.badgeName || fullName,
        gender: editingMember.gender,
        category: editingMember.category,
        church: (defaultChurch || "").trim(),
        ...memberRoleFields(editingMember.roles),
        family_id: editingMember.familyId && editingMember.familyId !== "__new__" ? editingMember.familyId : null,
        ga_id: editingMember.gaId || null,
        allergies: editingMember.allergies || null,
        special_needs: editingMember.specialNeeds || null,
        acessibilidade: isCia && !!editingMember.acessibilidade,
        notes: editingMember.notes || null,
        is_guest: editingMember.isGuest || false,
        invited_by: editingMember.isGuest ? (editingMember.invitedBy || null) : null,
        translation_languages: editingMember.translationLanguages || [],
        voice_type: editingMember.voiceType || null,
        instruments: editingMember.instruments || [],
        emergency_contact: editingMember.emergencyContact || null,
        emergency_phone: editingMember.emergencyPhone || null,
      };
      let memberId = editingMember.id;
      if (editingMember.id) {
        const oldMember = members.find((m) => m.id === editingMember.id);
        const { data: saved, error } = await sb.from("members").update(row).eq("id", editingMember.id).select();
        if (error) throw error;
        if (!saved?.length) throw new Error("membro não encontrado");
        setMembers((prev) => prev.map((m) => (m.id === editingMember.id ? mapMember({ ...m, ...row, id: editingMember.id }) : m)));
        if (setRegs) {
          syncMemberToRegistrations({ memberId: editingMember.id, memberName: fullName, badgeName: row.badge_name, category: row.category, church: row.church, acessibilidade: row.acessibilidade, setRegs });
        }
        logAudit?.("member_updated", "member", editingMember.id, fullName, null);
      } else {
        const { data, error } = await sb.from("members").insert({ ...row, id: genMemberId() }).select().single();
        if (error) throw error;
        memberId = data.id;
        setMembers((prev) => [...prev, mapMember(data)]);
        logAudit?.("member_created", "member", data.id, fullName, null);
      }

      if (editingMember.familyId === "__new__") {
        const famName = newFamilyName.trim();
        const { data: fam, error: famErr } = await sb.from("families").insert({ name: famName, member_ids: [memberId] }).select().single();
        if (famErr) throw famErr;
        setFamilies((prev) => [...prev, { id: fam.id, name: famName, memberIds: [memberId] }]);
        const { error: linkErr } = await sb.from("members").update({ family_id: fam.id }).eq("id", memberId);
        if (linkErr) throw linkErr;
        setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, familyId: fam.id } : m)));
      } else if (editingMember.familyId) {
        const fam = families.find((f) => f.id === editingMember.familyId);
        if (fam && !(fam.memberIds || []).includes(memberId)) {
          const mergedIds = [...new Set([...(fam.memberIds || []), memberId])];
          const { error: famErr } = await sb.from("families").update({ member_ids: mergedIds }).eq("id", fam.id);
          if (famErr) throw famErr;
          setFamilies((prev) => prev.map((f) => (f.id === fam.id ? { ...f, memberIds: mergedIds } : f)));
        }
      }

      notify(editingMember.id ? "Membro atualizado!" : "Membro criado!");
      setEditingMember(null);
      setNewFamilyName("");
    } catch (err) {
      notify("Erro ao salvar membro: " + (err?.message || "erro desconhecido"));
    } finally {
      setSavingMember(false);
    }
  };

  return (
    <Modal onClose={() => !savingMember && setEditingMember(null)} maxWidth={460}>
      <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 16 }}>
        {editingMember.id ? "Editar Membro" : "Novo Membro"}
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="fr">
          <div>
            <label>Primeiro Nome *</label>
            <input value={editingMember.firstName} onChange={(e) => setEditingMember({ ...editingMember, firstName: e.target.value })} />
          </div>
          <div>
            <label>Sobrenome</label>
            <input value={editingMember.lastName} onChange={(e) => setEditingMember({ ...editingMember, lastName: e.target.value })} />
          </div>
        </div>
        <div>
          <label>Nome no Crachá</label>
          <input value={editingMember.badgeName} onChange={(e) => setEditingMember({ ...editingMember, badgeName: e.target.value })} placeholder="Opcional" />
        </div>
        <div className="fr">
          <div>
            <label>Gênero</label>
            <select value={editingMember.gender} onChange={(e) => setEditingMember({ ...editingMember, gender: e.target.value })}>
              <option value="M">Masculino</option>
              <option value="F">Feminino</option>
            </select>
          </div>
          <div>
            <label>Categoria</label>
            <select value={editingMember.category} onChange={(e) => setEditingMember({ ...editingMember, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label>Igreja</label>
          <input value={defaultChurch} disabled style={{ background: "var(--sidebar-active-bg)", color: "var(--muted)" }} />
        </div>
        {editingMember.id ? (
          <StaffContactEditor memberId={editingMember.id} lang="pt" />
        ) : (
          <p style={{ fontSize: 11, color: "var(--muted)", margin: 0 }}>Telefone e e-mail podem ser adicionados depois de salvar o membro.</p>
        )}
        <div>
          <label>Grupo (GA){isHubChurch ? " *" : " (opcional)"}</label>
          <SearchSelect
            value={editingMember.gaId}
            onSelect={(v) => setEditingMember({ ...editingMember, gaId: v })}
            items={gas || []}
            getLabel={(g) => g?.name || ""}
            getId={(g) => g?.id || ""}
            placeholder="Buscar grupo…"
          />
        </div>
        <RolesMultiSelect
          roles={editingMember.roles}
          onChange={(roles) => setEditingMember({ ...editingMember, roles })}
        />
        {(editingMember.roles || []).includes("Tradutor") && (
          <div>
            <label>Idiomas de Tradução</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
              {["Inglês", "Espanhol", "Francês", "Mandarim", "Italiano", "Alemão"].map((lang) => {
                const checked = (editingMember.translationLanguages || []).includes(lang);
                return (
                  <label key={lang} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
                    <input type="checkbox" checked={checked}
                      onChange={() => setEditingMember({ ...editingMember, translationLanguages: checked ? (editingMember.translationLanguages || []).filter((l) => l !== lang) : [...(editingMember.translationLanguages || []), lang] })} />
                    {lang}
                  </label>
                );
              })}
            </div>
          </div>
        )}
        {(editingMember.roles || []).some((r) => ["Grupo de Louvor", "Instrumentista", "Instrumentista Aprendiz", "Responsável - Grupo de Louvor"].includes(r)) && (
          <>
            <div>
              <label>Tipo de Voz</label>
              <select value={editingMember.voiceType || ""} onChange={(e) => setEditingMember({ ...editingMember, voiceType: e.target.value })}>
                <option value="">— Nenhum —</option>
                {["Soprano", "Mezzo-Soprano", "Contralto", "Tenor", "Barítono", "Baixo"].map((v) => <option key={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label>Instrumentos</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                {["Violão", "Guitarra", "Contrabaixo", "Teclado", "Bateria", "Percussão", "Flauta", "Violino", "Trompete", "Saxofone"].map((inst) => {
                  const checked = (editingMember.instruments || []).includes(inst);
                  return (
                    <label key={inst} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
                      <input type="checkbox" checked={checked}
                        onChange={() => setEditingMember({ ...editingMember, instruments: checked ? (editingMember.instruments || []).filter((i) => i !== inst) : [...(editingMember.instruments || []), inst] })} />
                      {inst}
                    </label>
                  );
                })}
              </div>
            </div>
          </>
        )}
        <div>
          <label>Família</label>
          <select value={editingMember.familyId} onChange={(e) => setEditingMember({ ...editingMember, familyId: e.target.value })}>
            <option value="">— Nenhuma —</option>
            {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            <option value="__new__">+ Nova família…</option>
          </select>
          {editingMember.familyId === "__new__" && (
            <input value={newFamilyName} onChange={(e) => setNewFamilyName(e.target.value)} placeholder="Nome da nova família" style={{ marginTop: 6 }} />
          )}
        </div>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
            <input type="checkbox" checked={editingMember.isGuest || false}
              onChange={(e) => setEditingMember({ ...editingMember, isGuest: e.target.checked, invitedBy: e.target.checked ? editingMember.invitedBy : "" })} />
            Convidado
          </label>
          {editingMember.isGuest && (
            <div style={{ marginTop: 8 }}>
              <label>Convidado por</label>
              <input value={editingMember.invitedBy || ""} onChange={(e) => setEditingMember({ ...editingMember, invitedBy: e.target.value })} placeholder="Nome de quem convidou" />
            </div>
          )}
        </div>
        <div>
          <label>Alergias</label>
          <textarea rows={2} value={editingMember.allergies} onChange={(e) => setEditingMember({ ...editingMember, allergies: e.target.value })} style={{ resize: "vertical" }} />
        </div>
        <div>
          <label>Necessidades Especiais</label>
          <textarea rows={2} value={editingMember.specialNeeds} onChange={(e) => setEditingMember({ ...editingMember, specialNeeds: e.target.value })} style={{ resize: "vertical" }} />
        </div>
        <AcessibilidadeField category={editingMember.category} checked={editingMember.acessibilidade} onChange={(v) => setEditingMember({ ...editingMember, acessibilidade: v })} />
        <div>
          <label>Contato de Emergência{isMinor ? " *" : ""}</label>
          <input
            value={editingMember.emergencyContact || ""}
            onChange={(e) => setEditingMember({ ...editingMember, emergencyContact: e.target.value })}
            placeholder={isMinor ? "Nome completo (obrigatório)" : "Nome completo (opcional)"}
          />
        </div>
        <div>
          <label>Telefone de Emergência</label>
          <input
            value={editingMember.emergencyPhone || ""}
            onChange={(e) => setEditingMember({ ...editingMember, emergencyPhone: e.target.value })}
            placeholder="(xxx) xxx-xxxx"
          />
        </div>
        <div>
          <label>Notas</label>
          <textarea rows={2} value={editingMember.notes} onChange={(e) => setEditingMember({ ...editingMember, notes: e.target.value })} style={{ resize: "vertical" }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditingMember(null)} disabled={savingMember}>Cancelar</button>
        <button className="btn btn-primary" style={{ flex: 2 }} onClick={saveMember} disabled={savingMember}>{savingMember ? "Salvando…" : "Salvar"}</button>
      </div>
    </Modal>
  );
}

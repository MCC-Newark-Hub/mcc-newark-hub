import { useState } from "react";
import { Search, ArrowLeft, XCircle, CheckCircle2, AlertTriangle, UserPlus } from "lucide-react";
import { fmt, CATEGORIES, ROLE_BADGE, OBREIRO_ROLES, teamForRole, remainingDeadlineDays } from "@/constants";
import ChurchSearch from "@/components/ChurchSearch";
import SearchSelect from "@/components/SearchSelect";
import BadgePrint from "@/components/BadgePrint";
import { sb } from "@/lib/supabase";
import { mapMember } from "@/hooks/useAppData";
import { genMemberId } from "@/lib/genMemberId";
import { regDateLabel, regNumberKey, matchesRegNumber } from "@/lib/regNumber";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function extractBatchId(note) {
  const m = (note || "").match(/\[B\d+\]/);
  return m ? m[0] : null;
}

function getRegStatus(reg, lang) {
  const en = lang === "en";
  if (reg.cancelled)  return { label: en ? "Cancelled"     : "Cancelado",       color: "#6b7280", bg: "#f3f4f6" };
  if (reg.waitlisted) return { label: en ? "Waitlist"       : "Lista de Espera", color: "#92400e", bg: "#fef3c7" };
  if (reg.excedente)  return { label: en ? "Over Capacity"  : "Excedente",       color: "#7c3aed", bg: "#ede9fe" };
  if (reg.exempt)     return { label: en ? "Exempt"         : "Isento",          color: "#065f46", bg: "#d1fae5" };
  if (reg.paid)       return { label: en ? "Paid"           : "Pago",            color: "#065f46", bg: "#d1fae5" };
  return               { label: en ? "Pending"              : "Pendente",        color: "#b45309", bg: "#fef3c7" };
}


function RegCard({ reg, onCancel, lang }) {
  const status = getRegStatus(reg, lang);
  const date = regDateLabel(reg);
  const canCancel = !reg.cancelled && !reg.paid;

  return (
    <div style={{ border: "1.5px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 8, background: reg.cancelled ? "#f9fafb" : "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{reg.memberName || reg.badgeName}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
            {reg.category}{reg.church ? ` · ${reg.church}` : ""}
          </div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: status.bg, color: status.color, whiteSpace: "nowrap", flexShrink: 0 }}>
          {status.label}
        </span>
      </div>

      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 1, textTransform: "uppercase", letterSpacing: ".5px" }}>{lang === "en" ? "Number" : "Número"}</div>
          <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: "#b41926" }}>{reg.regNumber}</div>
        </div>
        {date && (
          <div>
            <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 1, textTransform: "uppercase", letterSpacing: ".5px" }}>{lang === "en" ? "Date" : "Data"}</div>
            <div style={{ fontSize: 13 }}>{date}</div>
          </div>
        )}
        {reg.fee > 0 && (
          <div>
            <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 1, textTransform: "uppercase", letterSpacing: ".5px" }}>{lang === "en" ? "Fee" : "Taxa"}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: reg.paid ? "#065f46" : "#b45309" }}>
              {reg.paid ? `✓ ${lang === "en" ? "Paid" : "Pago"} (${fmt(reg.fee)})` : fmt(reg.fee)}
            </div>
          </div>
        )}
        {reg.fee === 0 && (
          <div>
            <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 1, textTransform: "uppercase", letterSpacing: ".5px" }}>{lang === "en" ? "Fee" : "Taxa"}</div>
            <div style={{ fontSize: 13, color: "#065f46" }}>{reg.exempt ? (lang === "en" ? "Exempt" : "Isento") : (lang === "en" ? "Free" : "Grátis")}</div>
          </div>
        )}
      </div>

      {canCancel && (
        <button
          onClick={onCancel}
          style={{ marginTop: 12, background: "none", border: "1px solid #fca5a5", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer", color: "#dc2626", display: "flex", alignItems: "center", gap: 4 }}
        >
          <XCircle size={13} /> {lang === "en" ? "Cancel registration" : "Cancelar inscrição"}
        </button>
      )}
      {reg.paid && !reg.cancelled && (
        <p style={{ fontSize: 11, color: "#6b7280", marginTop: 8, marginBottom: 0 }}>
          {lang === "en"
            ? "Paid registrations cannot be cancelled here. Please speak with a clerk."
            : "Inscrições pagas não podem ser canceladas aqui. Fale com um atendente."}
        </p>
      )}
    </div>
  );
}

export default function RegistrationLookup({ event, regs, members, setMembers, churches, gas, updateReg, addReg, lang, onBack, initialName }) {
  const [searchMode, setSearchMode] = useState("name"); // "number" | "name" — name first, people search by name far more than by their reg number
  const [query, setQuery] = useState("");
  const [nameQuery, setNameQuery] = useState(initialName || "");
  const [found, setFound] = useState(null);
  const [related, setRelated] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelDone, setCancelDone] = useState(false);

  // Add family state
  const [showAddFamily, setShowAddFamily] = useState(false);
  const [famSearch, setFamSearch] = useState("");
  const [famSelected, setFamSelected] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [manualMember, setManualMember] = useState({ name: "", category: "Adulto", role: "", church: "", gaId: "" });
  const [famInvitedBy, setFamInvitedBy] = useState("");
  const [addDone, setAddDone] = useState(false);
  const [addingFamily, setAddingFamily] = useState(false);
  const [addFamilyError, setAddFamilyError] = useState(null);
  const [showBadges, setShowBadges] = useState(false);

  const registeredIds = (regs || [])
    .filter((r) => r.eventId === event?.id && !r.cancelled)
    .map((r) => r.memberId);

  const famResults =
    famSearch.length > 1
      ? (members || [])
          .filter((m) => norm(m.name).includes(norm(famSearch)) && !registeredIds.includes(m.id))
          .slice(0, 8)
      : [];

  const nameResults =
    nameQuery.length > 1
      ? (regs || [])
          .filter((r) => r.eventId === event?.id && norm(r.memberName).includes(norm(nameQuery)))
          .slice(0, 10)
      : [];

  // Partial number search (at least 3 letters/digits), this event only.
  const numberResults =
    regNumberKey(query).length > 2
      ? (regs || [])
          .filter((r) => r.eventId === event?.id && matchesRegNumber(r.regNumber, query))
          .slice(0, 10)
      : [];

  const resolveRelated = (reg) => {
    // Batch token: a real shared-submission id from the public portal's family flow.
    const batchId = extractBatchId(reg.note);
    if (batchId) {
      return (regs || []).filter(
        (r) => r.id !== reg.id && r.eventId === reg.eventId && extractBatchId(r.note) === batchId && !r.cancelled
      );
    }
    // family_id: a real staff-assigned directory family (RegModal's family mode).
    // Previously fell back to matching on identical raw note text instead, which
    // wrongly grouped anyone who happened to share a generic bulk-action note (e.g.
    // "Registrado em lote (Equipes)") as "family" — exposing unrelated people's
    // registration details to each other on this public lookup page.
    if (reg.familyId) {
      return (regs || []).filter(
        (r) => r.id !== reg.id && r.eventId === reg.eventId && r.familyId === reg.familyId && !r.cancelled
      );
    }
    return [];
  };

  const selectReg = (reg) => {
    setFound(reg);
    setRelated(resolveRelated(reg));
    setNotFound(false);
    setCancelDone(false);
    setAddDone(false);
    setShowAddFamily(false);
    setShowBadges(false);
    setNameQuery("");
  };

  const handleSearch = () => {
    const q = regNumberKey(query);
    if (!q) return;
    // A full number opens directly (any event); otherwise a single partial match does.
    const reg = (regs || []).find((r) => regNumberKey(r.regNumber) === q) ||
      (numberResults.length === 1 ? numberResults[0] : null);
    if (!reg && numberResults.length > 1) return; // the list below already shows them
    if (!reg) {
      setFound(null);
      setRelated([]);
      setNotFound(true);
      setCancelDone(false);
      setAddDone(false);
      return;
    }
    selectReg(reg);
  };

  const renderResults = (list) => (
    <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
      {list.map((r) => {
        const st = getRegStatus(r, lang);
        return (
          <div
            key={r.id}
            onClick={() => selectReg(r)}
            style={{ padding: "11px 14px", cursor: "pointer", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f8faff")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "")}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.memberName}</div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#b41926", marginTop: 1 }}>{r.regNumber}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: st.bg, color: st.color, whiteSpace: "nowrap" }}>
              {st.label}
            </span>
          </div>
        );
      })}
    </div>
  );

  const switchMode = (mode) => {
    setSearchMode(mode);
    setFound(null);
    setRelated([]);
    setNotFound(false);
    setQuery("");
    setNameQuery("");
    setCancelDone(false);
    setAddDone(false);
  };

  const doCancel = (ids) => {
    ids.forEach((id) => {
      updateReg(id, { cancelled: true }, { status: "Cancelado", note: "Cancelado pelo portal público" }, { silent: true });
    });
    if (found && ids.includes(found.id)) setFound((prev) => ({ ...prev, cancelled: true }));
    setRelated((prev) => prev.filter((r) => !ids.includes(r.id)));
    setCancelTarget(null);
    setCancelDone(true);
  };

  const handleAddFamily = async () => {
    if (!famSelected || !found || !addReg || addingFamily) return;
    if (!famSelected.church) {
      setAddFamilyError(lang === "en"
        ? "This person is missing a church. Please select one before adding them."
        : "Esta pessoa está sem igreja selecionada. Selecione uma antes de adicionar.");
      return;
    }
    setAddFamilyError(null);
    const isVerified = !famSelected.id?.startsWith("MANUAL-");
    let memberId = famSelected.id;
    if (!isVerified) {
      // Unverified ("couldn't find name") members don't exist in `members` yet.
      // registrations.member_id is a FK to members.id, so it must be created first.
      setAddingFamily(true);
      const row = {
        id: genMemberId(),
        name: famSelected.name,
        badge_name: famSelected.name,
        gender: famSelected.gender || "M",
        category: famSelected.category || "Adulto",
        church: famSelected.church || "",
        role: famSelected.role || "",
        roles: famSelected.role ? [famSelected.role] : [],
        ga_id: famSelected.gaId || null,
      };
      const { data, error } = await sb.from("members").insert(row).select().single();
      setAddingFamily(false);
      if (error) {
        console.error("handleAddFamily member insert error:", error);
        setAddFamilyError(lang === "en"
          ? "Could not save this person. Please check your connection and try again."
          : "Não foi possível salvar esta pessoa. Verifique sua conexão e tente novamente.");
        return;
      }
      memberId = data.id;
      if (setMembers) setMembers((prev) => [...prev, mapMember(data)]);
    }
    setAddingFamily(true);
    const optimisticReg = addReg({
      memberId,
      memberName: famSelected.name,
      badgeName: famSelected.name,
      category: famSelected.category || "Adulto",
      church: famSelected.church || "",
      role: famSelected.role || "",
      familyId: null,
      team: teamForRole(famSelected.role),
      paid: false,
      exempt: false,
      note: found.note, // inherit batch token + contact info from existing registration
      invitedByMemberId: famInvitedBy || null,
      groupWith: found.regNumber, // joins that registration's submission number
    });
    // addReg shows this reg immediately (before the DB write is confirmed) — await
    // .confirmed so a failed insert doesn't leave someone thinking a family member
    // was added when the row never actually persisted.
    const result = optimisticReg.confirmed ? await optimisticReg.confirmed : { ok: true, reg: optimisticReg };
    setAddingFamily(false);
    if (!result.ok && !result.duplicate) {
      setAddFamilyError(lang === "en"
        ? "Could not confirm this registration. Please try again."
        : "Não foi possível confirmar esta inscrição. Tente novamente.");
      return;
    }
    setRelated((prev) => [...prev, result.reg || optimisticReg]);
    setAddDone(true);
    setShowAddFamily(false);
    setFamSelected(null);
    setFamSearch("");
    setManualMember({ name: "", category: "Adulto", role: "", church: "", gaId: "" });
    setFamInvitedBy("");
    setShowManual(false);
  };

  const activeRelated = related.filter((r) => !r.cancelled);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <button
          onClick={onBack}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,.8)", fontSize: 13, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4, marginBottom: 20 }}
        >
          <ArrowLeft size={14} /> {lang === "en" ? "Home" : "Início"}
        </button>

        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ fontFamily: "'Lora',Georgia,serif", color: "#fff", fontSize: 22, marginBottom: 4 }}>
            {lang === "en" ? "Registration Lookup" : "Consultar Inscrição"}
          </h1>
          <p style={{ color: "rgba(255,255,255,.75)", fontSize: 13 }}>
            {lang === "en"
              ? "Enter your name or registration number to check your status, cancel, or add family members."
              : "Digite seu nome ou número de inscrição para consultar, cancelar ou adicionar familiares."}
          </p>
        </div>

        <div style={{ background: "#fff", borderRadius: 20, padding: "24px 20px" }}>
          {/* Mode tabs */}
          <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 8, padding: 3, marginBottom: 16, gap: 2 }}>
            {[
              { key: "name",   label: lang === "en" ? "By name"       : "Por nome" },
              { key: "number", label: lang === "en" ? "By reg number" : "Por número" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => switchMode(key)}
                style={{
                  flex: 1, padding: "7px 0", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", borderRadius: 6,
                  background: searchMode === key ? "#fff" : "transparent",
                  color: searchMode === key ? "#1a1e2e" : "#6b7280",
                  boxShadow: searchMode === key ? "0 1px 3px rgba(0,0,0,.1)" : "none",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search by number */}
          {searchMode === "number" && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value.toUpperCase()); setNotFound(false); setFound(null); }}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder={event?.prefix ? `ex: ${event.prefix}-1101-001-1` : "ex: PA202612-1101-001-1"}
                  style={{ flex: 1, fontFamily: "monospace", letterSpacing: ".04em", textTransform: "uppercase" }}
                />
                <button className="btn btn-primary" onClick={handleSearch} style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  <Search size={15} /> {lang === "en" ? "Search" : "Buscar"}
                </button>
              </div>
              <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: numberResults.length ? 8 : 16 }}>
                {lang === "en"
                  ? "Your reg number was shown on the confirmation screen. Part of it is enough (e.g. 1101-001)."
                  : "O número foi exibido na tela de confirmação. Basta parte dele (ex: 1101-001)."}
              </p>
              {numberResults.length > 0 && !found && renderResults(numberResults)}
            </>
          )}

          {/* Search by name */}
          {searchMode === "name" && (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                <input
                  value={nameQuery}
                  onChange={(e) => { setNameQuery(e.target.value); setNotFound(false); setFound(null); }}
                  placeholder={lang === "en" ? "Type your name..." : "Digite seu nome..."}
                  style={{ flex: 1 }}
                  autoFocus
                />
              </div>
              <p style={{ fontSize: 11, color: "#9ca3af", marginBottom: nameResults.length ? 8 : 16 }}>
                {lang === "en" ? "Type at least 2 characters to search." : "Digite ao menos 2 caracteres para buscar."}
              </p>
              {nameResults.length > 0 && !found && renderResults(nameResults)}
              {nameQuery.length > 1 && nameResults.length === 0 && !found && (
                <div style={{ padding: "12px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 13, color: "#991b1b", marginBottom: 12 }}>
                  {lang === "en" ? "No registrations found for that name." : "Nenhuma inscrição encontrada com esse nome."}
                </div>
              )}
            </>
          )}

          {notFound && (
            <div style={{ padding: "12px 14px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 13, color: "#991b1b", marginBottom: 12 }}>
              {lang === "en" ? "Registration not found. Check the number and try again." : "Inscrição não encontrada. Verifique o número e tente novamente."}
            </div>
          )}

          {cancelDone && (
            <div style={{ padding: "12px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, fontSize: 13, color: "#065f46", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={15} /> {lang === "en" ? "Registration cancelled successfully." : "Inscrição cancelada com sucesso."}
            </div>
          )}

          {addDone && (
            <div style={{ padding: "12px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, fontSize: 13, color: "#065f46", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={15} /> {lang === "en" ? "Family member added successfully." : "Familiar adicionado com sucesso."}
            </div>
          )}

          {found && (
            <div>
              {/* Waitlisted due to non-payment */}
              {found.waitlisted && !found.paid && found.fee > 0 && !found.exempt && (
                <div style={{ background: "#fef3c7", border: "1.5px solid #f59e0b", borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#92400e", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertTriangle size={14} />
                    {lang === "en" ? "Registration on Waiting List" : "Inscrição na Lista de Espera"}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "#78350f", lineHeight: 1.5 }}>
                    {lang === "en"
                      ? "Your registration was moved to the waiting list due to non-payment. After paying, your registration will return to the main list if spots are still available. Please contact the church secretary to make your payment."
                      : "Sua inscrição foi movida para a lista de espera por falta de pagamento. Após o pagamento, sua inscrição retornará à lista principal se ainda houver vagas. Procure a secretaria da sua igreja para efetuar o pagamento."}
                  </p>
                </div>
              )}
              {/* Upcoming payment deadline warning */}
              {!found.waitlisted && !found.cancelled && !found.paid && !found.exempt && found.fee > 0 && (() => {
                const remaining = remainingDeadlineDays(found, event, regs || []);
                if (remaining === null || remaining <= 0) return null;
                const urgent = remaining <= 2;
                return (
                  <div style={{ background: urgent ? "#fef2f2" : "#fef3c7", border: `1.5px solid ${urgent ? "#fca5a5" : "#f59e0b"}`, borderRadius: 10, padding: "12px 14px", marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: urgent ? "#991b1b" : "#92400e", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                      <AlertTriangle size={14} />
                      {lang === "en" ? `${remaining} day${remaining === 1 ? "" : "s"} left to pay` : `${remaining} dia${remaining === 1 ? "" : "s"} para pagar`}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: urgent ? "#991b1b" : "#78350f", lineHeight: 1.5 }}>
                      {lang === "en"
                        ? `Pay within ${remaining} day${remaining === 1 ? "" : "s"} to keep your spot. After this deadline, your registration will be moved to the waiting list and will only return to the main list after payment, if spots are available.`
                        : `Pague em até ${remaining} dia${remaining === 1 ? "" : "s"} para garantir sua vaga. Após esse prazo, sua inscrição será movida para a lista de espera e retornará à lista principal somente após o pagamento, se houver vagas.`}
                    </p>
                  </div>
                );
              })()}
              <RegCard reg={found} onCancel={() => setCancelTarget([found.id])} lang={lang} />

              {/* Family / same group */}
              {(activeRelated.length > 0 || found.cancelled === false) && (
                <div style={{ marginTop: 4 }}>
                  {activeRelated.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: ".5px", margin: "12px 0 8px" }}>
                        {lang === "en" ? "Family / Same group" : "Família / Mesmo grupo"}
                      </div>
                      {activeRelated.map((r) => (
                        <RegCard key={r.id} reg={r} onCancel={() => setCancelTarget([r.id])} lang={lang} />
                      ))}
                      {!found.cancelled && (
                        <button
                          className="btn btn-ghost"
                          style={{ width: "100%", marginTop: 4, color: "#991b1b", borderColor: "#fca5a5", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                          onClick={() => setCancelTarget([found.id, ...activeRelated.map((r) => r.id)])}
                        >
                          <XCircle size={14} />
                          {lang === "en"
                            ? `Cancel all ${activeRelated.length + 1} registrations`
                            : `Cancelar todas as ${activeRelated.length + 1} inscrições do grupo`}
                        </button>
                      )}
                    </>
                  )}

                  {/* Reprint badge(s) */}
                  {!found.cancelled && !showBadges && (
                    <button
                      className="btn btn-ghost"
                      style={{ width: "100%", marginTop: 8, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                      onClick={() => setShowBadges(true)}
                    >
                      🖨️ {activeRelated.length > 0
                        ? (lang === "en" ? "Reprint badge(s)" : "Reimprimir crachá(s)")
                        : (lang === "en" ? "Reprint badge" : "Reimprimir crachá")}
                    </button>
                  )}
                  {showBadges && <BadgePrint regs={[found, ...activeRelated]} event={event} lang={lang} />}

                  {/* Add family member */}
                  {!found.cancelled && !showAddFamily && (
                    <button
                      className="btn btn-ghost"
                      style={{ width: "100%", marginTop: 8, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
                      onClick={() => { setShowAddFamily(true); setAddDone(false); }}
                    >
                      <UserPlus size={14} />
                      {lang === "en" ? "Add family member" : "Adicionar familiar"}
                    </button>
                  )}
                </div>
              )}

              {/* Add family member panel */}
              {showAddFamily && !found.cancelled && (
                <div style={{ marginTop: 12, border: "1.5px solid #bfdbfe", borderRadius: 10, padding: "16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1e40af", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    <UserPlus size={16} /> {lang === "en" ? "Add family member" : "Adicionar familiar"}
                  </div>

                  {!famSelected && (
                    <>
                      <label style={{ fontSize: 13 }}>{lang === "en" ? "Search by name" : "Buscar pelo nome"}</label>
                      <div style={{ position: "relative", marginTop: 4, marginBottom: 8 }}>
                        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af" }}><Search size={14} /></span>
                        <input
                          value={famSearch}
                          onChange={(e) => setFamSearch(e.target.value)}
                          placeholder={lang === "en" ? "Type name..." : "Digite o nome..."}
                          style={{ paddingLeft: 32, width: "100%", boxSizing: "border-box" }}
                          autoFocus
                        />
                      </div>

                      {famResults.length > 0 && (
                        <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden", maxHeight: 180, overflowY: "auto", marginBottom: 8 }}>
                          {famResults.map((m) => (
                            <div
                              key={m.id}
                              onClick={() => { setFamSelected(m); setFamSearch(""); }}
                              style={{ padding: "9px 14px", cursor: "pointer", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                            >
                              <div>
                                <span style={{ fontWeight: 600 }}>{m.name}</span>
                                <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>{m.church}</span>
                              </div>
                              <span className="badge badge-blue">{m.category}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {famSearch.length > 1 && famResults.length === 0 && (
                        <p style={{ fontSize: 12, color: "#b45309", background: "#fef3c7", borderRadius: 6, padding: "8px 10px", marginBottom: 8 }}>
                          {lang === "en" ? "Not found in directory." : "Não encontrado no diretório."}
                        </p>
                      )}

                      <div className="cb" style={{ marginTop: 4 }}>
                        <input type="checkbox" id="lk-manual" checked={showManual} onChange={(e) => setShowManual(e.target.checked)} />
                        <label htmlFor="lk-manual" style={{ fontSize: 13 }}>
                          {lang === "en" ? "Member not found — add manually" : "Membro não encontrado — adicionar manualmente"}
                        </label>
                      </div>

                      {showManual && (
                        <div style={{ marginTop: 10, background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 8, padding: "12px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            <div>
                              <label style={{ fontSize: 13 }}>{lang === "en" ? "Full name" : "Nome completo"}</label>
                              <input value={manualMember.name} onChange={(e) => setManualMember({ ...manualMember, name: e.target.value })} />
                            </div>
                            <div>
                              <label style={{ fontSize: 13 }}>{lang === "en" ? "Category" : "Categoria"}</label>
                              <select value={manualMember.category} onChange={(e) => setManualMember({ ...manualMember, category: e.target.value })}>
                                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                            <div>
                              <label style={{ fontSize: 13 }}>{lang === "en" ? "Role (if applicable)" : "Função (se aplicável)"}</label>
                              <select value={manualMember.role} onChange={(e) => setManualMember({ ...manualMember, role: e.target.value })}>
                                <option value="">{lang === "en" ? "(None)" : "(Nenhum)"}</option>
                                {OBREIRO_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <p style={{ fontSize: 11, color: "#92400e", marginTop: 3 }}>
                                {lang === "en" ? "Pastors and Ungidos are automatically identified as fee-exempt." : "Pastores e Ungidos são identificados automaticamente como isentos de taxa."}
                              </p>
                            </div>
                            <div>
                              <label style={{ fontSize: 13 }}>{lang === "en" ? "Church" : "Igreja"}</label>
                              <ChurchSearch
                                churches={churches}
                                value={manualMember.church}
                                onChange={(v) => setManualMember({ ...manualMember, church: v })}
                                placeholder={lang === "en" ? "Select church..." : "Selecione a igreja..."}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 13 }}>{lang === "en" ? "Group (optional)" : "Grupo (opcional)"}</label>
                              <SearchSelect
                                value={manualMember.gaId}
                                onSelect={(v) => setManualMember({ ...manualMember, gaId: v })}
                                items={(gas || []).filter((g) => {
                                  if (!manualMember.church) return true;
                                  const gaCity = (g.church || "").split(",")[0].trim().toLowerCase();
                                  return !gaCity || manualMember.church.toLowerCase().includes(gaCity);
                                })}
                                getLabel={(g) => g.name}
                                getId={(g) => g.id}
                                placeholder={lang === "en" ? "Search group…" : "Buscar grupo…"}
                              />
                            </div>
                            <button
                              className="btn btn-warn btn-sm"
                              disabled={!manualMember.name.trim() || !manualMember.church}
                              onClick={() => {
                                if (!manualMember.name.trim() || !manualMember.church) return;
                                setFamSelected({ id: "MANUAL-" + Date.now(), name: manualMember.name.trim(), category: manualMember.category, church: manualMember.church, role: manualMember.role, gaId: manualMember.gaId, verified: false });
                                setShowManual(false);
                              }}
                            >
                              {lang === "en" ? "Use this name" : "Usar este nome"}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Selected member preview */}
                  {famSelected && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <span style={{ fontWeight: 600 }}>{famSelected.name}</span>
                          {famSelected.verified === false && (
                            <span style={{ marginLeft: 6, fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>{lang === "en" ? "Unverified" : "Não verificado"}</span>
                          )}
                          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{famSelected.category}{famSelected.church ? ` · ${famSelected.church}` : ""}</div>
                        </div>
                        <button onClick={() => { setFamSelected(null); setFamSearch(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18 }}>×</button>
                      </div>
                      <div style={{ marginTop: 10 }}>
                        <label style={{ fontSize: 13 }}>{lang === "en" ? "Invited by someone?" : "Foi convidado(a) por alguém?"} <span style={{ fontSize: 11, color: "#9ca3af" }}>({lang === "en" ? "optional" : "opcional"})</span></label>
                        <SearchSelect
                          value={famInvitedBy}
                          onSelect={setFamInvitedBy}
                          items={members}
                          getLabel={(m) => m?.name || ""}
                          getId={(m) => m?.id || ""}
                          placeholder={lang === "en" ? "Search name..." : "Buscar nome..."}
                        />
                      </div>
                    </div>
                  )}

                  {addFamilyError && <p style={{ color: "#c0392b", fontSize: 12, marginBottom: 8 }}>{addFamilyError}</p>}

                  <div style={{ display: "flex", gap: 8, marginTop: famSelected ? 0 : 12 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} disabled={addingFamily} onClick={() => { setShowAddFamily(false); setFamSelected(null); setFamSearch(""); setFamInvitedBy(""); setShowManual(false); }}>
                      {lang === "en" ? "Cancel" : "Cancelar"}
                    </button>
                    <button
                      className="btn btn-primary"
                      style={{ flex: 2 }}
                      disabled={!famSelected || !famSelected.church || addingFamily}
                      onClick={handleAddFamily}
                    >
                      <UserPlus size={14} style={{ marginRight: 4 }} />
                      {addingFamily ? (lang === "en" ? "Adding…" : "Adicionando…") : (lang === "en" ? "Add to registration" : "Adicionar à inscrição")}
                    </button>
                  </div>
                </div>
              )}

              {/* Cancel confirmation */}
              {cancelTarget && (
                <div style={{ marginTop: 12, padding: "16px", background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 10 }}>
                  <div style={{ fontWeight: 700, color: "#991b1b", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <AlertTriangle size={16} />
                    {lang === "en" ? "Confirm cancellation" : "Confirmar cancelamento"}
                  </div>
                  <p style={{ fontSize: 13, color: "#374151", marginBottom: 14, lineHeight: 1.5 }}>
                    {cancelTarget.length > 1
                      ? (lang === "en"
                          ? `Cancel all ${cancelTarget.length} registrations in this group? This cannot be undone.`
                          : `Cancelar as ${cancelTarget.length} inscrições deste grupo? Esta ação não pode ser desfeita.`)
                      : (lang === "en"
                          ? "Cancel this registration? This cannot be undone."
                          : "Cancelar esta inscrição? Esta ação não pode ser desfeita.")}
                  </p>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setCancelTarget(null)}>
                      {lang === "en" ? "Keep it" : "Manter"}
                    </button>
                    <button
                      className="btn btn-accent"
                      style={{ flex: 1, background: "#dc2626", borderColor: "#dc2626" }}
                      onClick={() => doCancel(cancelTarget)}
                    >
                      {lang === "en" ? "Yes, cancel" : "Sim, cancelar"}
                    </button>
                  </div>
                </div>
              )}

              {!cancelTarget && !showAddFamily && (
                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 14, textAlign: "center" }}>
                  {lang === "en"
                    ? "For other changes, please speak with a registration clerk."
                    : "Para outras alterações, fale com um atendente."}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

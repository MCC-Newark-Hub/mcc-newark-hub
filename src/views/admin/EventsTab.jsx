import { useState } from "react";
import QRCode from "qrcode";
import { useT } from "@/i18n/strings";
import { CATEGORIES } from "@/constants";
import { sb } from "@/lib/supabase";
import Modal from "@/components/Modal";
import { fetchEventTeams, importTeamsFromEvent } from "@/lib/rosterImport";
import { cleanPrefix } from "@/lib/regNumber";
import { nextEventId } from "@/lib/eventId";

export default function EventsTab({ events, setEvents, event, setEvent, lang, notify, rosters, setRosters, logAudit }) {
  const t = useT();
  const [showNew, setShowNew] = useState(false);
  const [editEvt, setEditEvt] = useState(null);
  const [qrModal, setQrModal] = useState(null); // { eventId, dataUrl }
  const [importSourceId, setImportSourceId] = useState("");
  const [importTeams, setImportTeams] = useState([]); // [{ team, memberCount, checked }]
  const [importLoading, setImportLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { id, name, checking, regCount }
  const [deleting, setDeleting] = useState(false);
  const [showForceDelete, setShowForceDelete] = useState(false);
  const [forceConfirmText, setForceConfirmText] = useState("");

  const requestDelete = async (ev) => {
    setShowForceDelete(false);
    setForceConfirmText("");
    setConfirmDelete({ id: ev.id, name: ev.name, checking: true, regCount: 0 });
    const { count } = await sb
      .from("registrations")
      .select("id", { count: "exact", head: true })
      .eq("event_id", ev.id);
    setConfirmDelete({ id: ev.id, name: ev.name, checking: false, regCount: count || 0 });
  };

  const deleteEventRow = async (id) => {
    await sb.from("rosters").delete().eq("event_id", id);
    await sb.from("approvals").delete().eq("event_id", id);
    await sb.from("registrations").delete().eq("event_id", id);
    const { error } = await sb.from("events").delete().eq("id", id);
    if (error) throw error;
    setEvents((prev) => prev.filter((e) => e.id !== id));
    if (setRosters) setRosters((prev) => prev.filter((r) => r.eventId !== id));
    if (event?.id === id) setEvent(null);
  };

  const confirmDeleteEvent = async () => {
    if (!confirmDelete || confirmDelete.regCount > 0) return;
    const { id } = confirmDelete;
    setDeleting(true);
    try {
      await deleteEventRow(id);
      logAudit?.("event_deleted", "event", id, confirmDelete.name, null);
      notify("Evento excluído.");
      setConfirmDelete(null);
    } catch (err) {
      notify("Erro ao excluir evento: " + (err?.message || "erro desconhecido"));
    } finally {
      setDeleting(false);
    }
  };

  const forceDeleteEvent = async () => {
    if (!confirmDelete || forceConfirmText !== confirmDelete.name) return;
    const { id } = confirmDelete;
    setDeleting(true);
    try {
      await deleteEventRow(id);
      logAudit?.("event_force_deleted", "event", id, confirmDelete.name, { regCount: confirmDelete.regCount });
      notify("Evento e todas as inscrições foram excluídos.");
      setConfirmDelete(null);
      setShowForceDelete(false);
      setForceConfirmText("");
    } catch (err) {
      notify("Erro ao excluir evento: " + (err?.message || "erro desconhecido"));
    } finally {
      setDeleting(false);
    }
  };

  const loadImportSource = async (sourceId) => {
    setImportSourceId(sourceId);
    setImportTeams([]);
    if (!sourceId) return;
    setImportLoading(true);
    const sourceRosters = await fetchEventTeams(sourceId);
    setImportTeams(
      sourceRosters
        .filter((r) => (r.memberIds || []).length > 0)
        .map((r) => ({ team: r.team, memberCount: r.memberIds.length, checked: true }))
    );
    setImportLoading(false);
  };

  const openQrModal = async (eventId) => {
    const url = `${window.location.origin}?selfcheckin=${eventId}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 2 });
      setQrModal({ eventId, url, dataUrl });
    } catch (e) {
      console.error('QR gen error', e);
    }
  };
  const isEditing = !!editEvt;
  const [nEvt, setNEvt] = useState({
    name: "",
    prefix: "",
    date: "",
    time: "09:00",
    location: "",
    capacity: 200,
    paymentDeadlineDays: 7,
    registrationDeadline: "",
    fees: { "0-3": 0, Criança: 0, Intermediário: 0, Adolescente: 25, Jovem: 25, Adulto: 25 },
  });

  const cur = isEditing ? editEvt : nEvt;
  const setCur = isEditing ? setEditEvt : setNEvt;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22 }}>{t.events}</h2>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditEvt(null);
            setNEvt({
              name: "",
              prefix: "",
              date: "",
              time: "09:00",
              location: "",
              capacity: 200,
              paymentDeadlineDays: 7,
              registrationDeadline: "",
              fees: {
                "0-3": 0,
                Criança: 0,
                Intermediário: 0,
                Adolescente: 25,
                Jovem: 25,
                Adulto: 25,
              },
            });
            setImportSourceId("");
            setImportTeams([]);
            setShowNew(true);
          }}
        >
          {t.newEvent}
        </button>
      </div>

      {events.map((e) => (
        <div
          className="card"
          key={e.id}
          style={{
            marginBottom: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderLeft: `4px solid ${event?.id === e.id ? "#1a3a6b" : "transparent"}`,
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{e.name}</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
              📅 {e.date} · 📍 {e.location} · {t.prefix}: {e.prefix} · {t.capacity}:{" "}
              {e.capacity ?? "-"}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
              {CATEGORIES.map((c) => (
                <span key={c} className="badge badge-gray" style={{ fontSize: 10 }}>
                  {c}: {e.fees?.[c] === 0 ? t.free : `$${e.fees?.[c]}`}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setEvent(e)}>
              {event?.id === e.id ? "✓ Ativo" : t.select}
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setEditEvt({ ...e });
                setShowNew(true);
              }}
            >
              ✏️
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => openQrModal(e.id)}
            >
              🔗 QR Auto-Check-in
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => requestDelete(e)}
            >
              🗑️
            </button>
          </div>
        </div>
      ))}

      {confirmDelete && (
        <Modal onClose={() => !deleting && setConfirmDelete(null)} maxWidth={360}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 8 }}>
              Confirmar exclusão
            </h3>
            {confirmDelete.checking ? (
              <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 20 }}>
                Verificando inscrições...
              </p>
            ) : confirmDelete.regCount > 0 ? (
              <p style={{ color: "#c0392b", fontSize: 14, marginBottom: 20 }}>
                Este evento tem <strong>{confirmDelete.regCount}</strong> inscrição(ões) e não pode
                ser excluído.
              </p>
            ) : (
              <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 20 }}>
                Excluir <strong>{confirmDelete.name}</strong>? Isso também remove equipes/escalação
                vinculadas. Esta ação não pode ser desfeita.
              </p>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                {confirmDelete.regCount > 0 || confirmDelete.checking ? "Fechar" : "Cancelar"}
              </button>
              {!confirmDelete.checking && confirmDelete.regCount === 0 && (
                <button
                  className="btn btn-danger"
                  style={{ flex: 1 }}
                  onClick={confirmDeleteEvent}
                  disabled={deleting}
                >
                  {deleting ? "Excluindo..." : "Excluir"}
                </button>
              )}
            </div>

            {!confirmDelete.checking && confirmDelete.regCount > 0 && (
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px dashed var(--border)", textAlign: "left" }}>
                {!showForceDelete ? (
                  <button
                    onClick={() => setShowForceDelete(true)}
                    style={{ background: "none", border: "none", color: "#c0392b", fontSize: 12, cursor: "pointer", textDecoration: "underline", padding: 0 }}
                  >
                    Sou administrador e quero excluir mesmo assim
                  </button>
                ) : (
                  <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "12px 14px" }}>
                    <p style={{ fontSize: 12, color: "#991b1b", marginBottom: 10, lineHeight: 1.5 }}>
                      ⚠️ Isso excluirá permanentemente o evento e <strong>todas as {confirmDelete.regCount} inscrições</strong> vinculadas,
                      incluindo pagamentos registrados. Não pode ser desfeito.
                    </p>
                    <label style={{ fontSize: 12, color: "#991b1b" }}>
                      Digite <strong>{confirmDelete.name}</strong> para confirmar:
                    </label>
                    <input
                      value={forceConfirmText}
                      onChange={(e) => setForceConfirmText(e.target.value)}
                      style={{ marginTop: 4, marginBottom: 10 }}
                      autoFocus
                    />
                    <button
                      className="btn btn-danger"
                      style={{ width: "100%" }}
                      disabled={deleting || forceConfirmText !== confirmDelete.name}
                      onClick={forceDeleteEvent}
                    >
                      {deleting ? "Excluindo..." : `Excluir evento e ${confirmDelete.regCount} inscrições`}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {qrModal && (
        <Modal onClose={() => setQrModal(null)}>
          <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 8 }}>QR Auto-Check-in</h3>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>Exiba este QR durante o evento para auto-check-in</p>
          <img src={qrModal.dataUrl} alt="QR Code" style={{ width: 220, height: 220, display: 'block', margin: '0 auto 16px' }} />
          <p style={{ fontSize: 11, color: '#9ca3af', wordBreak: 'break-all', marginBottom: 16 }}>{qrModal.url}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <a
              href={qrModal.dataUrl}
              download={`selfcheckin-qr-${qrModal.eventId}.png`}
              className="btn btn-primary btn-sm"
            >
              ⬇️ Baixar QR
            </a>
            <button className="btn btn-ghost btn-sm" onClick={() => setQrModal(null)}>Fechar</button>
          </div>
        </Modal>
      )}

      {showNew && (
        <div
          className="modal-bg"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowNew(false);
              setEditEvt(null);
            }
          }}
        >
          <div className="modal">
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 20, marginBottom: 16 }}>
              {isEditing ? (lang === "en" ? "Edit Event" : "Editar Evento") : t.newEvent}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div>
                <label>{t.memberName} *</label>
                <input
                  value={cur.name}
                  onChange={(e) => setCur({ ...cur, name: e.target.value })}
                />
              </div>
              <div className="fr">
                <div>
                  <label>{t.prefix} *</label>
                  <input
                    value={cur.prefix}
                    onChange={(e) => setCur({ ...cur, prefix: cleanPrefix(e.target.value) })}
                    maxLength={10}
                    placeholder="PA202612"
                  />
                </div>
                <div>
                  <label>{t.location} *</label>
                  <input
                    value={cur.location}
                    onChange={(e) => setCur({ ...cur, location: e.target.value })}
                  />
                </div>
              </div>
              <div className="fr">
                <div>
                  <label>{t.date} *</label>
                  <input
                    type="date"
                    value={cur.date}
                    onChange={(e) => setCur({ ...cur, date: e.target.value })}
                  />
                </div>
                <div>
                  <label>Hora/Time</label>
                  <input
                    type="time"
                    value={cur.time}
                    onChange={(e) => setCur({ ...cur, time: e.target.value })}
                  />
                </div>
              </div>
              <div className="fr">
                <div>
                  <label>{t.maxCapacity}</label>
                  <input
                    type="number"
                    min={1}
                    value={cur.capacity}
                    onChange={(e) => setCur({ ...cur, capacity: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label>
                    {lang === "en" ? "Payment Deadline (days)" : "Prazo de Pagamento (dias)"}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={cur.paymentDeadlineDays || 7}
                    onChange={(e) =>
                      setCur({ ...cur, paymentDeadlineDays: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div>
                <label>
                  {lang === "en" ? "Registration Deadline (optional)" : "Prazo de Inscrição (opcional)"}
                </label>
                <input
                  type="date"
                  value={cur.registrationDeadline ?? cur.registration_deadline ?? ""}
                  onChange={(e) =>
                    setCur({ ...cur, registrationDeadline: e.target.value })
                  }
                />
                <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                  {lang === "en"
                    ? "After this date, submissions require pastor approval. Leave blank for no deadline."
                    : "Após esta data, inscrições exigem aprovação do pastor. Deixe em branco para não ter prazo."}
                </p>
              </div>
              <div>
                <label>{t.feesPerCat}</label>
                <div
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}
                >
                  {CATEGORIES.map((c) => (
                    <div key={c} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, width: 110, color: "#4b5563", flexShrink: 0 }}>
                        {c}
                      </span>
                      <input
                        type="number"
                        min={0}
                        style={{ width: "auto", flex: 1 }}
                        value={cur.fees[c]}
                        onChange={(e) =>
                          setCur({ ...cur, fees: { ...cur.fees, [c]: Number(e.target.value) } })
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
              {!isEditing && (
                <div>
                  <label>Importar escalação de evento anterior (opcional)</label>
                  <select value={importSourceId} onChange={(e) => loadImportSource(e.target.value)}>
                    <option value="">Não importar</option>
                    {events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.date})
                      </option>
                    ))}
                  </select>
                  {importLoading && (
                    <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>Carregando equipes...</p>
                  )}
                  {!importLoading && importSourceId && importTeams.length === 0 && (
                    <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                      Este evento não possui equipes com membros.
                    </p>
                  )}
                  {importTeams.length > 0 && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {importTeams.map((it, i) => (
                        <label
                          key={it.team}
                          style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
                        >
                          <input
                            type="checkbox"
                            checked={it.checked}
                            onChange={(e) =>
                              setImportTeams((prev) =>
                                prev.map((x, idx) => (idx === i ? { ...x, checked: e.target.checked } : x))
                              )
                            }
                          />
                          {it.team} <span style={{ color: "#9ca3af" }}>({it.memberCount} membros)</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="fr">
                <button
                  className="btn btn-primary"
                  onClick={function () {
                    if (isEditing) {
                      var upd = {
                        name: editEvt.name,
                        prefix: editEvt.prefix,
                        date: editEvt.date,
                        time: editEvt.time,
                        location: editEvt.location,
                        capacity: editEvt.capacity,
                        payment_deadline_days: editEvt.paymentDeadlineDays,
                        registration_deadline: (editEvt.registrationDeadline ?? editEvt.registration_deadline) || null,
                        fees: editEvt.fees,
                      };
                      setEvents(function (p) {
                        return p.map(function (e) {
                          return e.id === editEvt.id ? { ...editEvt } : e;
                        });
                      });
                      if (event && event.id === editEvt.id) setEvent({ ...editEvt });
                      sb.from("events")
                        .update(upd)
                        .eq("id", editEvt.id)
                        .then(function (res) {
                          if (res.error) { console.error("event update error:", res.error); return; }
                          logAudit?.("event_updated", "event", editEvt.id, editEvt.name, { capacity: upd.capacity });
                        });
                      notify("Evento atualizado!");
                      setShowNew(false);
                      setEditEvt(null);
                    } else {
                      if (!nEvt.name || !nEvt.prefix || !nEvt.date) return;
                      var newId = nextEventId(events);
                      var ev = { ...nEvt, id: newId, status: "active" };
                      var dbRow = {
                        id: newId,
                        name: nEvt.name,
                        prefix: nEvt.prefix,
                        date: nEvt.date,
                        time: nEvt.time,
                        location: nEvt.location,
                        capacity: nEvt.capacity,
                        payment_deadline_days: nEvt.paymentDeadlineDays,
                        registration_deadline: nEvt.registrationDeadline || null,
                        fees: nEvt.fees,
                        status: "active",
                      };
                      setEvents(function (p) {
                        return [...p, ev];
                      });
                      setEvent(ev);
                      var teamsToImport = importTeams.filter((it) => it.checked).map((it) => it.team);
                      setShowNew(false);
                      sb.from("events")
                        .insert(dbRow)
                        .then(function (res) {
                          if (res.error) {
                            console.error("event insert error:", res.error);
                            return;
                          }
                          logAudit?.("event_created", "event", newId, nEvt.name, { capacity: nEvt.capacity });
                          if (importSourceId && teamsToImport.length > 0) {
                            importTeamsFromEvent({
                              sourceEventId: importSourceId,
                              targetEventId: newId,
                              teamNames: teamsToImport,
                              rosters: rosters || [],
                              setRosters,
                            }).then(function (imported) {
                              notify(`Evento criado com ${imported.length} equipe(s) importada(s)!`);
                            });
                          }
                        });
                    }
                  }}
                >
                  {isEditing ? (lang === "en" ? "Save Changes" : "Salvar Alterações") : t.create}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowNew(false);
                    setEditEvt(null);
                  }}
                >
                  {t.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

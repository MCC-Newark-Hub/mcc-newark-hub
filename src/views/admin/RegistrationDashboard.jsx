import { useState, Fragment } from "react";
import { MonitorPlay } from "lucide-react";
import { CATEGORIES } from "@/constants";
import { useT } from "@/i18n/strings";

const CIA_CATS = ["0-3", "Criança", "Intermediário"];


const thS = {
  padding: "7px 12px",
  fontSize: 11,
  fontWeight: 700,
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: ".4px",
  textAlign: "left",
  borderBottom: "1px solid var(--border)",
  background: "var(--bg2)",
};
const tdS = { padding: "7px 12px", borderBottom: "1px solid var(--border)", fontSize: 13 };

const memberById = (members) => Object.fromEntries((members || []).map((m) => [m.id, m]));
const isSeminaryProfessor = (r, membersMap) =>
  ((membersMap[r.memberId] || {}).roles || []).includes("Professor de Seminário");

export default function RegistrationDashboard({ regs, wlRegs, event, members, churches }) {
  const tt = useT();
  const membersMap = memberById(members);
  const [expandedCh, setExpandedCh] = useState({});
  const [expandedHub, setExpandedHub] = useState({});
  const toggleCh = (k) => setExpandedCh((p) => ({ ...p, [k]: !p[k] }));
  const toggleHub = (k) => setExpandedHub((p) => ({ ...p, [k]: !p[k] }));

  const er = regs.filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted);
  const wl = wlRegs || [];
  const allEventRegs = regs.filter((r) => r.eventId === event?.id);
  const cancelled = allEventRegs.filter((r) => r.cancelled);

  const normalizeChurch = (c) => (!c || c === "Sem Igreja") ? "Outra / Não Listada" : c;
  const liveChurchOf = (r) =>
    normalizeChurch((members || []).find((m) => m.id === r.memberId)?.church || r.church);

  const hubSet = new Set((churches || []).filter((c) => c.is_hub).map((c) => c.display));
  const isHubChurch = (church) => hubSet.has(church);

  // ── Hierarchical groups (mutually exclusive, sum to er.length) ────────────
  const pastores = er.filter((r) => r.role === "Pastor");
  const ungidos = er.filter((r) => r.role === "Ungido");
  const diaconos = er.filter((r) => r.role === "Diácono");
  const ministerialIds = new Set([...pastores, ...ungidos, ...diaconos].map((r) => r.id));

  const trabalhadores = er.filter(
    (r) => !ministerialIds.has(r.id) && r.team && r.team !== "Participante"
  );
  const trabalhadoresIds = new Set(trabalhadores.map((r) => r.id));

  const cia = er.filter(
    (r) => !ministerialIds.has(r.id) && !trabalhadoresIds.has(r.id) && CIA_CATS.includes(r.category)
  );
  const ciaIds = new Set(cia.map((r) => r.id));

  const participantes = er.filter(
    (r) => !ministerialIds.has(r.id) && !trabalhadoresIds.has(r.id) && !ciaIds.has(r.id)
  );

  // Pastor split: seminary professors vs others (role-based, not team-name-based)
  const pastoresProfessores = pastores.filter((r) => isSeminaryProfessor(r, membersMap));
  const pastoresOutros = pastores.filter((r) => !isSeminaryProfessor(r, membersMap));

  // Confirmed / pending helpers
  const conf = (rows) => rows.filter((r) => r.paid || r.exempt).length;
  const pend = (rows) => rows.filter((r) => !r.paid && !r.exempt).length;

  const confirmed = conf(er);
  const pending = pend(er);
  const excedentes = er.filter((r) => r.excedente);
  const pct = er.length > 0 ? Math.round((confirmed / er.length) * 100) : 0;

  // Breakdown rows (in display order — must sum to er.length)
  const breakdownRows = [
    {
      label: "Pastores",
      rows: pastores,
      note: pastorNoteLabel(pastoresProfessores.length, pastoresOutros.length),
      color: "#7c3aed",
    },
    { label: "Ungidos", rows: ungidos, color: "#1e40af" },
    { label: "Diáconos", rows: diaconos, color: "#0369a1" },
    {
      label: "Trabalhadores",
      rows: trabalhadores,
      note: "equipes de serviço — excl. ministério",
      color: "#059669",
    },
    {
      label: "CIAs",
      rows: cia,
      note: "0-3 · Criança · Intermediário",
      color: "#d97706",
    },
    { label: "Participantes", rows: participantes, color: "#6b7280" },
  ].filter((x) => x.rows.length > 0);

  // By church
  const byCh = [...new Set(er.map(liveChurchOf))]
    .map((ch) => {
      const rows = er.filter((r) => liveChurchOf(r) === ch);
      return {
        ch,
        hub: isHubChurch(ch),
        total: rows.length,
        confirmed: conf(rows),
        pending: pend(rows),
        cats: CATEGORIES.filter((c) => rows.some((r) => r.category === c)).map((c) => ({
          c,
          n: rows.filter((r) => r.category === c).length,
        })),
      };
    })
    .sort((a, b) => b.total - a.total);

  // Hub split
  const hubData = [true, false]
    .map((isHub) => {
      const label = isHub ? "Dentro do Pólo" : "Fora do Pólo";
      const rows = er.filter((r) => isHubChurch(liveChurchOf(r)) === isHub);
      return {
        label,
        isHub,
        rows,
        confirmed: conf(rows),
        pending: pend(rows),
        churches: byCh.filter((c) => c.hub === isHub),
      };
    })
    .filter((x) => x.rows.length > 0);

  const hasHubData = hubSet.size > 0 && hubData.length > 0;

  return (
    <div>
      <div style={{ marginBottom: 18, display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700 }}>
            Resumo de Inscrições
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 2 }}>{event?.name}</p>
        </div>
        {event?.id && (
          <a className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} href={`/events/painel/${event.id}`} target="_blank" rel="noopener noreferrer">
            <MonitorPlay size={14} /> {tt.statsOpenPublic}
          </a>
        )}
      </div>

      {/* ── Total + status ─────────────────────────────────────────────── */}
      <div
        className="card"
        style={{ padding: "16px 20px", marginBottom: 14, borderLeft: "4px solid #1a3a6b" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 36, fontWeight: 800, color: "#1a3a6b", lineHeight: 1 }}>
            {er.length}
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--muted)" }}>
            total de inscritos — {pct}% confirmados
          </span>
        </div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {[
            { label: "Confirmados", value: confirmed, color: "#2d8a4e" },
            { label: "Pendentes", value: pending, color: "#d4820a" },
            { label: "Em Espera", value: wl.length, color: "#92400e" },
            { label: "Excedentes", value: excedentes.length, color: "#ff6b35" },
            { label: "Cancelados", value: cancelled.length, color: "#9ca3af" },
          ].map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
              <strong style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.value}</strong>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Hierarchical breakdown ─────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
        <div
          style={{
            padding: "11px 16px",
            fontWeight: 700,
            fontSize: 14,
            borderBottom: "1px solid var(--border)",
          }}
        >
          Composição dos Inscritos
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}>
            <tr>
              <th style={thS}>Grupo</th>
              <th style={{ ...thS, textAlign: "right" }}>Total</th>
              <th style={{ ...thS, textAlign: "right" }}>Conf.</th>
              <th style={{ ...thS, textAlign: "right" }}>Pend.</th>
              <th style={{ ...thS, textAlign: "left" }}>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {breakdownRows.map((x) => (
              <tr key={x.label}>
                <td style={tdS}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: x.color,
                      marginRight: 8,
                      verticalAlign: "middle",
                    }}
                  />
                  {x.label}
                </td>
                <td style={{ ...tdS, textAlign: "right", fontWeight: 700 }}>{x.rows.length}</td>
                <td style={{ ...tdS, textAlign: "right", color: "#2d8a4e", fontWeight: 600 }}>
                  {conf(x.rows)}
                </td>
                <td
                  style={{
                    ...tdS,
                    textAlign: "right",
                    color: pend(x.rows) > 0 ? "#d4820a" : "var(--muted)",
                  }}
                >
                  {pend(x.rows)}
                </td>
                <td style={{ ...tdS, fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                  {x.note || ""}
                </td>
              </tr>
            ))}
            <tr style={{ fontWeight: 700, background: "var(--bg2)" }}>
              <td style={tdS}>Total</td>
              <td style={{ ...tdS, textAlign: "right" }}>{er.length}</td>
              <td style={{ ...tdS, textAlign: "right", color: "#2d8a4e" }}>{confirmed}</td>
              <td style={{ ...tdS, textAlign: "right", color: "#d4820a" }}>{pending}</td>
              <td style={tdS} />
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── By church + by category ────────────────────────────────────── */}
      <div className="two-col" style={{ marginBottom: 14 }}>
        {/* Por Igreja */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "11px 16px",
              fontWeight: 700,
              fontSize: 14,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Por Igreja
          </div>
          {byCh.length === 0 && (
            <p style={{ padding: 16, color: "var(--muted)", fontSize: 13 }}>
              Nenhuma inscrição ainda.
            </p>
          )}
          {byCh.map((x) => {
            const isOpen = !!expandedCh[x.ch];
            return (
              <Fragment key={x.ch}>
                <div
                  onClick={() => toggleCh(x.ch)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 16px",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span style={{ display: "inline-block", width: 14, color: "#9ca3af" }}>
                      {isOpen ? "▾" : "▸"}
                    </span>
                    {x.ch}
                    {x.hub && (
                      <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>
                        Pólo
                      </span>
                    )}
                  </span>
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <span className="badge badge-green" style={{ fontSize: 10 }}>
                      {x.confirmed}✓
                    </span>
                    {x.pending > 0 && (
                      <span className="badge badge-yellow" style={{ fontSize: 10 }}>
                        {x.pending}
                      </span>
                    )}
                    <span className="badge badge-blue" style={{ fontSize: 10 }}>
                      {x.total}
                    </span>
                  </div>
                </div>
                {isOpen &&
                  x.cats.map((cat) => (
                    <div
                      key={cat.c}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "5px 16px 5px 30px",
                        borderBottom: "1px solid var(--border)",
                        background: "var(--bg2)",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: "var(--muted)" }}>{cat.c}</span>
                      <span className="badge badge-blue" style={{ fontSize: 10 }}>
                        {cat.n}
                      </span>
                    </div>
                  ))}
              </Fragment>
            );
          })}
        </div>

        {/* Por Categoria */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "11px 16px",
              fontWeight: 700,
              fontSize: 14,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Por Categoria
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}>
              <tr>
                <th style={thS}>Categoria</th>
                <th style={{ ...thS, textAlign: "right" }}>Total</th>
                <th style={{ ...thS, textAlign: "right" }}>Conf.</th>
                <th style={{ ...thS, textAlign: "right" }}>Pend.</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => {
                const rows = er.filter((r) => r.category === c);
                if (!rows.length) return null;
                return (
                  <tr key={c}>
                    <td style={tdS}>{c}</td>
                    <td style={{ ...tdS, textAlign: "right", fontWeight: 600 }}>{rows.length}</td>
                    <td style={{ ...tdS, textAlign: "right", color: "#2d8a4e", fontWeight: 600 }}>
                      {conf(rows)}
                    </td>
                    <td
                      style={{
                        ...tdS,
                        textAlign: "right",
                        color: pend(rows) > 0 ? "#d4820a" : "var(--muted)",
                      }}
                    >
                      {pend(rows)}
                    </td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 700, background: "var(--bg2)" }}>
                <td style={tdS}>Total</td>
                <td style={{ ...tdS, textAlign: "right" }}>{er.length}</td>
                <td style={{ ...tdS, textAlign: "right", color: "#2d8a4e" }}>{confirmed}</td>
                <td style={{ ...tdS, textAlign: "right", color: "#d4820a" }}>{pending}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Polo × Fora do Polo ────────────────────────────────────────── */}
      {hasHubData && (
        <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
          <div
            style={{
              padding: "11px 16px",
              fontWeight: 700,
              fontSize: 14,
              borderBottom: "1px solid var(--border)",
            }}
          >
            Pólo × Fora do Pólo
          </div>
          {hubData.map((h) => {
            const isOpen = !!expandedHub[h.label];
            return (
              <Fragment key={h.label}>
                <div
                  onClick={() => toggleHub(h.label)}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    <span style={{ display: "inline-block", width: 14, color: "#9ca3af" }}>
                      {isOpen ? "▾" : "▸"}
                    </span>
                    {h.label}
                  </span>
                  <div style={{ display: "flex", gap: 5 }}>
                    <span className="badge badge-green">{h.confirmed}✓</span>
                    {h.pending > 0 && (
                      <span className="badge badge-yellow">{h.pending}</span>
                    )}
                    <span className="badge badge-blue">{h.rows.length}</span>
                  </div>
                </div>
                {isOpen &&
                  h.churches.map((c) => (
                    <div
                      key={c.ch}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 16px 6px 30px",
                        borderBottom: "1px solid var(--border)",
                        background: "var(--bg2)",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ color: "var(--muted)" }}>{c.ch}</span>
                      <div style={{ display: "flex", gap: 4 }}>
                        <span className="badge badge-green" style={{ fontSize: 10 }}>
                          {c.confirmed}✓
                        </span>
                        {c.pending > 0 && (
                          <span className="badge badge-yellow" style={{ fontSize: 10 }}>
                            {c.pending}
                          </span>
                        )}
                        <span className="badge badge-blue" style={{ fontSize: 10 }}>
                          {c.total}
                        </span>
                      </div>
                    </div>
                  ))}
              </Fragment>
            );
          })}
        </div>
      )}

      {/* ── Waitlist summary ───────────────────────────────────────────── */}
      {wl.length > 0 && (
        <div className="card" style={{ padding: "12px 16px", borderLeft: "4px solid #92400e" }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>
            Lista de Espera ({wl.length})
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
            <span style={{ color: "#2d8a4e", fontWeight: 600 }}>
              {wl.filter((r) => r.paid || r.exempt).length}{" "}
              <span style={{ fontWeight: 400, color: "var(--muted)" }}>confirmados</span>
            </span>
            <span style={{ color: "#d4820a", fontWeight: 600 }}>
              {wl.filter((r) => !r.paid && !r.exempt).length}{" "}
              <span style={{ fontWeight: 400, color: "var(--muted)" }}>pendentes</span>
            </span>
            {CATEGORIES.filter((c) => wl.some((r) => r.category === c)).map((c) => (
              <span key={c} style={{ color: "var(--muted)" }}>
                <strong style={{ color: "var(--text)" }}>{wl.filter((r) => r.category === c).length}</strong>{" "}
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function pastorNoteLabel(professores, outros) {
  if (professores === 0 && outros === 0) return "";
  if (professores === 0) return `${outros} não-professores`;
  if (outros === 0) return `${professores} professores`;
  return `${outros} não-professores · ${professores} professores`;
}

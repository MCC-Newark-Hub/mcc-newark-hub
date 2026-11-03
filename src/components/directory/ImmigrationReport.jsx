import { useState } from "react";
import { useAppDataContext } from "@/context/AppDataContext";

// Diretório › Relatórios (admins): immigration status of the directory members, overall,
// by church and by assistance group. Personal data from the directory, not about an
// event, so it lives here and not in Eventos › Relatórios.
export default function ImmigrationReport() {
  const { members, gas, dbImmigrationStatuses } = useAppDataContext() || {};
  const [immChurch, setImmChurch] = useState("");
  const [immGa, setImmGa] = useState("");
  const [immDim, setImmDim] = useState("overview"); // "overview" | "church" | "ga"
  const STATUSES =
    dbImmigrationStatuses && dbImmigrationStatuses.length > 0
      ? dbImmigrationStatuses.map((s) => s.name)
      : ["Cidadão", "Residente Permanente", "Com Visto", "Em Processo", "Sem Visto"];
  const mems = members || [];

  const immChurches = [...new Set(mems.map((m) => m.church).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt")
  );
  const immGas = (gas || [])
    .filter((g) => mems.some((m) => m.gaId === g.id))
    .sort((a, b) => a.name.localeCompare(b.name, "pt"));

  const filteredMems = mems.filter(
    (m) => (!immChurch || m.church === immChurch) && (!immGa || m.gaId === immGa)
  );
  const filtTotal = filteredMems.length;
  const filtPct = (n) => (filtTotal > 0 ? Math.round((n / filtTotal) * 100) : 0);

  const statusRows = STATUSES.map((s) => ({
    label: s,
    count: filteredMems.filter((m) => m.immigrationStatus === s).length,
  }));
  const notInformed = filteredMems.filter((m) => !m.immigrationStatus).length;

  const churchBreakdown = immChurches
    .map((c) => {
      const cms = mems.filter((m) => m.church === c && (!immGa || m.gaId === immGa));
      return {
        church: c,
        total: cms.length,
        rows: STATUSES.map((s) => ({
          label: s,
          count: cms.filter((m) => m.immigrationStatus === s).length,
        })),
        notInformed: cms.filter((m) => !m.immigrationStatus).length,
      };
    })
    .filter((c) => c.total > 0);

  const gaBreakdown = immGas
    .map((g) => {
      const gms = mems.filter((m) => m.gaId === g.id && (!immChurch || m.church === immChurch));
      return {
        name: g.name,
        church: g.church,
        total: gms.length,
        rows: STATUSES.map((s) => ({
          label: s,
          count: gms.filter((m) => m.immigrationStatus === s).length,
        })),
        notInformed: gms.filter((m) => !m.immigrationStatus).length,
      };
    })
    .filter((g) => g.total > 0);

  const tdS = { padding: "6px 10px", borderBottom: "1px solid var(--border)", fontSize: 13 };
  const thS = {
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: ".4px",
    textAlign: "left",
    borderBottom: "1px solid var(--border)",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select value={immChurch} onChange={(e) => setImmChurch(e.target.value)}>
          <option value="">Todas as igrejas</option>
          {immChurches.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={immGa} onChange={(e) => setImmGa(e.target.value)}>
          <option value="">Todos os grupos</option>
          {immGas.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            ["Visão geral", "overview"],
            ["Por Igreja", "church"],
            ["Por Grupo", "ga"],
          ].map(([l, d]) => (
            <button
              key={d}
              className={`tab ${immDim === d ? "active" : ""}`}
              onClick={() => setImmDim(d)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Overview */}
      {immDim === "overview" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 14px",
              background: "var(--bg2)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span style={{ fontWeight: 700, fontSize: 14 }}>Situação Imigratória</span>
            <span className="badge badge-blue">{filtTotal} membros</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Status</th>
                <th style={{ ...thS, textAlign: "right" }}>N</th>
                <th style={{ ...thS, textAlign: "right" }}>%</th>
                <th style={{ ...thS }}>Barra</th>
              </tr>
            </thead>
            <tbody>
              {statusRows.map(({ label, count }) => (
                <tr key={label}>
                  <td style={tdS}>{label}</td>
                  <td style={{ ...tdS, textAlign: "right", fontWeight: 600 }}>{count}</td>
                  <td style={{ ...tdS, textAlign: "right", color: "var(--muted)" }}>
                    {filtPct(count)}%
                  </td>
                  <td style={{ ...tdS }}>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: "var(--border)",
                        overflow: "hidden",
                        minWidth: 80,
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${filtPct(count)}%`,
                          background: "var(--icm-crimson)",
                          borderRadius: 4,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--bg2)" }}>
                <td style={{ ...tdS, color: "var(--muted)", fontStyle: "italic" }}>
                  Não informado
                </td>
                <td style={{ ...tdS, textAlign: "right", fontWeight: 600 }}>{notInformed}</td>
                <td style={{ ...tdS, textAlign: "right", color: "var(--muted)" }}>
                  {filtPct(notInformed)}%
                </td>
                <td style={{ ...tdS }}>
                  <div
                    style={{
                      height: 8,
                      borderRadius: 4,
                      background: "var(--border)",
                      overflow: "hidden",
                      minWidth: 80,
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${filtPct(notInformed)}%`,
                        background: "#d1d5db",
                        borderRadius: 4,
                      }}
                    />
                  </div>
                </td>
              </tr>
              <tr style={{ fontWeight: 700, background: "#f3f4f6" }}>
                <td style={tdS}>Total</td>
                <td style={{ ...tdS, textAlign: "right" }}>{filtTotal}</td>
                <td style={{ ...tdS, textAlign: "right" }}>100%</td>
                <td style={tdS} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* By church */}
      {immDim === "church" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {churchBreakdown.map((c) => (
            <div key={c.church} className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "8px 14px",
                  background: "var(--bg2)",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 13 }}>{c.church}</span>
                <span className="badge badge-blue">{c.total}</span>
              </div>
              <div style={{ padding: "6px 14px 8px", display: "flex", flexWrap: "wrap", gap: 10 }}>
                {c.rows
                  .filter((r) => r.count > 0)
                  .map((r) => (
                    <span key={r.label} style={{ fontSize: 12 }}>
                      <span style={{ color: "var(--muted)" }}>{r.label}: </span>
                      <strong>{r.count}</strong>
                      <span style={{ color: "var(--muted)" }}>
                        {" "}
                        ({Math.round((r.count / c.total) * 100)}%)
                      </span>
                    </span>
                  ))}
                {c.notInformed > 0 && (
                  <span style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>
                    Não informado: <strong style={{ color: "var(--text)" }}>{c.notInformed}</strong>{" "}
                    ({Math.round((c.notInformed / c.total) * 100)}%)
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* By GA */}
      {immDim === "ga" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS}>Grupo</th>
                <th style={thS}>Igreja</th>
                {STATUSES.map((s) => (
                  <th key={s} style={{ ...thS, textAlign: "right" }}>
                    {s}
                  </th>
                ))}
                <th style={{ ...thS, textAlign: "right", fontStyle: "italic" }}>N/I</th>
                <th style={{ ...thS, textAlign: "right" }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {gaBreakdown.map((g) => (
                <tr key={g.name}>
                  <td style={{ ...tdS, fontWeight: 600 }}>{g.name}</td>
                  <td style={{ ...tdS, fontSize: 12, color: "var(--muted)" }}>{g.church}</td>
                  {g.rows.map((r) => (
                    <td key={r.label} style={{ ...tdS, textAlign: "right" }}>
                      {r.count > 0 ? r.count : <span style={{ color: "var(--border)" }}>—</span>}
                    </td>
                  ))}
                  <td
                    style={{
                      ...tdS,
                      textAlign: "right",
                      color: "var(--muted)",
                      fontStyle: "italic",
                    }}
                  >
                    {g.notInformed > 0 ? (
                      g.notInformed
                    ) : (
                      <span style={{ color: "var(--border)" }}>—</span>
                    )}
                  </td>
                  <td style={{ ...tdS, textAlign: "right", fontWeight: 600 }}>{g.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

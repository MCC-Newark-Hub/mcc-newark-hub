import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import ICMLogo from "@/components/ICMLogo";
import { sb } from "@/lib/supabase";

const SERVICE_ORDER = ["Único", "Manhã", "Tarde", "Noite"];

export default function SetlistPublicView() {
  const { date } = useParams();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeLabel, setActiveLabel] = useState(null);

  useEffect(() => {
    if (!date) return;
    sb.from("setlist_entries")
      .select("*")
      .eq("service_date", date)
      .order("service_label")
      .order("position")
      .then(({ data }) => {
        setEntries(data || []);
        if (data && data.length > 0) setActiveLabel(data[0].service_label);
        setLoading(false);
      });
  }, [date]);

  const labels = [...new Set(entries.map((e) => e.service_label))].sort(
    (a, b) => SERVICE_ORDER.indexOf(a) - SERVICE_ORDER.indexOf(b)
  );

  const current = entries.filter((e) => e.service_label === activeLabel);

  const formatDate = (d) => {
    if (!d) return "";
    return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: "40px 20px",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: "32px 28px",
        width: "100%", maxWidth: 500,
        boxShadow: "0 24px 64px rgba(3,34,63,.4)",
      }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <ICMLogo height={38} style={{ marginBottom: 16 }} />
          <h1 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 20, fontWeight: 700, color: "#03223f", marginBottom: 4 }}>
            Lista de Louvor
          </h1>
          <p style={{ color: "#6b7280", fontSize: 14, textTransform: "capitalize" }}>{formatDate(date)}</p>
        </div>

        {loading ? (
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14 }}>Carregando…</p>
        ) : entries.length === 0 ? (
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, padding: "40px 0" }}>
            Nenhum louvor cadastrado para este dia.
          </p>
        ) : (
          <>
            {/* Service tab selector — only shown if more than one service */}
            {labels.length > 1 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 20, justifyContent: "center" }}>
                {labels.map((l) => (
                  <button
                    key={l}
                    onClick={() => setActiveLabel(l)}
                    style={{
                      padding: "6px 16px", borderRadius: 99, fontSize: 13, fontWeight: activeLabel === l ? 700 : 500,
                      cursor: "pointer", fontFamily: "'Montserrat',sans-serif",
                      background: activeLabel === l ? "#8B0000" : "#f3f4f6",
                      color: activeLabel === l ? "#fff" : "#6b7280",
                      border: "none",
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}

            {/* Song table */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", width: 28 }}>#</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", width: 90 }}>Nº</th>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontSize: 11, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase" }}>Título</th>
                </tr>
              </thead>
              <tbody>
                {current.map((e, idx) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "12px 8px", fontSize: 14, fontWeight: 700, color: "#9ca3af" }}>{idx + 1}</td>
                    <td style={{ padding: "12px 8px", fontSize: 14, fontWeight: 600, color: "#374151" }}>{e.song_number}</td>
                    <td style={{ padding: "12px 8px", fontSize: 15, color: "#111827", fontWeight: 500 }}>{e.song_title}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

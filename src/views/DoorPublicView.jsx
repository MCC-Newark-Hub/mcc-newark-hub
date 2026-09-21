import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ICMLogo from "@/components/ICMLogo";
import DoorCalendar from "@/components/DoorCalendar";
import { STRINGS } from "@/i18n/strings";
import { monthKey, isMonthKey, shiftMonth } from "@/lib/doorSchedule";
import { fetchMonth, DOOR_PUBLIC_PATH } from "@/lib/doorData";

// /portaria/<YYYY-MM>: read-only month calendar of the door schedule, open only once published.
export default function DoorPublicView({ lang = "pt", setLang }) {
  const { month: param } = useParams();
  const navigate = useNavigate();
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const month = isMonthKey(param) ? param : monthKey();
  const [state, setState] = useState({ month: null, status: "loading", rows: [] });

  useEffect(() => {
    let cancelled = false;
    fetchMonth(month).then(({ info, rows, error }) => {
      if (cancelled) return;
      setState({ month, rows, status: error ? "error" : info?.published_at ? "ready" : "unpublished" });
    });
    return () => { cancelled = true; };
  }, [month]);

  const go = (delta) => navigate(`${DOOR_PUBLIC_PATH}/${shiftMonth(month, delta)}`);
  const title = new Date(`${month}-01T12:00:00`).toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", { month: "long", year: "numeric" });
  const status = state.month === month ? state.status : "loading";
  const message = { loading: "…", error: tt.doorLoadFailed, unpublished: tt.doorNotPublished }[status];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)", display: "flex", justifyContent: "center", padding: "32px 16px" }}>
      <div style={{ background: "var(--card)", color: "var(--text)", borderRadius: 20, padding: "28px 20px", width: "100%", maxWidth: 1000, alignSelf: "flex-start", boxShadow: "0 24px 64px rgba(3,34,63,.4)" }}>
        <div style={{ textAlign: "center", marginBottom: 20, position: "relative" }}>
          {setLang && (
            <button onClick={() => setLang(lang === "en" ? "pt" : "en")} className="lang-btn" style={{ position: "absolute", right: 0, top: 0 }}>
              {lang === "en" ? "PT" : "EN"}
            </button>
          )}
          <ICMLogo height={64} />
          <p style={{ marginTop: 8, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em" }}>IGREJA CRISTÃ MARANATA</p>
          <h1 style={{ margin: "6px 0 0", fontFamily: "'Lora',Georgia,serif", fontSize: 24 }}>{tt.doorPublicTitle}</h1>
        </div>

        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => go(-1)} aria-label={tt.doorPrev}><ChevronLeft size={16} /></button>
          <strong style={{ minWidth: 170, textAlign: "center", textTransform: "capitalize", fontSize: 18 }}>{title}</strong>
          <button className="btn btn-ghost btn-sm" onClick={() => go(1)} aria-label={tt.doorNext}><ChevronRight size={16} /></button>
        </div>

        {message ? (
          <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 14, padding: "32px 0" }}>{message}</p>
        ) : (
          <DoorCalendar month={month} rows={state.rows} lang={lang} />
        )}
      </div>
    </div>
  );
}

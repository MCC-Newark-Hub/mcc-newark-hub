import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Maximize } from "lucide-react";
import ICMLogo from "@/components/ICMLogo";
import { STRINGS, fill } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { canManagePanel, profileOf, cityOf } from "@/lib/trumpets";
import { fetchStats, getEdition } from "@/lib/trumpetsApi";
import ReasonsMarkdown from "@/components/ReasonsMarkdown";

const POLL_MS = 20000;

// Same look as /events/painel (ps-* classes copied, tf- prefix), sized for a projector.
const CSS = `
.tp-page{min-height:100vh;box-sizing:border-box;background:linear-gradient(160deg,var(--icm-crimson-deep) 0%,var(--icm-crimson) 50%,var(--icm-navy-deep) 100%);padding:clamp(8px,min(2vw,1.6vh),32px) 16px;display:flex;justify-content:center}
.tp-card{background:var(--card);color:var(--text);border-radius:20px;width:100%;max-width:1800px;padding:clamp(16px,min(2vw,3vh),40px);box-shadow:var(--shadow-lg);display:flex;flex-direction:column;gap:clamp(10px,min(1.4vw,2.2vh),28px)}
.tp-head{display:flex;align-items:center;gap:clamp(10px,1.4vw,24px);flex-wrap:wrap}
.tp-head h1{font-family:'Lora',Georgia,serif;font-size:clamp(22px,2.6vw,48px);margin:0;line-height:1.1}
.tp-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:clamp(14px,2vw,36px)}
.tp-panel{background:var(--bg);border-radius:16px;padding:clamp(12px,min(1.6vw,2.4vh),28px)}
.tp-panel h2{font-size:clamp(14px,1.3vw,24px);margin:0 0 clamp(8px,1vw,16px);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.tp-big{font-family:'Montserrat',sans-serif;font-weight:800;font-size:clamp(44px,min(7vw,10vh),140px);line-height:1}
.tp-track{height:clamp(20px,min(3vw,5vh),56px);border-radius:999px;background:var(--border);overflow:hidden;margin-top:clamp(10px,1.2vw,22px)}
.tp-fill{height:100%;width:100%;border-radius:999px;background:var(--primary);transform-origin:left center;transition:transform .9s cubic-bezier(.2,.8,.2,1)}
.tp-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(8px,1vw,18px);margin-top:clamp(10px,min(1.4vw,2vh),26px)}
.tp-tile{background:var(--card);border-radius:14px;padding:clamp(10px,1.2vw,22px);text-align:center}
.tp-tile b{display:block;font-family:'Montserrat',sans-serif;font-weight:800;font-size:clamp(28px,min(3.6vw,6.4vh),72px);line-height:1.05}
.tp-tile span{font-size:clamp(11px,1vw,18px);color:var(--muted);font-weight:600}
.tp-tile small{display:block;font-weight:700;font-size:clamp(11px,1vw,18px);margin-top:4px}
.tp-rows{display:flex;flex-direction:column;gap:clamp(6px,.7vw,12px)}
.tp-row{display:grid;grid-template-columns:minmax(0,9em) minmax(0,1fr) auto;align-items:center;gap:10px;font-size:clamp(13px,1.2vw,22px)}
.tp-row .tp-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.tp-row .tp-bar{height:clamp(10px,1.1vw,20px);border-radius:999px;background:var(--border);overflow:hidden}
.tp-row .tp-bar i{display:block;height:100%;width:100%;background:var(--primary);transform-origin:left center;transition:transform .9s cubic-bezier(.2,.8,.2,1)}
.tp-row .tp-n{font-family:'Montserrat',sans-serif;font-weight:800;text-align:right}
.tp-row .tp-n small{color:var(--muted);font-weight:700;font-size:.8em;margin-left:.3em}
.tp-side{display:flex;flex-direction:column;gap:clamp(14px,2vw,36px)}
.tp-days{display:flex;align-items:flex-end;gap:2px;height:clamp(80px,14vh,200px)}
.tp-days i{flex:1;background:var(--primary);border-radius:3px 3px 0 0;min-height:2px}
.tp-up{color:var(--ok)}.tp-down{color:var(--danger)}
@media (max-width:900px){.tp-grid{grid-template-columns:1fr}}
@media (prefers-reduced-motion:reduce){.tp-fill,.tp-row .tp-bar i{transition:none}}
`;

function Rows({ items }) {
  const max = items.reduce((m, it) => Math.max(m, it.count), 0);
  return (
    <div className="tp-rows">
      {items.map((it) => (
        <div className="tp-row" key={it.key}>
          <span className="tp-name" title={it.label}>{it.label}</span>
          <span className="tp-bar"><i style={{ transform: `scaleX(${max ? it.count / max : 0})` }} /></span>
          <span className="tp-n">{it.count}{it.extra && <small>{it.extra}</small>}</span>
        </div>
      ))}
    </div>
  );
}

// "+20 (+20%)" / "−10 (−25%)"; no previous year → "".
function yoy(now, before) {
  if (!before) return "";
  const d = now - before;
  const sign = d > 0 ? "+" : d < 0 ? "−" : "";
  const pct = Math.round((Math.abs(d) / before) * 100);
  return `${sign}${Math.abs(d)} (${sign}${pct}%)`;
}

// /assistance/trombetas/painel/:year? — Trombetas e Festas numbers for the big screen. Pastor / admin
// only: it shows members' names (who invited the most). Refreshed every 20s from /api/trumpet-guests.
export default function TrumpetsPanelView({ lang = "pt" }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"].tf;
  const tp = tt.panel;
  const { year: param } = useParams();
  const year = /^\d{4}$/.test(param || "") ? Number(param) : new Date().getFullYear();
  const { user } = useAppDataContext() || {};
  const allowed = canManagePanel(profileOf(user).roles);
  const [state, setState] = useState({ status: "loading", data: null });
  const [reasons, setReasons] = useState("");

  useEffect(() => {
    if (!allowed) return;
    getEdition(year).then((e) => setReasons((lang === "en" && e.reasonsEn) || e.reasons || "")).catch(() => {});
  }, [allowed, year, lang]);

  useEffect(() => {
    if (!allowed) return;
    let off = false;
    const run = () => fetchStats(year)
      .then((data) => !off && setState({ status: "ready", data }))
      .catch((e) => { console.error("trumpets stats:", e); if (!off) setState((s) => ({ status: s.data ? "stale" : "error", data: s.data })); });
    run();
    const t = setInterval(run, POLL_MS);
    return () => { off = true; clearInterval(t); };
  }, [allowed, year]);

  if (!allowed) return <div style={{ padding: 48, textAlign: "center", color: "var(--muted)" }}>{tp.noAccess}</div>;

  const d = state.data;
  const goalPct = d?.goal ? Math.min(1, d.invited / d.goal) : 0;
  const delta = (now, before) => (now >= before ? "tp-up" : "tp-down");
  const maxDay = d ? d.perDay.reduce((m, x) => Math.max(m, x.count), 0) : 0;
  const fmtDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", { day: "2-digit", month: "2-digit" });

  return (
    <div className="tp-page">
      <style>{CSS}</style>
      <div className="tp-card">
        <div className="tp-head">
          <ICMLogo height={48} />
          <h1>{fill(tp.title, { year })}</h1>
          <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => document.documentElement.requestFullscreen?.()} aria-label={tp.fullscreen}>
            <Maximize size={18} />
          </button>
        </div>

        {reasons.trim() && (
          <div className="tp-panel">
            <h2>{tt.reasons}</h2>
            <ReasonsMarkdown reasons={reasons.split("\n")} color="var(--text)" headingColor="var(--text)" fontSize={18} />
          </div>
        )}

        {state.status === "error" && <div role="alert" style={{ color: "var(--danger)", fontWeight: 700 }}>{tp.error}</div>}

        {d && (
          <div className="tp-grid">
            <div className="tp-side">
              <div className="tp-panel">
                <h2>{tt.invited}</h2>
                <div className="tp-big" data-testid="tf-invited">{d.invited}</div>
                <div style={{ fontWeight: 700, marginTop: 6 }}>{d.goal ? fill(tp.goal, { goal: d.goal }) : tp.noGoal}</div>
                {d.goal && <div className="tp-track"><div className="tp-fill" style={{ transform: `scaleX(${goalPct})` }} /></div>}
                <div className="tp-tiles">
                  <div className="tp-tile">
                    <b>{d.attended}</b><span>{tt.present}</span>
                  </div>
                  <div className="tp-tile">
                    <b>{d.pct}%</b><span>{tt.rate}</span>
                  </div>
                  <div className="tp-tile">
                    <span>{fill(tp.vsLast, { year: year - 1 })}</span>
                    <small className={delta(d.invited, d.prev.invited)} data-testid="tf-yoy-invited">{yoy(d.invited, d.prev.invited)}</small>
                    <small className={delta(d.attended, d.prev.attended)} data-testid="tf-yoy-attended">{yoy(d.attended, d.prev.attended)}</small>
                  </div>
                </div>
              </div>
              <div className="tp-panel">
                <h2>{tp.perDay}</h2>
                <div className="tp-days">
                  {d.perDay.map((x) => (
                    <i key={x.date} data-testid="tf-day" title={`${fmtDay(x.date)}: ${x.count}`} style={{ height: `${maxDay ? (x.count / maxDay) * 100 : 0}%` }} />
                  ))}
                </div>
              </div>
              <div className="tp-panel">
                <h2>{tp.byChurch}</h2>
                <Rows items={d.byChurch.map((c) => ({ key: c.church, label: cityOf(c.church), count: c.invited, extra: `${c.attended}${c.goal ? ` / ${c.goal}` : ""}` }))} />
              </div>
            </div>
            <div className="tp-side">
              <div className="tp-panel">
                <h2>{tp.topGas}</h2>
                <Rows items={d.topGas.map((g) => ({ key: g.gaId, label: g.name, count: g.invited, extra: String(g.attended) }))} />
              </div>
              <div className="tp-panel">
                <h2>{tp.topInviters}</h2>
                <Rows items={d.topInviters.map((m) => ({ key: m.memberId, label: m.name, count: m.invited, extra: String(m.attended) }))} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

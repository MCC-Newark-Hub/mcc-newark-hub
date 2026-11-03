import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import QRCode from "qrcode";
import { Maximize } from "lucide-react";
import ICMLogo from "@/components/ICMLogo";
import { STRINGS, fill } from "@/i18n/strings";
import { fetchPublicStats, summarizeStats, shortChurch } from "@/lib/publicStats";
import { todayLocal } from "@/lib/prayerSlots";

const POLL_MS = 20000;
const REGISTER_PATH = "/events/register";
const STAGE_COLOR = { open: "var(--ok)", filling: "var(--warn)", almost: "var(--danger)", full: "var(--danger)" };

// Sized for a projector across the room, still usable on a phone.
const CSS = `
.ps-page{min-height:100vh;box-sizing:border-box;background:linear-gradient(160deg,var(--icm-crimson-deep) 0%,var(--icm-crimson) 50%,var(--icm-navy-deep) 100%);padding:clamp(8px,min(2vw,1.6vh),32px) 16px;display:flex;justify-content:center}
.ps-card{background:var(--card);color:var(--text);border-radius:20px;width:100%;max-width:1800px;padding:clamp(16px,min(2vw,3vh),40px);box-shadow:var(--shadow-lg);display:flex;flex-direction:column;gap:clamp(10px,min(1.4vw,2.2vh),28px)}
.ps-head{display:flex;align-items:center;gap:clamp(10px,1.4vw,24px);flex-wrap:wrap}
.ps-head h1{font-family:'Lora',Georgia,serif;font-size:clamp(22px,2.6vw,48px);margin:0;line-height:1.1}
.ps-sub{color:var(--muted);font-size:clamp(13px,1.2vw,22px);margin-top:4px}
.ps-tools{margin-left:auto;display:flex;gap:8px}
.ps-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:clamp(14px,2vw,36px)}
.ps-panel{background:var(--bg);border-radius:16px;padding:clamp(12px,min(1.6vw,2.4vh),28px)}
.ps-panel h2{font-size:clamp(14px,1.3vw,24px);margin:0 0 clamp(8px,1vw,16px);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.ps-big{font-family:'Montserrat',sans-serif;font-weight:800;font-size:clamp(44px,min(7vw,10vh),140px);line-height:1}
.ps-big small{font-size:.32em;font-weight:700;color:var(--muted);margin-left:.3em}
.ps-msg{font-weight:800;font-size:clamp(18px,min(2vw,3.6vh),38px);margin-top:clamp(4px,.6vw,12px)}
.ps-track{height:clamp(20px,min(3vw,5vh),56px);border-radius:999px;background:var(--border);overflow:hidden;margin-top:clamp(10px,1.2vw,22px)}
.ps-fill{height:100%;width:100%;border-radius:999px;transform-origin:left center;transition:transform .9s cubic-bezier(.2,.8,.2,1)}
.ps-tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(8px,1vw,18px);margin-top:clamp(10px,min(1.4vw,2vh),26px)}
.ps-tile{background:var(--card);border-radius:14px;padding:clamp(10px,1.2vw,22px);text-align:center}
.ps-tile b{display:block;font-family:'Montserrat',sans-serif;font-weight:800;font-size:clamp(28px,min(3.6vw,6.4vh),72px);line-height:1.05}
.ps-tile span{font-size:clamp(11px,1vw,18px);color:var(--muted);font-weight:600}
.ps-deadline{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:clamp(10px,min(1.4vw,2vh),26px);flex-wrap:wrap}
.ps-deadline strong{font-size:clamp(16px,min(1.8vw,3.4vh),36px)}
.ps-qr{display:flex;align-items:center;gap:12px}
.ps-qr img{width:clamp(72px,min(8vw,12vh),180px);height:auto;border-radius:8px;background:#fff;padding:4px}
.ps-qr div{font-weight:800;font-size:clamp(14px,1.4vw,26px)}
.ps-qr small{display:block;font-weight:600;color:var(--muted);font-size:clamp(11px,.9vw,16px)}
.ps-rows{display:flex;flex-direction:column;gap:clamp(6px,.7vw,12px)}
.ps-row{display:grid;grid-template-columns:minmax(0,9em) minmax(0,1fr) auto;align-items:center;gap:10px;font-size:clamp(13px,1.2vw,22px)}
.ps-row .ps-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.ps-row .ps-bar{height:clamp(10px,1.1vw,20px);border-radius:999px;background:var(--border);overflow:hidden}
.ps-row .ps-bar i{display:block;height:100%;width:100%;background:var(--primary);transform-origin:left center;transition:transform .9s cubic-bezier(.2,.8,.2,1)}
.ps-row .ps-n{font-family:'Montserrat',sans-serif;font-weight:800;min-width:2.2em;text-align:right}
.ps-row .ps-w{color:var(--danger);font-weight:700;font-size:.8em;margin-left:.4em}
.ps-side{display:flex;flex-direction:column;gap:clamp(14px,2vw,36px)}
.ps-pop{align-self:center;background:var(--primary);color:var(--tab-active-text);font-weight:800;font-size:clamp(20px,min(2.6vw,4.6vh),52px);padding:clamp(6px,min(.8vw,1.4vh),16px) clamp(20px,2.4vw,44px);border-radius:999px;box-shadow:var(--shadow-md);text-align:center;animation:ps-pop 1.6s cubic-bezier(.2,.8,.2,1) infinite}
@keyframes ps-pop{0%,100%{transform:scale(1)}12%{transform:scale(1.08) rotate(-1.5deg)}24%{transform:scale(.98) rotate(1deg)}36%{transform:scale(1.03)}50%{transform:scale(1)}}
@media (max-width:900px){.ps-grid{grid-template-columns:1fr}.ps-tiles{grid-template-columns:1fr 1fr 1fr}}
@media (prefers-reduced-motion:reduce){.ps-fill,.ps-row .ps-bar i{transition:none}.ps-pop{animation:none}}
`;

function Rows({ items, max }) {
  return (
    <div className="ps-rows">
      {items.map((it) => (
        <div className="ps-row" key={it.key}>
          <span className="ps-name" title={it.label}>{it.label}</span>
          <span className="ps-bar"><i style={{ transform: `scaleX(${max ? it.count / max : 0})` }} /></span>
          <span className="ps-n">
            {it.count}
            {it.waitlist > 0 && <span className="ps-w">+{it.waitlist}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// /events/painel: registration numbers for the big screen at church. Numbers only (no names,
// nothing about money), read from the event_public_stats RPC and refreshed every 20s.
export default function PublicStatsView({ lang = "pt", setLang }) {
  const { eventId: param } = useParams();
  const [search] = useSearchParams();
  const eventId = param || search.get("event") || null;
  const pt = lang !== "en";
  const tt = STRINGS[pt ? "pt" : "en"];
  const [state, setState] = useState({ status: "loading", data: null });
  const [qr, setQr] = useState("");
  const [isFull, setIsFull] = useState(false);
  const registerUrl = `${window.location.origin}${REGISTER_PATH}`;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { stats, error } = await fetchPublicStats(eventId);
      if (cancelled) return;
      if (error) {
        console.error("event_public_stats error:", error);
        setState((s) => ({ status: s.data ? "ready" : "error", data: s.data }));
        return;
      }
      setState({ status: stats ? "ready" : "none", data: summarizeStats(stats, todayLocal()) });
    };
    run();
    const t = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [eventId]);

  useEffect(() => {
    QRCode.toDataURL(registerUrl, { margin: 1, width: 360 }).then(setQr).catch(() => setQr(""));
  }, [registerUrl]);

  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  const d = state.data;
  const fmtDate = (v, opts) => (v ? new Date(`${String(v).slice(0, 10)}T12:00:00`).toLocaleDateString(pt ? "pt-BR" : "en-US", opts) : "");

  const message = !d ? null
    : d.full ? tt.statsFull
    : d.stage === "almost" ? tt.statsAlmost
    : d.stage === "filling" ? tt.statsFilling
    : tt.statsOpen;
  const daysText = !d || d.daysToDeadline === null ? ""
    : d.daysToDeadline === 0 ? tt.statsLastDay
    : d.daysToDeadline === 1 ? tt.statsOneDayLeft
    : fill(tt.statsDaysLeft, { n: d.daysToDeadline });

  const churchItems = (d?.churches || []).map((c) => ({ key: c.name || "_other", label: c.other ? tt.statsOtherChurches : shortChurch(c.name), count: c.count }));
  const catItems = (d?.categories || []).map((c) => ({ key: c.key || "_other", label: c.key ? tt.statsCategories[c.key] || c.key : tt.statsOtherCategory, count: c.count, waitlist: c.waitlist }));
  const maxOf = (items) => items.reduce((m, it) => Math.max(m, it.count), 0);

  return (
    <div className="ps-page">
      <style>{CSS}</style>
      <div className="ps-card">
        <div className="ps-head">
          <ICMLogo height={48} />
          <div>
            <h1>{d?.name || tt.statsTitle}</h1>
            {d && (
              <div className="ps-sub">
                {[fmtDate(d.date, { day: "2-digit", month: "long", year: "numeric" }), d.location].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
          {!isFull && (
            <div className="ps-tools">
              {document.documentElement.requestFullscreen && (
                <button className="btn btn-ghost btn-sm" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}>
                  <Maximize size={14} /> {tt.statsFullscreen}
                </button>
              )}
              {setLang && (
                <button onClick={() => setLang(pt ? "en" : "pt")} className="btn btn-ghost btn-sm">{pt ? "EN" : "PT"}</button>
              )}
            </div>
          )}
        </div>

        {d && !d.closed && <div className="ps-pop">{tt.statsPop}</div>}

        {!d ? (
          <p style={{ textAlign: "center", color: "var(--muted)", fontSize: 18, padding: "48px 0" }}>
            {state.status === "loading" ? "…" : state.status === "none" ? tt.statsNoEvent : tt.statsLoadFailed}
          </p>
        ) : (
          <div className="ps-grid">
            <div className="ps-panel">
              <div className="ps-big">
                {d.active}
                {d.capacity > 0 && <small>{fill(tt.statsOf, { n: d.capacity })}</small>}
                {!d.capacity && <small>{tt.statsRegistered}</small>}
              </div>
              <div className="ps-msg" style={{ color: d.closed ? "var(--muted)" : STAGE_COLOR[d.stage] }}>
                {d.paused ? tt.statsPaused : d.closed ? tt.statsClosed : message}
              </div>
              {d.capacity > 0 && (
                <div className="ps-track" role="progressbar" aria-valuemin={0} aria-valuemax={d.capacity} aria-valuenow={Math.min(d.active, d.capacity)}>
                  <div className="ps-fill" style={{ background: STAGE_COLOR[d.stage], transform: `scaleX(${d.pct / 100})` }} />
                </div>
              )}
              <div className="ps-tiles">
                <div className="ps-tile"><b>{d.active}</b><span>{tt.statsRegistered}</span></div>
                <div className="ps-tile"><b style={{ color: STAGE_COLOR[d.stage] }}>{d.capacity ? d.left : "—"}</b><span>{tt.statsLeftLabel}</span></div>
                <div className="ps-tile"><b style={{ color: d.waitlist ? "var(--danger)" : undefined }}>{d.waitlist}</b><span>{tt.statsWaitlistLabel}</span></div>
              </div>
              <div className="ps-deadline">
                <div>
                  {d.deadline && !d.closed && (
                    <>
                      <strong>{fill(tt.statsDeadline, { date: fmtDate(d.deadline, { day: "2-digit", month: "long" }) })}</strong>
                      <div className="ps-msg" style={{ color: d.daysToDeadline <= 7 ? "var(--danger)" : "var(--text)", marginTop: 2 }}>{daysText}</div>
                    </>
                  )}
                  {d.closed && <strong style={{ color: "var(--muted)" }}>{d.paused ? tt.statsPausedLong : tt.statsClosed}</strong>}
                </div>
                {qr && !d.closed && (
                  <div className="ps-qr">
                    <img src={qr} alt="" />
                    <div>
                      {tt.statsRegisterCta}
                      <small>{registerUrl.replace(/^https?:\/\//, "")}</small>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="ps-side">
              <div className="ps-panel">
                <h2>{tt.statsByChurch}</h2>
                <Rows items={churchItems} max={maxOf(churchItems)} />
              </div>
              <div className="ps-panel">
                <h2>
                  {tt.statsByCategory}
                  {d.waitlist > 0 && <span style={{ color: "var(--danger)", textTransform: "none", letterSpacing: 0, marginLeft: 8 }}>(+ {tt.statsWaitShort})</span>}
                </h2>
                <Rows items={catItems} max={maxOf(catItems)} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

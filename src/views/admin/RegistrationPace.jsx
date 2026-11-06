import { useEffect, useMemo, useRef, useState } from "react";
import { sb } from "@/lib/supabase";
import { useLang, useT } from "@/i18n/strings";
import { hourlyBuckets, paceMarks, paceTimeline, pauseSpans, peakHours, phaseStats } from "@/lib/regPace";

// Registration pace for the selected event: running total, registrations per hour with the
// busiest hours named, and the speed of each phase between openings and pauses.
// Registrations come from `regs` (live); pauses and reopenings from the audit log.

const HOUR = 36e5;
const TZ = "America/New_York";
const FONT = { fontSize: 11, fill: "var(--muted)" };

// Rounded ticks from 0 to at least `max`.
function niceTicks(max, count = 4) {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  for (let v = 0; v < max + step; v += step) ticks.push(v);
  return ticks;
}

// Portuguese writes a clock hour as "20h"; English already says "8 PM".
const withH = (f, lang) => (lang === "en" ? f : { format: (t) => `${f.format(t)}h` });

// Rough width of a label at 11px, for margins and keeping labels apart.
const textW = (s) => String(s).length * 6.4;

function useWidth() {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div className="pace-tip" style={{ left: tip.left, top: tip.top }} role="status">
      <div style={{ color: "var(--muted)" }}>{tip.when}</div>
      {tip.lines.map((l) => <div key={l}>{l}</div>)}
    </div>
  );
}

// Ticks at each New York midnight (thinned to fit); under two days, evenly spaced clock hours.
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
function xTicks(t0, t1, plotW, fmtDay, fmtHour) {
  const room = Math.max(2, Math.floor(plotW / 70));
  if (t1 - t0 < 2 * 24 * HOUR) {
    return Array.from({ length: room + 1 }, (_, i) => t0 + ((t1 - t0) * i) / room).map((t) => ({ t, label: fmtHour.format(t) }));
  }
  const days = [];
  let prev = dayKey.format(t0);
  for (let t = Math.ceil(t0 / HOUR) * HOUR; t <= t1; t += HOUR) {
    const k = dayKey.format(t);
    if (k !== prev) { days.push(t); prev = k; }
  }
  const every = Math.ceil(days.length / room) || 1;
  return days.filter((_, i) => i % every === 0).map((t) => ({ t, label: fmtDay.format(t) }));
}

function TotalChart({ timeline, marks, spans, capacity, now, fmt, tt }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const H = 300;
  const last = timeline[timeline.length - 1];
  let pub = 0;
  const pts = timeline.map((p) => ({ ...p, pub: p.viaPublic ? ++pub : pub }));
  const yTicks = niceTicks(Math.max(capacity || 0, last.total));
  const yMax = yTicks[yTicks.length - 1];
  const ends = [
    { key: "all", text: `${tt.paceAll} ${fmt.n.format(last.total)}`, v: last.total, color: "var(--chart-1)" },
    { key: "pub", text: `${tt.pacePublic} ${fmt.n.format(pub)}`, v: pub, color: "var(--chart-2)" },
  ];
  if (capacity) ends.push({ key: "cap", text: `${tt.paceCapacity} ${fmt.n.format(capacity)}`, v: capacity, color: "var(--muted)" });
  const narrow = W < 480;
  const m = { top: 34, right: narrow ? 8 : Math.max(...ends.map((e) => textW(e.text))) + 12, bottom: 24, left: textW(fmt.n.format(yMax)) + 10 };
  const t0 = pts[0].t;
  const t1 = Math.max(now, last.t + 60e3);
  const x = (t) => m.left + ((t - t0) / (t1 - t0)) * (W - m.left - m.right);
  const y = (v) => H - m.bottom - (v / yMax) * (H - m.top - m.bottom);

  const step = (key) => {
    let d = `M${x(pts[0].t)},${y(0)}`;
    for (const p of pts) d += `H${x(p.t)}V${y(p[key])}`;
    return d + `H${x(t1)}`;
  };

  // Phase markers; labels drop to a second row when close to the previous one.
  const rows = [];
  for (let i = 0; i < marks.length; i++) {
    const close = i > 0 && x(marks[i].t) - x(marks[i - 1].t) < 70;
    rows.push(close ? 1 - rows[i - 1] : 0);
  }
  const markerEls = marks.map((mk, i) => {
    const mx = x(mk.t);
    const row = rows[i];
    const label = tt[`paceMark_${mk.kind}`];
    const anchorEnd = mx + textW(label) > W - 4;
    return (
      <g key={`${mk.kind}-${mk.t}`}>
        <line x1={mx} x2={mx} y1={m.top - 4} y2={H - m.bottom} stroke="var(--muted)" strokeWidth="1" strokeDasharray="2 3" />
        <text x={anchorEnd ? mx - 4 : mx + 4} y={12 + row * 13} textAnchor={anchorEnd ? "end" : "start"} {...FONT}>{label}</text>
      </g>
    );
  });

  // End labels, nudged apart.
  const placed = ends.map((e) => ({ ...e, y: y(e.v) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < placed.length; i++) if (placed[i].y - placed[i - 1].y < 14) placed[i].y = placed[i - 1].y + 14;

  const onMove = (ev) => {
    const box = ev.currentTarget.ownerSVGElement.getBoundingClientRect();
    const scale = box.width / W;
    const t = t0 + (((ev.clientX - box.left) / scale - m.left) / (W - m.left - m.right)) * (t1 - t0);
    let i = pts.findIndex((p) => p.t > t) - 1;
    if (i === -2) i = pts.length - 1;
    if (i < 0) { setTip(null); return; }
    const p = pts[i];
    const left = Math.min(x(p.t) * scale + 12, box.width - 190);
    setTip({ left: Math.max(0, left), top: Math.max(0, y(p.total) * scale - 56), when: fmt.when.format(p.t), lines: [tt.paceTipTotal(fmt.n.format(p.total)), tt.paceTipPublic(fmt.n.format(p.pub))] });
  };

  return (
    <div ref={ref} className="pace-chart">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tt.paceTotalTitle}>
        {spans.map(([a, b]) => (
          <rect key={a} x={x(Math.max(a, t0))} y={m.top} width={Math.max(1, x(Math.min(b, t1)) - x(Math.max(a, t0)))} height={H - m.top - m.bottom} fill="var(--chart-band)" />
        ))}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.left} x2={W - m.right} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" />
            <text x={m.left - 6} y={y(v) + 4} textAnchor="end" {...FONT}>{fmt.n.format(v)}</text>
          </g>
        ))}
        {xTicks(t0, t1, W - m.left - m.right, fmt.day, fmt.hour).map(({ t, label }) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor={x(t) - textW(label) / 2 < 0 ? "start" : x(t) + textW(label) / 2 > W ? "end" : "middle"} {...FONT}>{label}</text>
        ))}
        <line x1={m.left} x2={W - m.right} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {capacity > 0 && <line x1={m.left} x2={W - m.right} y1={y(capacity)} y2={y(capacity)} stroke="var(--muted)" strokeDasharray="4 4" />}
        {markerEls}
        <path d={step("pub")} fill="none" stroke="var(--chart-2)" strokeWidth="2" strokeLinejoin="round" />
        <path d={step("total")} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" />
        {!narrow && placed.map((e) => (
          <text key={e.key} x={W - m.right + 6} y={e.y + 4} fill={e.color} fontSize="11" fontWeight="600">{e.text}</text>
        ))}
        <rect x={m.left} y={m.top} width={W - m.left - m.right} height={H - m.top - m.bottom} fill="transparent"
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setTip(null)} />
      </svg>
      <Tip tip={tip} />
      {narrow && (
        <div className="pace-legend">
          {placed.map((e) => <span key={e.key} style={{ color: e.color, fontWeight: 600 }}>{e.text}</span>)}
        </div>
      )}
    </div>
  );
}

function HourChart({ buckets, spans, fmt, tt }) {
  const [ref, W] = useWidth();
  const [tip, setTip] = useState(null);
  const H = 220;
  const yTicks = niceTicks(Math.max(...buckets.map((b) => b.total)));
  const yMax = yTicks[yTicks.length - 1];
  const m = { top: 30, right: 8, bottom: 24, left: textW(fmt.n.format(yMax)) + 10 };
  const t0 = buckets[0].t;
  const t1 = buckets[buckets.length - 1].t + HOUR;
  const x = (t) => m.left + ((t - t0) / (t1 - t0)) * (W - m.left - m.right);
  const y = (v) => H - m.bottom - (v / yMax) * (H - m.top - m.bottom);
  const bw = Math.max(1.5, x(t0 + HOUR) - x(t0) - 1);

  // The busiest hours, labelled above their bars and kept apart.
  const placed = [];
  const peakEls = peakHours(buckets, 3).map((p) => {
    const text = `${fmt.hourDay.format(p.t)} · ${fmt.n.format(p.total)}`;
    const w = textW(text);
    const lx = Math.min(Math.max(m.left, x(p.t) + bw / 2 - w / 2), W - m.right - w);
    let ly = Math.max(12, y(p.total) - 6);
    while (placed.some((q) => Math.abs(q.y - ly) < 13 && lx < q.x + q.w + 6 && q.x < lx + w + 6)) ly -= 13;
    ly = Math.max(12, ly);
    placed.push({ x: lx, y: ly, w });
    return <text key={p.t} x={lx} y={ly} fontSize="11" fontWeight="600" fill="var(--text)">{text}</text>;
  });

  const onMove = (ev) => {
    const box = ev.currentTarget.ownerSVGElement.getBoundingClientRect();
    const scale = box.width / W;
    const t = t0 + (((ev.clientX - box.left) / scale - m.left) / (W - m.left - m.right)) * (t1 - t0);
    const b = buckets[Math.min(buckets.length - 1, Math.max(0, Math.floor((t - t0) / HOUR)))];
    const left = Math.min(x(b.t) * scale + 12, box.width - 220);
    setTip({ left: Math.max(0, left), top: Math.max(0, y(b.total) * scale - 56), when: fmt.hourDay.format(b.t), lines: [tt.paceTipHour(fmt.n.format(b.total)), `${tt.pacePublic}: ${fmt.n.format(b.viaPublic)} · ${tt.paceStaff}: ${fmt.n.format(b.viaStaff)}`] });
  };

  return (
    <div ref={ref} className="pace-chart">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={tt.paceHourTitle}>
        {spans.map(([a, b]) => (
          <rect key={a} x={x(Math.max(a, t0))} y={m.top} width={Math.max(1, x(Math.min(b, t1)) - x(Math.max(a, t0)))} height={H - m.top - m.bottom} fill="var(--chart-band)" />
        ))}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={m.left} x2={W - m.right} y1={y(v)} y2={y(v)} stroke="var(--chart-grid)" />
            <text x={m.left - 6} y={y(v) + 4} textAnchor="end" {...FONT}>{fmt.n.format(v)}</text>
          </g>
        ))}
        {xTicks(t0, t1, W - m.left - m.right, fmt.day, fmt.hour).map(({ t, label }) => (
          <text key={t} x={x(t)} y={H - 6} textAnchor={x(t) - textW(label) / 2 < 0 ? "start" : x(t) + textW(label) / 2 > W ? "end" : "middle"} {...FONT}>{label}</text>
        ))}
        <line x1={m.left} x2={W - m.right} y1={y(0)} y2={y(0)} stroke="var(--border)" />
        {buckets.map((b) => (
          <g key={b.t}>
            {b.viaPublic > 0 && <rect x={x(b.t)} width={bw} y={y(b.viaPublic)} height={y(0) - y(b.viaPublic)} fill="var(--chart-2)" />}
            {b.viaStaff > 0 && <rect x={x(b.t)} width={bw} y={y(b.total)} height={y(b.viaPublic) - y(b.total)} fill="var(--chart-3)" />}
          </g>
        ))}
        {peakEls}
        <rect x={m.left} y={m.top} width={W - m.left - m.right} height={H - m.top - m.bottom} fill="transparent"
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setTip(null)} />
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

export default function RegistrationPace({ regs, event }) {
  const tt = useT();
  const lang = useLang();
  // Pause history for one event: { key, rows, failed }; another key means it is still loading.
  const [history, setHistory] = useState({ key: null, rows: [], failed: false });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60e3);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!event?.id) return undefined;
    let alive = true;
    const key = `${event.id}:${!!event.registration_paused}`;
    Promise.resolve(
      sb.from("audit_log").select("action, created_at").eq("entity_type", "event").eq("entity_id", event.id)
        .in("action", ["registrations_paused", "registrations_resumed"]).order("created_at"),
    ).then(({ data, error }) => {
      if (alive) setHistory({ key, rows: error ? [] : data || [], failed: !!error });
    }).catch(() => { if (alive) setHistory({ key, rows: [], failed: true }); });
    return () => { alive = false; };
    // A pause or reopening changes event.registration_paused: reload the history then.
  }, [event?.id, event?.registration_paused]);

  const fmt = useMemo(() => {
    const loc = lang === "en" ? "en-US" : "pt-BR";
    return {
      n: new Intl.NumberFormat(loc),
      when: new Intl.DateTimeFormat(loc, { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }),
      day: new Intl.DateTimeFormat(loc, { timeZone: TZ, day: "numeric", month: "short" }),
      hour: withH(new Intl.DateTimeFormat(loc, { timeZone: TZ, hour: "numeric" }), lang),
      hourDay: withH(new Intl.DateTimeFormat(loc, { timeZone: TZ, day: "numeric", month: "short", hour: "numeric" }), lang),
      dec: new Intl.NumberFormat(loc, { maximumFractionDigits: 1 }),
    };
  }, [lang]);

  const timeline = useMemo(() => paceTimeline(regs, event?.id), [regs, event?.id]);
  if (!event?.id) return null;

  const current = history.key === `${event.id}:${!!event.registration_paused}`;
  const log = current ? history.rows : [];
  const logFailed = current && history.failed;
  const marks = paceMarks(timeline, log);
  const spans = pauseSpans(marks, now);
  const stats = phaseStats(timeline, marks, now);
  const buckets = hourlyBuckets(timeline, now);

  return (
    <section className="card pace" aria-labelledby="pace-title">
      <h3 id="pace-title" className="pace-title">{tt.paceTitle}</h3>
      <p className="pace-sub">{tt.paceSub}</p>
      {logFailed && <p className="pace-sub" style={{ color: "var(--warn)" }}>{tt.paceLogError}</p>}

      {timeline.length === 0 ? (
        <p className="pace-sub">{tt.paceEmpty}</p>
      ) : (
        <>
          <div className="pace-block">
            <h4 className="pace-h">{tt.paceTotalTitle}</h4>
            <div className="pace-legend" aria-hidden="true">
              <span><i style={{ background: "var(--chart-1)" }} />{tt.paceAll}</span>
              <span><i style={{ background: "var(--chart-2)" }} />{tt.pacePublic}</span>
              <span><i style={{ background: "var(--chart-band)", outline: "1px solid var(--border)" }} />{tt.pacePaused}</span>
            </div>
            <TotalChart timeline={timeline} marks={marks} spans={spans} capacity={+event.capacity || 0} now={now} fmt={fmt} tt={tt} />
          </div>

          <div className="pace-block">
            <h4 className="pace-h">{tt.paceHourTitle}</h4>
            <p className="pace-sub">{tt.paceHourSub}</p>
            <div className="pace-legend" aria-hidden="true">
              <span><i style={{ background: "var(--chart-2)" }} />{tt.pacePublic}</span>
              <span><i style={{ background: "var(--chart-3)" }} />{tt.paceStaff}</span>
              <span><i style={{ background: "var(--chart-band)", outline: "1px solid var(--border)" }} />{tt.pacePaused}</span>
            </div>
            <HourChart buckets={buckets} spans={spans} fmt={fmt} tt={tt} />
          </div>

          <div className="pace-block">
            <h4 className="pace-h">{tt.pacePhaseTitle}</h4>
            <div style={{ overflowX: "auto" }}>
              <table className="table pace-table">
                <thead>
                  <tr>
                    <th>{tt.pacePhase}</th>
                    <th>{tt.paceFrom}</th>
                    <th>{tt.paceTo}</th>
                    <th className="num">{tt.paceHours}</th>
                    <th className="num">{tt.paceRegs}</th>
                    <th className="num">{tt.pacePerHour}</th>
                    <th className="num">{tt.pacePerDay}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={`${s.kind}-${s.from}`}>
                      <td>{tt[`pacePhase_${s.kind}`]}</td>
                      <td>{fmt.when.format(s.from)}</td>
                      <td>{s.ongoing ? tt.paceNow : fmt.when.format(s.to)}</td>
                      <td className="num">{fmt.dec.format(s.hours)}</td>
                      <td className="num">{fmt.n.format(s.count)}</td>
                      <td className="num">{s.perHour == null ? "—" : fmt.dec.format(s.perHour)}</td>
                      <td className="num">{s.perHour == null ? "—" : fmt.n.format(Math.round(s.perHour * 24))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Search, Check } from "lucide-react";
import ICMLogo from "@/components/ICMLogo";
import { STRINGS, fill } from "@/i18n/strings";
import { fetchSharedList } from "@/lib/trumpetsApi";
import { groupByInviter, matchesShared } from "@/lib/trumpets";

const REFRESH_MS = 60000;
const VIEW_KEY = "mcc_tf_shared_view";
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === "guest" ? "guest" : "inviter"; } catch { return "inviter"; } };
const writeView = (v) => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

const CSS = `
.tsv-page{min-height:100vh;box-sizing:border-box;background:linear-gradient(160deg,var(--icm-crimson-deep,#8B0000) 0%,var(--icm-crimson,#b41926) 50%,var(--icm-navy-deep,#03223f) 100%);display:flex;justify-content:center;padding:24px 16px}
.tsv-card{background:var(--card);color:var(--text);border-radius:20px;width:100%;max-width:720px;align-self:flex-start;padding:24px 20px;box-shadow:0 24px 64px rgba(3,34,63,.4)}
.tsv-head{text-align:center;position:relative;margin-bottom:16px}
.tsv-head h1{font-family:'Lora',Georgia,serif;font-size:24px;margin:6px 0 2px;line-height:1.2}
.tsv-sub{font-size:15px;font-weight:600;color:var(--text-secondary)}
.tsv-stats{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin:12px 0 16px}
.tsv-stat{background:var(--bg);border-radius:12px;padding:8px 14px;font-size:14px;color:var(--text-secondary)}
.tsv-stat b{font-family:'Montserrat',sans-serif;font-size:20px;color:var(--text);margin-right:4px}
.tsv-tools{display:flex;flex-direction:column;gap:10px;margin-bottom:14px;position:sticky;top:0;background:var(--card);padding:8px 0;z-index:1}
.tsv-search{position:relative}
.tsv-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--muted)}
.tsv-search input{width:100%;box-sizing:border-box;padding:12px 14px 12px 38px;font-size:16px;border-radius:12px;border:1px solid var(--border);background:var(--bg);color:var(--text)}
.tsv-seg{display:flex;background:var(--bg);border-radius:12px;padding:4px;gap:4px}
.tsv-seg button{flex:1;min-height:44px;border:0;border-radius:9px;background:none;font-size:14px;font-weight:700;color:var(--text-secondary);cursor:pointer}
.tsv-seg button[aria-pressed="true"]{background:var(--card);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.12)}
.tsv-group{margin-bottom:18px}
.tsv-group h2{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:15px;margin:0 0 6px;padding-bottom:6px;border-bottom:2px solid var(--border)}
.tsv-group h2 span{font-family:'Montserrat',sans-serif;font-size:13px;color:var(--muted);white-space:nowrap}
.tsv-list{list-style:none;margin:0;padding:0}
.tsv-list li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 2px;border-bottom:1px solid var(--border);font-size:16px}
.tsv-list li:last-child{border-bottom:0}
.tsv-name{font-weight:600;min-width:0;overflow-wrap:anywhere}
.tsv-by{font-size:13px;color:var(--text-secondary);font-weight:400;display:block;margin-top:2px}
.tsv-came{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;font-size:12px;font-weight:700;padding:3px 8px;border-radius:99px;background:var(--ok-bg,#e8f5ec);color:var(--ok-fg,#1f6b3a)}
.tsv-note{text-align:center;color:var(--muted);font-size:14px;padding:28px 0}
.tsv-foot{text-align:center;font-size:12px;color:var(--muted);margin-top:16px}
`;

// Public page of a GA's shareable link (/trombetas/:token, migration 057): the guest names, who invited each one and
// who came — never phones or e-mails. Grouped by inviter (default) or A–Z, with a search. Refreshes every minute and
// when the phone wakes up. Outside PublicLayout, so it stays open in maintenance mode.
export default function TrumpetsSharedView({ lang, setLang }) {
  const { token } = useParams();
  const tt = STRINGS[lang === "en" ? "en" : "pt"].tf;
  const [state, setState] = useState({ status: "loading", list: null });
  const [query, setQuery] = useState("");
  const [view, setView] = useState(readView);

  const load = useCallback(async () => {
    try {
      const list = await fetchSharedList(token);
      setState({ status: "ok", list });
    } catch (e) {
      // keep showing the last list on a network hiccup; a link that was turned off says so
      setState((prev) => (e.message === "link_not_found" ? { status: "gone", list: null } : prev.list ? prev : { status: "error", list: null }));
    }
  }, [token]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    const onShow = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onShow); };
  }, [load]);

  const pickView = (v) => { setView(v); writeView(v); };
  const list = state.list;
  const shown = list ? list.guests.filter((g) => matchesShared(g, query)) : [];
  const came = list ? list.guests.filter((g) => g.attended).length : 0;
  const nameRow = (g, withBy) => (
    <li key={`${g.name}|${g.invitedBy}`}>
      <span className="tsv-name">{g.name}{withBy && <span className="tsv-by">{g.invitedBy ? fill(tt.sharedInvitedBy, { name: g.invitedBy }) : tt.sharedNoInviter}</span>}</span>
      {g.attended && <span className="tsv-came"><Check size={12} aria-hidden="true" /> {tt.sharedCame}</span>}
    </li>
  );

  return (
    <div className="tsv-page">
      <style>{CSS}</style>
      <main className="tsv-card">
        <header className="tsv-head">
          {setLang && (
            <button onClick={() => setLang(lang === "en" ? "pt" : "en")} className="lang-btn" style={{ position: "absolute", right: 0, top: 0 }}>
              {lang === "en" ? "PT" : "EN"}
            </button>
          )}
          <ICMLogo height={52} />
          <p style={{ margin: "8px 0 0", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em" }}>IGREJA CRISTÃ MARANATA</p>
          <h1>{list ? `${tt.title} ${list.year}` : tt.title}</h1>
          {list && <div className="tsv-sub">{list.ga}</div>}
        </header>

        {state.status === "loading" && <p className="tsv-note">{tt.loading}</p>}
        {state.status === "gone" && <p className="tsv-note">{tt.sharedGone}</p>}
        {state.status === "error" && <p className="tsv-note">{tt.sharedError}</p>}

        {list && (
          <>
            <div className="tsv-stats">
              <div className="tsv-stat"><b>{list.guests.length}</b>{tt.sharedGuests}</div>
              <div className="tsv-stat"><b>{came}</b>{tt.sharedCameCount}</div>
            </div>

            <div className="tsv-tools">
              <div className="tsv-search">
                <Search size={18} aria-hidden="true" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt.sharedSearchShort} aria-label={tt.sharedSearch} />
              </div>
              <div className="tsv-seg" role="group" aria-label={tt.sharedViewLabel}>
                <button type="button" aria-pressed={view === "inviter"} onClick={() => pickView("inviter")}>{tt.sharedByInviter}</button>
                <button type="button" aria-pressed={view === "guest"} onClick={() => pickView("guest")}>{tt.sharedByName}</button>
              </div>
            </div>

            {!list.guests.length ? (
              <p className="tsv-note">{tt.empty}</p>
            ) : !shown.length ? (
              <p className="tsv-note">{tt.sharedNoMatch}</p>
            ) : view === "inviter" ? (
              groupByInviter(shown).map((grp) => (
                <section className="tsv-group" key={grp.inviter || "-"}>
                  <h2>{grp.inviter || tt.sharedNoInviter}<span>{fill(grp.guests.length === 1 ? tt.sharedOneGuest : tt.sharedNGuests, { n: grp.guests.length })}</span></h2>
                  <ul className="tsv-list">{grp.guests.map((g) => nameRow(g, false))}</ul>
                </section>
              ))
            ) : (
              <ul className="tsv-list">{shown.map((g) => nameRow(g, true))}</ul>
            )}
            <p className="tsv-foot">{tt.sharedFoot}</p>
          </>
        )}
      </main>
    </div>
  );
}

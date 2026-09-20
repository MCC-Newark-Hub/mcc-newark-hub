import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Link } from "lucide-react";
import { sb } from "@/lib/supabase";

const SERVICE_LABELS = ["Único", "Manhã", "Tarde", "Noite"];
const QUICK_SOURCES = ["Avulso", "CIAs"];
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const today = () => new Date().toISOString().slice(0, 10);
const sevenDaysAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

export default function SetlistTab({ lang }) {
  const pt = lang !== "en";

  const [date, setDate] = useState(today());
  const [label, setLabel] = useState("Único");
  const [entries, setEntries] = useState([]);
  const [songs, setSongs] = useState([]); // full songs library for autocomplete
  const [stats, setStats] = useState({}); // { "number|title": { count, lastUsed } }
  const [loading, setLoading] = useState(true);

  // Form state
  const [numInput, setNumInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [numSuggestions, setNumSuggestions] = useState([]);
  const [titleSuggestions, setTitleSuggestions] = useState([]);
  const [showNumDrop, setShowNumDrop] = useState(false);
  const [showTitleDrop, setShowTitleDrop] = useState(false);
  const [saving, setSaving] = useState(false);

  const numRef = useRef(null);
  const titleRef = useRef(null);

  // Load songs library + stats on mount
  useEffect(() => {
    loadLibrary();
  }, []);

  // Load entries whenever date or label changes
  useEffect(() => {
    loadEntries();
  }, [date, label]);

  const loadLibrary = async () => {
    const { data: songRows } = await sb.from("songs").select("*");
    const { data: statRows } = await sb.from("setlist_entries").select("song_number, song_title, service_date");
    if (songRows) setSongs(songRows);
    if (statRows) buildStats(statRows);
  };

  const loadEntries = async () => {
    setLoading(true);
    const { data } = await sb
      .from("setlist_entries")
      .select("*")
      .eq("service_date", date)
      .eq("service_label", label)
      .order("position");
    setEntries(data || []);
    setLoading(false);
  };

  const buildStats = (rows) => {
    const map = {};
    rows.forEach((r) => {
      const k = `${r.song_number}|${r.song_title}`;
      if (!map[k]) map[k] = { count: 0, lastUsed: null };
      map[k].count++;
      if (!map[k].lastUsed || r.service_date > map[k].lastUsed) {
        map[k].lastUsed = r.service_date;
      }
    });
    setStats(map);
  };

  const isRecent = (number, title) => {
    const k = `${number}|${title}`;
    return stats[k]?.lastUsed >= sevenDaysAgo();
  };

  const useCount = (number, title) => stats[`${number}|${title}`]?.count || 0;

  // Autocomplete: number field
  const onNumChange = (val) => {
    setNumInput(val);
    setTitleInput("");
    setTitleSuggestions([]);
    if (!val.trim()) { setNumSuggestions([]); setShowNumDrop(false); return; }
    const matches = [...new Set(songs.filter((s) => norm(s.number).startsWith(norm(val))).map((s) => s.number))];
    setNumSuggestions(matches.slice(0, 6));
    setShowNumDrop(matches.length > 0);
  };

  const selectNumber = (num) => {
    setNumInput(num);
    setShowNumDrop(false);
    const matches = songs.filter((s) => s.number === num).map((s) => s.title);
    setTitleSuggestions(matches);
    setTimeout(() => titleRef.current?.focus(), 0);
  };

  // Autocomplete: title field
  const onTitleChange = (val) => {
    setTitleInput(val);
    if (!val.trim()) { setShowTitleDrop(false); return; }
    const base = numInput.trim()
      ? songs.filter((s) => s.number === numInput.trim())
      : songs;
    const matches = base.filter((s) => norm(s.title).includes(norm(val))).map((s) => s.title);
    setTitleSuggestions([...new Set(matches)].slice(0, 6));
    setShowTitleDrop(matches.length > 0);
  };

  const selectTitle = (title) => {
    setTitleInput(title);
    setShowTitleDrop(false);
  };

  // Add a song to the list
  const addSong = async () => {
    const number = numInput.trim();
    const title = titleInput.trim();
    if (!number || !title) return;
    setSaving(true);

    const position = entries.length;
    const row = { service_date: date, service_label: label, position, song_number: number, song_title: title };
    const { data, error } = await sb.from("setlist_entries").insert(row).select().single();
    if (!error && data) {
      setEntries((prev) => [...prev, data]);
      // Upsert into songs library
      await sb.from("songs").upsert({ number, title }, { onConflict: "number,title", ignoreDuplicates: true });
      // Refresh stats
      setStats((prev) => {
        const k = `${number}|${title}`;
        const existing = prev[k] || { count: 0, lastUsed: null };
        return { ...prev, [k]: { count: existing.count + 1, lastUsed: date > (existing.lastUsed || "") ? date : existing.lastUsed } };
      });
    }
    setSaving(false);
    setNumInput("");
    setTitleInput("");
    numRef.current?.focus();
  };

  const removeEntry = async (id) => {
    const updated = entries.filter((e) => e.id !== id).map((e, i) => ({ ...e, position: i }));
    setEntries(updated);
    await sb.from("setlist_entries").delete().eq("id", id);
    // Reorder remaining
    for (const e of updated) {
      await sb.from("setlist_entries").update({ position: e.position }).eq("id", e.id);
    }
  };

  const moveEntry = async (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= entries.length) return;
    const updated = [...entries];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    const reordered = updated.map((e, i) => ({ ...e, position: i }));
    setEntries(reordered);
    await sb.from("setlist_entries").update({ position: newIdx }).eq("id", entries[idx].id);
    await sb.from("setlist_entries").update({ position: idx }).eq("id", entries[newIdx].id);
  };

  const copyShareLink = () => {
    const url = `${window.location.origin}/songs/${date}`;
    navigator.clipboard.writeText(url).catch(() => {});
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>
            {pt ? "Lista de Louvores" : "Praise Song List"}
          </h3>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>
            {pt ? "Louvores do culto — por data e horário." : "Praise songs per service date and time."}
          </p>
        </div>
        <button
          onClick={copyShareLink}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--muted)", fontSize: 13, cursor: "pointer", fontFamily: "'Montserrat',sans-serif" }}
          title={pt ? "Copiar link público" : "Copy public link"}
        >
          <Link size={14} /> {pt ? "Compartilhar" : "Share link"}
        </button>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, background: "var(--card)", color: "var(--text)" }}
        />
        <div style={{ display: "flex", gap: 4 }}>
          {SERVICE_LABELS.map((l) => (
            <button
              key={l}
              onClick={() => setLabel(l)}
              style={{
                padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: label === l ? 700 : 500, cursor: "pointer",
                background: label === l ? "#7c3aed" : "var(--card)",
                color: label === l ? "#fff" : "var(--muted)",
                border: `1.5px solid ${label === l ? "#7c3aed" : "var(--border)"}`,
                fontFamily: "'Montserrat',sans-serif",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Add song row */}
      <div style={{ background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 20 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
          {pt ? "Adicionar louvor" : "Add praise song"}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          {/* Número */}
          <div style={{ position: "relative", width: 140 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 }}>
              {pt ? "Número" : "Number"}
            </label>
            <input
              ref={numRef}
              value={numInput}
              onChange={(e) => onNumChange(e.target.value)}
              onFocus={() => numInput && setShowNumDrop(numSuggestions.length > 0)}
              onBlur={() => setTimeout(() => setShowNumDrop(false), 150)}
              placeholder="45 / Avulso / CIAs"
              style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 13, boxSizing: "border-box", background: "var(--card)", color: "var(--text)" }}
            />
            {/* Quick-select buttons */}
            <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
              {QUICK_SOURCES.map((q) => (
                <button key={q} onMouseDown={() => selectNumber(q)}
                  style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, border: "1px solid var(--border)", background: "var(--bg2)", cursor: "pointer", color: "var(--muted)", fontFamily: "'Montserrat',sans-serif" }}>
                  {q}
                </button>
              ))}
            </div>
            {showNumDrop && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, width: 200, background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 8, zIndex: 10, boxShadow: "var(--shadow-md)" }}>
                {numSuggestions.map((n) => (
                  <div key={n} onMouseDown={() => selectNumber(n)}
                    style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg2)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                    {n}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Título */}
          <div style={{ position: "relative", flex: 1, minWidth: 180 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 }}>
              {pt ? "Título" : "Title"}
            </label>
            <input
              ref={titleRef}
              value={titleInput}
              onChange={(e) => onTitleChange(e.target.value)}
              onFocus={() => titleInput && setShowTitleDrop(titleSuggestions.length > 0)}
              onBlur={() => setTimeout(() => setShowTitleDrop(false), 150)}
              onKeyDown={(e) => e.key === "Enter" && addSong()}
              placeholder={pt ? "Título do louvor…" : "Praise song title…"}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 13, boxSizing: "border-box", background: "var(--card)", color: "var(--text)" }}
            />
            {showTitleDrop && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 8, zIndex: 10, boxShadow: "var(--shadow-md)" }}>
                {titleSuggestions.map((t) => {
                  const recent = isRecent(numInput, t);
                  const count = useCount(numInput, t);
                  return (
                    <div key={t} onMouseDown={() => selectTitle(t)}
                      style={{ padding: "9px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = "var(--bg2)"}
                      onMouseLeave={(e) => e.currentTarget.style.background = ""}>
                      <span>{t}</span>
                      <span style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        {count > 0 && <span style={{ fontSize: 11, background: "#e0e7ff", color: "#3730a3", borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>{count}×</span>}
                        {recent && <span style={{ fontSize: 11, background: "#fef3c7", color: "#92400e", borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>⚠ 7d</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ paddingTop: 18 }}>
            <button
              className="btn btn-primary"
              onClick={addSong}
              disabled={saving || !numInput.trim() || !titleInput.trim()}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Plus size={16} /> {pt ? "Adicionar" : "Add"}
            </button>
          </div>
        </div>
      </div>

      {/* Current list */}
      {loading ? (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>{pt ? "Carregando…" : "Loading…"}</p>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: "var(--muted)" }}>
          <p style={{ fontSize: 14 }}>{pt ? "Nenhum louvor nesta lista ainda." : "No praise songs in this list yet."}</p>
        </div>
      ) : (
        <div style={{ background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "36px 100px 1fr auto", padding: "8px 14px", borderBottom: "2px solid var(--border)", background: "var(--bg2)" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>#</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>{pt ? "Número" : "Number"}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>{pt ? "Título" : "Title"}</span>
            <span />
          </div>
          {entries.map((e, idx) => {
            const recent = isRecent(e.song_number, e.song_title);
            return (
              <div key={e.id} style={{ display: "grid", gridTemplateColumns: "36px 100px 1fr auto", padding: "12px 14px", borderBottom: "1px solid var(--border)", alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>{idx + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{e.song_number}</span>
                <span style={{ fontSize: 14, color: "var(--text)", display: "flex", alignItems: "center", gap: 6 }}>
                  {e.song_title}
                  {recent && <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", borderRadius: 99, padding: "1px 6px", fontWeight: 700 }}>⚠ 7d</span>}
                </span>
                <span style={{ display: "flex", gap: 2 }}>
                  <button onClick={() => moveEntry(idx, -1)} disabled={idx === 0}
                    style={{ background: "none", border: "none", cursor: idx === 0 ? "default" : "pointer", color: idx === 0 ? "var(--border)" : "var(--muted)", padding: 4 }}>
                    <ArrowUp size={14} />
                  </button>
                  <button onClick={() => moveEntry(idx, 1)} disabled={idx === entries.length - 1}
                    style={{ background: "none", border: "none", cursor: idx === entries.length - 1 ? "default" : "pointer", color: idx === entries.length - 1 ? "var(--border)" : "var(--muted)", padding: 4 }}>
                    <ArrowDown size={14} />
                  </button>
                  <button onClick={() => removeEntry(e.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

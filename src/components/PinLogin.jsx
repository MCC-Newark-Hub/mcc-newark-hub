import { useEffect, useRef } from "react";
import { Lock } from "lucide-react";

export default function PinLogin({ onSubmit, onBack, lang, t, pin, setPin, err, setErr }) {
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const go = () => onSubmit(pin);
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 20,
        padding: "32px 28px",
        width: "100%",
        maxWidth: 380,
        boxShadow: "0 24px 64px rgba(3,34,63,.4)",
        borderTop: "4px solid #8B0000",
      }}
    >
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 34, marginBottom: 8, display: "flex", justifyContent: "center" }}>
          <Lock size={34} color="#8B0000" />
        </div>
        <h2
          style={{
            fontFamily: "'Lora',Georgia,serif",
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 4,
            color: "var(--text)",
          }}
        >
          {t.teamAccess}
        </h2>
        <p style={{ color: "#6b7280", fontSize: 13 }}>{t.enterPin}</p>
      </div>
      <input
        ref={inputRef}
        type="password"
        maxLength={6}
        value={pin}
        onChange={(e) => {
          setPin(e.target.value);
          setErr("");
        }}
        placeholder="••••••" inputMode="numeric" autoComplete="off"
        onKeyDown={(e) => e.key === "Enter" && go()}
        style={{
          fontSize: 28,
          letterSpacing: 12,
          textAlign: "center",
          fontWeight: 700,
          marginBottom: 10,
          borderRadius: 10,
          border: err ? "2px solid #c0392b" : "2px solid var(--input-border,#d4cfc9)",
        }}
      />
      {err && (
        <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 8, textAlign: "center" }}>
          {err}
        </p>
      )}
      <button
        className="btn btn-primary"
        style={{ width: "100%", padding: 12, fontSize: 15, marginBottom: 8 }}
        onClick={go}
      >
        {lang === "pt" ? "Entrar" : "Sign In"}
      </button>
      <button className="btn btn-ghost" style={{ width: "100%", padding: 10 }} onClick={onBack}>
        {t.back}
      </button>
    </div>
  );
}

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { authHeaders } from "@/lib/session";

const PIN = /^\d{6}$/;

// Shown by AuthGate instead of the hub while the signed-in user still has a PIN
// someone else issued them (mustChangePin). The server (api/change-pin.js) checks the
// current PIN, refuses weak or unavailable PINs and clears the flag.
export default function ChangePinScreen({ user, lang, onDone, onLogout }) {
  const en = lang === "en";
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const digits = (v) => v.replace(/\D/g, "").slice(0, 6);
  const messages = {
    wrong_current_pin: en ? "The current PIN is not correct." : "O PIN atual não confere.",
    same_pin: en ? "The new PIN must be different from the current one." : "O novo PIN precisa ser diferente do atual.",
    pin_not_allowed: en
      ? "This PIN can't be used. Avoid sequences (123456) and repeated digits (111111), and choose another."
      : "Esse PIN não pode ser usado. Evite sequências (123456) e números repetidos (111111) e escolha outro.",
    too_many_attempts: en ? "Too many attempts. Wait 15 minutes and try again." : "Muitas tentativas. Aguarde 15 minutos e tente de novo.",
    not_signed_in: en ? "Your session expired. Sign in again." : "Sua sessão expirou. Entre de novo.",
  };

  const submit = async () => {
    if (busy) return;
    if (!PIN.test(current) || !PIN.test(next)) {
      setErr(en ? "PINs have 6 digits." : "O PIN tem 6 dígitos.");
      return;
    }
    if (next !== confirm) {
      setErr(en ? "The new PIN and its confirmation don't match." : "O novo PIN e a confirmação não são iguais.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ currentPin: current, newPin: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        onDone();
        return;
      }
      if (data.error === "not_signed_in") onLogout();
      setErr(messages[data.error] || (en ? "Could not change the PIN. Try again." : "Não foi possível trocar o PIN. Tente de novo."));
      if (data.error === "wrong_current_pin") setCurrent("");
      else { setNext(""); setConfirm(""); }
    } catch {
      setErr(en ? "Could not reach the server. Check the connection." : "Não foi possível falar com o servidor. Verifique a conexão.");
    } finally {
      setBusy(false);
    }
  };

  const pinInput = (value, set, label, autoFocus) => (
    <div style={{ marginBottom: 12, textAlign: "left" }}>
      <label>{label}</label>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => { set(digits(e.target.value)); setErr(""); }}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="••••••"
        style={{ fontSize: 22, letterSpacing: 10, textAlign: "center", fontWeight: 700, borderRadius: 10 }}
      />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "32px 28px", width: "100%", maxWidth: 400, boxShadow: "0 24px 64px rgba(3,34,63,.4)", borderTop: "4px solid #8B0000" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <KeyRound size={34} color="#8B0000" />
          <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700, margin: "8px 0 4px", color: "#1a1e2e" }}>
            {en ? "Choose your PIN" : "Escolha seu PIN"}
          </h2>
          <p style={{ color: "#6b7280", fontSize: 13, margin: 0, lineHeight: 1.5 }}>
            {en
              ? `Hi, ${user?.name?.split(" ")[0] || ""}! The PIN you received was temporary. Choose a 6-digit PIN only you know.`
              : `Olá, ${user?.name?.split(" ")[0] || ""}! O PIN que você recebeu é provisório. Escolha um PIN de 6 dígitos que só você saiba.`}
          </p>
        </div>
        {pinInput(current, setCurrent, en ? "Current PIN" : "PIN atual", true)}
        {pinInput(next, setNext, en ? "New PIN" : "Novo PIN")}
        {pinInput(confirm, setConfirm, en ? "Confirm new PIN" : "Confirme o novo PIN")}
        {err && <p style={{ color: "#c0392b", fontSize: 13, margin: "0 0 10px", textAlign: "center" }}>{err}</p>}
        <button className="btn btn-primary" style={{ width: "100%", padding: 12, fontSize: 15, marginBottom: 8 }} disabled={busy} onClick={submit}>
          {busy ? (en ? "Saving…" : "Salvando…") : (en ? "Save PIN" : "Salvar PIN")}
        </button>
        <button className="btn btn-ghost" style={{ width: "100%", padding: 10 }} onClick={onLogout}>
          {en ? "Sign out" : "Sair"}
        </button>
      </div>
    </div>
  );
}

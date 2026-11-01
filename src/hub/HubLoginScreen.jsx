import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { STRINGS } from "@/i18n/strings";
import { MAINTENANCE_MODE } from "@/constants";
import ICMLogo from "@/components/ICMLogo";
import PinLogin from "@/components/PinLogin";
import MaintenanceNotice from "@/components/MaintenanceNotice";

export default function HubLoginScreen({ login, lang, setLang }) {
  const t = STRINGS[lang] || STRINGS.pt;
  const pt = lang !== "en";
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const [busy, setBusy] = useState(false);

  const handleSubmit = async (p) => {
    if (busy) return;
    setBusy(true);
    const result = await login(p);
    setBusy(false);
    if (result === true) {
      // Always land on the Home: it shows the modules (cards) the person's profile can open.
      navigate("/", { replace: true });
    } else if (result === "too_many_attempts") {
      setErr(pt ? "Muitas tentativas. Aguarde 15 minutos e tente de novo." : "Too many attempts. Wait 15 minutes and try again.");
      setPin("");
    } else if (result === "unavailable") {
      setErr(pt ? "Não foi possível entrar agora. Verifique a conexão e tente de novo." : "Could not sign in right now. Check the connection and try again.");
    } else if (MAINTENANCE_MODE) {
      setErr(pt ? "PIN incorreto ou acesso restrito durante a manutenção." : "Incorrect PIN or access restricted during maintenance.");
      setPin("");
    } else {
      setErr(t.wrongPin || "PIN incorreto.");
      setPin("");
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20, position: "relative",
    }}>
      {setLang && (
        <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 4 }}>
          {["pt", "en"].map((l) => (
            <button key={l} className={`lang-btn ${lang === l ? "active" : ""}`} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      <div style={{ textAlign: "center", maxWidth: 380, width: "100%" }}>
        <ICMLogo height={120} style={{ marginBottom: 20 }} />
        <h1 style={{ fontFamily: "'Lora',Georgia,serif", color: "#fff", fontSize: 24, fontWeight: 700, marginBottom: 4 }}>
          MCC Newark Hub
        </h1>
        <p style={{ color: "rgba(255,255,255,.7)", fontSize: 14, marginBottom: 28 }}>
          {lang === "en" ? "Church Portal" : "Portal da Igreja"}
        </p>
        {MAINTENANCE_MODE && <MaintenanceNotice lang={lang} variant="banner" />}
        <PinLogin
          pin={pin}
          setPin={setPin}
          err={err}
          setErr={setErr}
          onSubmit={handleSubmit}
          onBack={null}
          lang={lang}
          t={t}
        />
      </div>
    </div>
  );
}

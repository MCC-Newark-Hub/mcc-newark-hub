import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { STRINGS } from "@/i18n/strings";
import { MAINTENANCE_MODE } from "@/constants";
import ICMLogo from "@/components/ICMLogo";
import PinLogin from "@/components/PinLogin";
import MaintenanceNotice from "@/components/MaintenanceNotice";

export default function HubLoginScreen({ login, lang, setLang }) {
  const t = STRINGS[lang] || STRINGS.pt;
  const pt = lang !== "en";
  const navigate = useNavigate();
  const location = useLocation();
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");

  const handleSubmit = (p) => {
    if (login(p)) {
      const from = location.state?.from;
      const STAFF_VIEWS = ["admin", "clerk", "pastor", "ga_leader", "team_leader", "treasurer"];
      // Legacy mcc_view values map to /events
      const dest = from && !STAFF_VIEWS.includes(from) ? from : "/";
      navigate(dest, { replace: true });
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

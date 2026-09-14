import { useState } from "react";
import { ClipboardList, Lock, Search, HelpCircle } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import ICMLogo from "@/components/ICMLogo";
import PinLogin from "@/components/PinLogin";
import DeadlineBanner from "@/components/DeadlineBanner";
import RegistrationThermometer from "@/components/RegistrationThermometer";
import { formatDeadlineDate, deadlineLabel } from "@/lib/registrationDeadline";

function LoginScreen({ login, lang, setLang, event, activeCount, waitlistedCount = 0, onPublicRegister, onLookup }) {
  const t = STRINGS[lang];
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [mode, setMode] = useState("choose");

  const today = new Date().toISOString().slice(0, 10);
  const isEventPast = !!(event?.date && event.date <= today);

  const handlePinSubmit = (p) => {
    if (!login(p)) {
      setErr(t.wrongPin);
      setPin("");
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
        position: "relative",
      }}
    >
      {setLang && (
        <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 4 }}>
          {["pt", "en"].map((l) => (
            <button
              key={l}
              className={`lang-btn ${lang === l ? "active" : ""}`}
              onClick={() => setLang(l)}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      {mode === "choose" ? (
        <div style={{ textAlign: "center", maxWidth: 380, width: "100%" }}>
          <ICMLogo height={150} style={{ marginBottom: 24 }} />
          <h1
            style={{
              fontFamily: "'Lora',Georgia,serif",
              color: "#fff",
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: ".01em",
              marginBottom: 6,
            }}
          >
            {t.appName}
          </h1>
          <p style={{ color: "rgba(255,255,255,.7)", fontSize: 15, marginBottom: event ? 16 : 32 }}>
            {t.appSub}
          </p>
          {event && (
            <div
              style={{
                display: "inline-block",
                background: "#fff",
                borderRadius: 12,
                padding: "16px 26px",
                marginBottom: isEventPast ? 20 : 28,
                boxShadow: "0 10px 24px -8px rgba(0,0,0,.45)",
              }}
            >
              <div style={{ color: "#03223f", fontWeight: 700, fontSize: 17, fontFamily: "'Lora',Georgia,serif" }}>
                {event.name}
              </div>
              <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4 }}>
                {event.date}{event.location ? ` · ${event.location}` : ""}
              </div>
              <RegistrationThermometer event={event} activeCount={activeCount} waitlistedCount={waitlistedCount} lang={lang} />
              {!isEventPast && event.registration_deadline && (() => {
                const spotsLeft = event.capacity ? Math.max(0, event.capacity - activeCount) : 1;
                const isFull = spotsLeft === 0;
                const pt = lang !== "en";
                const label = isFull
                  ? (pt ? "Prazo para pagamento das inscrições" : "Payment deadline")
                  : (pt ? "Prazo para inscrições e pagamento" : "Registration & payment deadline");
                return (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#92400e", background: "#fef3c7", borderRadius: 99, padding: "4px 12px", fontSize: 13, fontWeight: 700, marginTop: 10 }}>
                    ⏰ {label}: {formatDeadlineDate(event.registration_deadline)}
                  </div>
                );
              })()}
            </div>
          )}
          {!isEventPast && event && (
            <div style={{ marginBottom: 20 }}>
              <DeadlineBanner event={event} t={t} />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {isEventPast ? (
              <div style={{ background: "rgba(255,255,255,.12)", border: "1.5px solid rgba(255,255,255,.25)", borderRadius: 14, padding: "22px 20px", textAlign: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 38, marginBottom: 10 }}>🎉</div>
                <div style={{ color: "#fff", fontFamily: "'Lora',Georgia,serif", fontSize: 19, fontWeight: 700, marginBottom: 8 }}>
                  {lang === "en" ? "Event concluded!" : "Evento realizado!"}
                </div>
                <p style={{ color: "rgba(255,255,255,.85)", fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                  {lang === "en"
                    ? "Thank you to everyone who joined us. See you at the next event!"
                    : "Obrigado a todos que participaram. Até o próximo evento!"}
                </p>
              </div>
            ) : (() => {
              const spotsLeft = event?.capacity ? Math.max(0, event.capacity - activeCount) : 1;
              const full = event?.capacity && spotsLeft === 0;
              const paused = !!event?.registration_paused;
              const locked = !!event?.registrations_locked;
              const isBlocked = paused || locked;
              const pt = lang !== "en";
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <button
                    className="btn btn-accent"
                    style={{ padding: "14px 24px", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                    onClick={onPublicRegister}
                  >
                    <ClipboardList size={18} />
                    {(full || isBlocked)
                      ? (pt ? "Entrar na Lista de Espera" : "Join the Waitlist")
                      : t.myReg}
                  </button>
                  {isBlocked && (
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.75)", textAlign: "center", lineHeight: 1.5 }}>
                      {pt
                        ? "As inscrições estão encerradas. Você ainda pode entrar na lista de espera."
                        : "Registrations are closed. You can still join the waitlist."}
                    </p>
                  )}
                  {!isBlocked && full && (
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,.75)", textAlign: "center", lineHeight: 1.5 }}>
                      {pt
                        ? "O evento está lotado, mas você ainda pode se inscrever. Sua vaga será garantida se houver cancelamentos ou aumento de capacidade."
                        : "The event is full, but you can still register. You'll get a spot if there are cancellations or a capacity increase."}
                    </p>
                  )}
                </div>
              );
            })()}

            {!isEventPast && (
              <button
                className="btn btn-ghost"
                style={{
                  padding: "14px 24px",
                  fontSize: 15,
                  borderColor: "rgba(255,255,255,.3)",
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
                onClick={onLookup}
              >
                <Search size={18} /> {lang === "en" ? "Manage my registration" : "Consultar inscrição"}
              </button>
            )}
            <button
              className="btn btn-ghost"
              style={{
                padding: "14px 24px",
                fontSize: 15,
                borderColor: "rgba(255,255,255,.3)",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
              onClick={() => setMode("pin")}
            >
              <Lock size={18} /> {t.teamAccess}
            </button>
            <a
              href="https://mcc-newark-hub.github.io/mcc-newark-hub/tutorials/first-login/"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontSize: 13, color: "rgba(255,255,255,.65)", textDecoration: "none", marginTop: 4,
              }}
            >
              <HelpCircle size={14} />
              {lang === "en" ? "How to use this system" : "Como usar este sistema"}
            </a>
          </div>
        </div>
      ) : (
        <PinLogin
          pin={pin}
          setPin={setPin}
          err={err}
          setErr={setErr}
          onSubmit={handlePinSubmit}
          onBack={() => setMode("choose")}
          lang={lang}
          t={t}
        />
      )}
    </div>
  );
}

export default LoginScreen;

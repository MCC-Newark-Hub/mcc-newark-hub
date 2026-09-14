import ICMLogo from "@/components/ICMLogo";

export default function MaintenanceNotice({ lang, variant = "page" }) {
  const pt = lang !== "en";

  const title = pt ? "Sistema em manutenção" : "System under maintenance";
  const body = pt
    ? "Estamos em manutenção. Previsão de retorno: novembro de 2026."
    : "We're under maintenance. Expected return: November 2026.";
  const contact = pt
    ? "Em caso de dúvidas, contate o secretário de Newark, Philadelphia ou New York."
    : "For questions, please contact the secretary of Newark, Philadelphia, or New York.";

  if (variant === "banner") {
    return (
      <div style={{
        background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.25)",
        borderRadius: 12, padding: "14px 16px", marginBottom: 22, textAlign: "left",
      }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{title}</div>
        <div style={{ color: "rgba(255,255,255,.85)", fontSize: 12.5, lineHeight: 1.5 }}>{body}</div>
        <div style={{ color: "rgba(255,255,255,.7)", fontSize: 12, lineHeight: 1.5, marginTop: 4 }}>{contact}</div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{ textAlign: "center", maxWidth: 420, width: "100%" }}>
        <ICMLogo height={100} style={{ marginBottom: 24 }} />
        <h1 style={{ fontFamily: "'Lora',Georgia,serif", color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 14 }}>
          {title}
        </h1>
        <p style={{ color: "rgba(255,255,255,.85)", fontSize: 15, lineHeight: 1.6, marginBottom: 10 }}>{body}</p>
        <p style={{ color: "rgba(255,255,255,.7)", fontSize: 13, lineHeight: 1.6 }}>{contact}</p>
      </div>
    </div>
  );
}

import { useNavigate } from "react-router-dom";
import { Calendar, BookOpen, Settings, Clock, GraduationCap, Music } from "lucide-react";

const SECTIONS = [
  {
    id: "events",
    path: "/events",
    icon: Calendar,
    color: "#8B0000",
    pt: { label: "Eventos", desc: "Inscrições, equipes, check-in e relatórios" },
    en: { label: "Events", desc: "Registrations, teams, check-in and reports" },
    roles: ["admin", "clerk", "pastor", "ga_leader", "team_leader", "treasurer"],
    live: true,
  },
  {
    id: "cms",
    path: "/cms",
    icon: BookOpen,
    color: "#03223f",
    pt: { label: "Diretório", desc: "Membros, famílias, grupos e funções" },
    en: { label: "Directory", desc: "Members, families, groups and roles" },
    roles: ["admin", "clerk", "pastor"],
    live: true,
  },
  {
    id: "schedule",
    path: "/schedule",
    icon: Clock,
    color: "#065f46",
    pt: { label: "Escalas", desc: "Portaria, flores e agenda de oração 24h" },
    en: { label: "Schedules", desc: "Door duty, flowers and 24h prayer agenda" },
    roles: ["admin", "clerk", "pastor", "ga_leader", "team_leader", "treasurer"],
    live: true,
  },
  {
    id: "worship",
    path: "/worship",
    icon: Music,
    color: "#7c3aed",
    pt: { label: "Culto Profético", desc: "Lista de louvores, catálogo e histórico" },
    en: { label: "Prophetic Service", desc: "Praise song lists, catalogue and history" },
    roles: ["admin", "clerk", "pastor", "ga_leader", "team_leader", "treasurer"],
    live: true,
  },
  {
    id: "apprentice",
    path: "/apprentice",
    icon: GraduationCap,
    color: "#6d28d9",
    pt: { label: "Aprendiz", desc: "Projeto Aprendiz — em breve" },
    en: { label: "Apprentice", desc: "Apprentice Project — coming soon" },
    roles: ["admin", "clerk", "pastor"],
    live: false,
  },
  {
    id: "settings",
    path: "/settings",
    icon: Settings,
    color: "#4b5563",
    pt: { label: "Configurações", desc: "Usuários, PINs e auditoria" },
    en: { label: "Settings", desc: "Users, PINs and audit log" },
    roles: ["admin"],
    live: true,
  },
];

export default function HubHome({ user, lang }) {
  const navigate = useNavigate();
  const pt = lang !== "en";
  const userRoles = user?.sysRoles || (user?.sysRole ? [user.sysRole] : []);

  const visible = SECTIONS.filter((s) =>
    s.roles.some((r) => userRoles.includes(r))
  );

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 740, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontFamily: "'Lora',Georgia,serif", color: "var(--text)", fontSize: 26, fontWeight: 700, marginBottom: 6 }}>
            {pt ? "Bem-vindo, " : "Welcome, "}{user?.name?.split(" ")[0] || ""}
          </h1>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            {pt ? "Escolha um módulo para continuar." : "Choose a module to continue."}
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
          {visible.map((s) => {
            const Icon = s.icon;
            const label = pt ? s.pt.label : s.en.label;
            const desc  = pt ? s.pt.desc  : s.en.desc;
            return (
              <button
                key={s.id}
                onClick={() => s.live && navigate(s.path)}
                disabled={!s.live}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 14,
                  padding: "28px 20px",
                  cursor: s.live ? "pointer" : "default",
                  textAlign: "center",
                  transition: "box-shadow .15s, border-color .15s, transform .12s",
                  opacity: s.live ? 1 : 0.5,
                  position: "relative",
                  overflow: "hidden",
                }}
                onMouseEnter={(e) => {
                  if (!s.live) return;
                  e.currentTarget.style.boxShadow = "var(--shadow-md)";
                  e.currentTarget.style.borderColor = s.color;
                  e.currentTarget.style.transform = "translateY(-2px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "";
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.transform = "";
                }}
              >
                <div style={{ width: 48, height: 48, borderRadius: 12, background: s.color + "18", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
                  <Icon size={24} color={s.color} />
                </div>
                <div style={{ fontFamily: "'Lora',Georgia,serif", fontWeight: 700, fontSize: 16, color: "var(--text)", marginBottom: 6 }}>
                  {label}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                  {desc}
                </div>
                {!s.live && (
                  <span style={{ position: "absolute", top: 10, right: 10, fontSize: 10, fontWeight: 700, color: "#6b7280", background: "var(--bg2)", borderRadius: 99, padding: "2px 8px" }}>
                    {pt ? "Em breve" : "Soon"}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

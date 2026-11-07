import { useContext } from "react";
import { RolePickContext } from "@/context/switchRole";
import { roleName } from "@/lib/roleView";

// Phones only (CSS shows it under 768px): the profiles of someone who has more than one,
// right under the blue bar, so the one in use is always visible and switching is one tap.
// On larger screens the "Trocar Função" button in the top bar does the same.
export default function RoleBar({ lang }) {
  const pick = useContext(RolePickContext);
  if (!pick) return null;
  const label = lang === "en" ? "Profile" : "Função";
  return (
    <nav className="role-bar" aria-label={label}>
      <span className="role-bar-label">{label}</span>
      <div className="role-bar-links">
        {pick.roles.map((role) => {
          const active = role === pick.active;
          return (
            <button
              key={role}
              type="button"
              className={`role-bar-link${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
              onClick={() => { if (!active) pick.select(role); }}
            >
              {roleName(role, lang)}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

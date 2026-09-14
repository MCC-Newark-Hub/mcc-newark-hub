import { useState } from "react";
import { INIT_USERS } from "@/dev/seeds";
import { MAINTENANCE_MODE } from "@/constants";

export function useAuth(dbUsers) {
  const [user, setUser] = useState(null);

  const login = function (pin) {
    var u = dbUsers.find(function (x) {
      return x.pin === pin;
    });
    if (!u)
      u = INIT_USERS.find(function (x) {
        return x.pin === pin;
      }); // fallback to seed
    if (u) {
      var mapped = {
        id: u.id,
        name: u.name,
        sysRole: u.sys_role || u.sysRole,
        sysRoles: u.sys_roles?.length ? u.sys_roles : [u.sys_role || u.sysRole],
        primaryRole: u.primary_role || u.primaryRole || u.sys_role || u.sysRole,
        pin: u.pin,
        initials: u.initials || u.name.slice(0, 2).toUpperCase(),
        church: u.church,
        churches: u.churches || [],
        gaIds: u.ga_ids || u.gaIds || [],
        teamLeads: u.team_leads || u.teamLeads || [],
        showFinancials: u.show_financials !== false,
      };
      if (MAINTENANCE_MODE && !mapped.sysRoles.includes("admin")) return null;
      setUser(mapped);
      return mapped;
    }
    return null;
  };

  const logout = () => setUser(null);

  return { user, setUser, login, logout };
}

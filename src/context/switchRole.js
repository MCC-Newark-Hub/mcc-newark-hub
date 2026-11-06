import { createContext } from "react";
export const SwitchRoleContext = createContext(null);
// The profiles someone can work in, for the phone's profile bar: { roles, active, select } or null.
export const RolePickContext = createContext(null);
// "Ver como" (admins): opens the user picker; null for everyone else.
export const SeeAsContext = createContext(null);

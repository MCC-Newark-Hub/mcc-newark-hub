// The session is the signed token issued by /api/login. Its `exp` (set from
// app_settings.session_ttl_hours on the server) is the only expiry; the browser can
// read it but not forge it, and the server re-checks it on every privileged call.
const TOKEN_KEY = "mcc_token";

export const readClaims = (token) => {
  try {
    const body = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(body));
  } catch {
    return null;
  }
};

export const getSessionToken = () => {
  const token = localStorage.getItem(TOKEN_KEY);
  const claims = token && readClaims(token);
  return claims?.exp && claims.exp * 1000 > Date.now() ? token : null;
};

export const isSessionValid = () => !!getSessionToken();

export const saveSession = (token) => localStorage.setItem(TOKEN_KEY, token);

export const clearSession = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("mcc_view");
  // keys from the old client-side PIN login
  localStorage.removeItem("mcc_pin");
  localStorage.removeItem("mcc_pin_ts");
  localStorage.removeItem("mcc_session_ttl_hours");
};

// Headers for the staff-only serverless functions.
export const authHeaders = () => {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

import { createContext, useContext } from "react";
// { allowed, names }: may the signed-in user mark registrations paid, and who may (for the hint).
export const PaymentAccessContext = createContext({ allowed: true, names: [] });
export const usePaymentAccess = () => useContext(PaymentAccessContext);

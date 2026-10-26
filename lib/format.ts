export { ksh, quantityText, tripWords, unitPrice, weighed } from "./engine";

export const kg = (n: number) => n.toFixed(2);
export const signed = (n: number, digits = 2) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;
export const signedKsh = (n: number) => `${n >= 0 ? "+" : "−"}KSh ${Math.abs(Math.round(n)).toLocaleString("en-KE")}`;

export const shortDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export const longDate = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const daysAgo = (iso: string, asOf: string) => Math.round((Date.parse(asOf) - Date.parse(iso)) / 86_400_000);

export const reported = (iso: string, asOf: string) => {
  const d = daysAgo(iso, asOf);
  return d === 0 ? "reported today" : d === 1 ? "reported yesterday" : `reported ${shortDate(iso)}`;
};

export { marketLabel as marketName } from "./engine";

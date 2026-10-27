import { Crop } from "./types";

// The farmer's last crop, place and quantity, so every way into the app picks up where they left off.
export const CHOICE_COOKIE = "soko_choice";

export type Choice = { crop: Crop; place: { id: string; name: string; county: string }; quantity: number };

export function saveChoice(c: Choice) {
  document.cookie = `${CHOICE_COOKIE}=${encodeURIComponent(JSON.stringify(c))}; path=/; max-age=31536000; samesite=lax`;
}

export function readChoice(raw: string | undefined): Choice | null {
  try {
    const c = JSON.parse(decodeURIComponent(raw ?? ""));
    const crop = Crop.safeParse(c?.crop);
    const quantity = Number(c?.quantity);
    const p = c?.place;
    if (!crop.success || !(quantity > 0 && quantity <= 1_000_000) || ![p?.id, p?.name, p?.county].every((v) => typeof v === "string")) return null;
    return { crop: crop.data, place: { id: p.id, name: p.name, county: p.county }, quantity };
  } catch {
    return null;
  }
}

export const choiceFromCookies = (cookies: string) => readChoice(cookies.match(new RegExp(`(?:^|; )${CHOICE_COOKIE}=([^;]*)`))?.[1]);

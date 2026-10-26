"use client";

import { useRef, useState } from "react";
import type { CropChoice } from "@/lib/data";
import type { Recommendation } from "@/lib/engine";
import { kg, marketName } from "@/lib/format";
import type { CropId } from "@/lib/crops";
import type { Road, Town } from "@/lib/types";

// A simulator, not a gateway: it ends at the same /api/recommend answer as the app.
type Props = { asOf: string; crops: CropChoice[]; counties: string[]; towns: Town[] };

type Flow = "prices" | "sell" | "near";
type Ask = { crop: CropId; town: string; quantity: number; storage: boolean };
type State =
  | { s: "idle" }
  | { s: "home" }
  | { s: "crop"; flow: Flow; page: number }
  | { s: "county"; flow: Flow; crop?: CropId; page: number }
  | { s: "town"; flow: Flow; crop?: CropId; county: string; page: number }
  | { s: "quantity"; crop: CropId; town: string }
  | { s: "storage"; crop: CropId; town: string; quantity: number }
  | { s: "text"; pages: string[]; i: number; sms?: string; ask?: Ask }
  | { s: "offer"; ask: Ask }
  | { s: "wait" };

const CODE = "*944#";
const PAGE = 6; // menu items per screen
const SCREEN_CHARS = 182; // per USSD screen, menu included
const FOOTER = 56; // the longest menu under an answer
const BUDGET = SCREEN_CHARS - FOOTER;

const HOME = "Soko Mbele\n1. Check prices\n2. Where and when to sell\n3. Markets near me\n0. Exit";

// Split at ". " so no screen shows half a claim and "50.00" stays whole.
function paginate(text: string, budget = BUDGET): string[] {
  const parts = text
    .split(/(?<=[.!?])\s+/)
    .flatMap((s) => (s.length <= budget ? [s] : pack(s.split(" "), budget, " ")));
  return pack(parts, budget, " ");
}

function pack(pieces: string[], budget: number, joiner: string): string[] {
  const pages: string[] = [];
  let cur = "";
  for (const p of pieces) {
    if (cur && (cur + joiner + p).length > budget) {
      pages.push(cur);
      cur = p;
    } else cur = cur ? `${cur}${joiner}${p}` : p;
  }
  if (cur) pages.push(cur);
  return pages;
}

function menu<T>(title: string, items: T[], page: number, label: (x: T) => string) {
  const shown = items.slice(page * PAGE, page * PAGE + PAGE);
  const more = (page + 1) * PAGE < items.length;
  return `${title}\n${shown.map((x, i) => `${i + 1}. ${label(x)}`).join("\n")}${more ? "\n9. More" : ""}\n0. Back`;
}

export function UssdSimulator({ crops, counties, towns }: Props) {
  const [state, setState] = useState<State>({ s: "idle" });
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const townsIn = (county: string) => towns.filter((t) => t.county === county);

  function screen(): string {
    switch (state.s) {
      case "idle":
        return `Dial ${CODE} to start.`;
      case "home":
        return HOME;
      case "crop":
        return menu("Which crop?", crops, state.page, (c) => c.name);
      case "county":
        return menu("Your county?", counties, state.page, (c) => c);
      case "town":
        return menu("Nearest town?", townsIn(state.county), state.page, (t) => t.name);
      case "quantity": {
        const c = crops.find((x) => x.id === state.crop)!;
        return `How many ${c.unit.plural}?\n(enter a number)\n0. Back`;
      }
      case "storage":
        return "Can you keep the harvest for a few weeks?\n1. Yes\n2. No\n0. Back";
      case "text":
        return `${state.pages[state.i]}\n${state.i < state.pages.length - 1 ? "1. More\n" : ""}${state.sms ? "2. SMS me this\n" : ""}${state.ask ? "3. Broker's offer\n" : ""}0. Main menu`;
      case "offer": {
        const c = crops.find((x) => x.id === state.ask.crop)!;
        return `What does the broker offer, in KSh a ${c.unit.kg > 1 ? "bag" : "kilo"}?\n(enter a number)\n0. Back`;
      }
      case "wait":
        return "Working it out…";
    }
  }

  async function call<T>(url: string): Promise<T | null> {
    setState({ s: "wait" });
    try {
      const res = await fetch(url);
      const body = await res.json();
      if (!res.ok) {
        setState({ s: "text", pages: paginate(body.error ?? "No answer for that choice."), i: 0 });
        return null;
      }
      return body as T;
    } catch {
      setState({ s: "text", pages: ["Network busy. Dial again in a moment."], i: 0 });
      return null;
    }
  }

  async function prices(crop: CropId, town: string) {
    const c = crops.find((x) => x.id === crop)!;
    const q = new URLSearchParams({ crop, town, quantity: String(c.defaultQuantity), storage: "0" });
    const rec = await call<Recommendation>(`/api/recommend?${q}`);
    if (!rec) return;
    const rows = rec.options
      .filter((o) => o.weeks === 0)
      .sort((a, b) => b.price - a.price)
      .map((o) => `${o.label} ${kg(o.price)} (${Math.round(o.km)}km)`);
    const title = `${c.name.replace(/\s*\(.*\)/, "")} near ${rec.town.name}, KSh/kg:`;
    setState({ s: "text", pages: pack(rows, BUDGET - title.length - 1, "\n").map((p) => `${title}\n${p}`), i: 0 });
  }

  async function sell(crop: CropId, town: string, quantity: number, storage: boolean) {
    const q = new URLSearchParams({ crop, town, quantity: String(quantity), storage: storage ? "1" : "0" });
    const rec = await call<Recommendation>(`/api/recommend?${q}`);
    if (rec) setState({ s: "text", pages: [rec.ussd, ...paginate(rec.evidence), ...rec.warnings.flatMap((w) => paginate(w))], i: 0, sms: rec.sms, ask: { crop, town, quantity, storage } });
  }

  async function compare(ask: Ask, offer: number) {
    const q = new URLSearchParams({ crop: ask.crop, town: ask.town, quantity: String(ask.quantity), storage: ask.storage ? "1" : "0", offer: String(offer) });
    const rec = await call<Recommendation>(`/api/recommend?${q}`);
    if (rec?.broker) setState({ s: "text", pages: paginate(`${rec.broker.headline}. ${rec.broker.evidence}`), i: 0, ask });
  }

  async function near(town: string) {
    const body = await call<{ town: Town; roads: (Road & { reporting: boolean })[] }>(`/api/markets?town=${encodeURIComponent(town)}`);
    if (!body) return;
    const list = body.roads.filter((r) => r.reporting).slice(0, 8).map((r) => `${marketName(r.market)} ${Math.round(r.km)}km`);
    const title = `Markets near ${body.town.name}:`;
    setState({ s: "text", pages: pack(list, BUDGET - title.length - 1, "\n").map((p) => `${title}\n${p}`), i: 0 });
  }

  function send(raw: string) {
    const r = raw.trim();
    const n = Number(r);
    setReply("");
    setError(null);
    const bad = () => setError("Reply with one of the numbers shown.");
    const pick = <T,>(items: T[], page: number): T | null =>
      Number.isInteger(n) && n >= 1 && n <= PAGE ? items[page * PAGE + n - 1] ?? null : null;
    const more = (items: unknown[], page: number) => r === "9" && (page + 1) * PAGE < items.length;

    switch (state.s) {
      case "idle":
        return setState({ s: "home" });
      case "home":
        if (r === "1") return setState({ s: "crop", flow: "prices", page: 0 });
        if (r === "2") return setState({ s: "crop", flow: "sell", page: 0 });
        if (r === "3") return setState({ s: "county", flow: "near", page: 0 });
        if (r === "0") return setState({ s: "idle" });
        return bad();
      case "crop": {
        if (r === "0") return setState(state.page ? { ...state, page: state.page - 1 } : { s: "home" });
        if (more(crops, state.page)) return setState({ ...state, page: state.page + 1 });
        const c = pick(crops, state.page);
        return c ? setState({ s: "county", flow: state.flow, crop: c.id, page: 0 }) : bad();
      }
      case "county": {
        if (r === "0") return setState(state.page ? { ...state, page: state.page - 1 } : state.crop ? { s: "crop", flow: state.flow, page: 0 } : { s: "home" });
        if (more(counties, state.page)) return setState({ ...state, page: state.page + 1 });
        const c = pick(counties, state.page);
        return c ? setState({ s: "town", flow: state.flow, crop: state.crop, county: c, page: 0 }) : bad();
      }
      case "town": {
        const list = townsIn(state.county);
        if (r === "0") return setState(state.page ? { ...state, page: state.page - 1 } : { s: "county", flow: state.flow, crop: state.crop, page: 0 });
        if (more(list, state.page)) return setState({ ...state, page: state.page + 1 });
        const t = pick(list, state.page);
        if (!t) return bad();
        if (state.flow === "near") return void near(t.id);
        if (state.flow === "prices") return void prices(state.crop!, t.id);
        return setState({ s: "quantity", crop: state.crop!, town: t.id });
      }
      case "quantity": {
        if (r === "0") return setState({ s: "crop", flow: "sell", page: 0 });
        if (!Number.isFinite(n) || n <= 0) return setError("Enter a number, for example 10.");
        const c = crops.find((x) => x.id === state.crop)!;
        return c.storable ? setState({ s: "storage", crop: state.crop, town: state.town, quantity: n }) : void sell(state.crop, state.town, n, false);
      }
      case "storage":
        if (r === "0") return setState({ s: "quantity", crop: state.crop, town: state.town });
        if (r === "1" || r === "2") return void sell(state.crop, state.town, state.quantity, r === "1");
        return bad();
      case "text":
        if (r === "1" && state.i < state.pages.length - 1) return setState({ ...state, i: state.i + 1 });
        if (r === "2" && state.sms) return setState({ s: "text", pages: [`SMS:\n${state.sms}`], i: 0 });
        if (r === "3" && state.ask) return setState({ s: "offer", ask: state.ask });
        if (r === "0") return setState({ s: "home" });
        return bad();
      case "offer":
        if (r === "0") return setState({ s: "home" });
        if (!Number.isFinite(n) || n <= 0) return setError("Enter the broker's price as a number, for example 3800.");
        return void compare(state.ask, n);
      case "wait":
        return;
    }
  }

  const idle = state.s === "idle";

  return (
    <section aria-label="USSD simulator" className="w-full">
      <h2 className="text-small font-medium">Try it on a basic phone</h2>
      <p className="mt-1 text-caption text-pretty text-subtle">
        The same answer on a basic phone: dial, then reply with numbers. This is a preview of the menu: replies and SMS show here
        instead of being sent.
      </p>
      <div className="mt-3 rounded-board border border-rule bg-card p-4">
        <pre aria-live="polite" className={`whitespace-pre-wrap font-sans text-small text-body ${idle ? "" : "min-h-36"}`}>
          {screen()}
        </pre>
        {error && <p className="mt-2 text-caption text-down-ink">{error}</p>}
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(reply);
            input.current?.focus();
          }}
        >
          {!idle && (
            <input
              ref={input}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              inputMode="numeric"
              aria-label="Reply"
              placeholder="Reply"
              disabled={state.s === "wait"}
              className="num h-11 min-w-0 flex-1 rounded-control border border-rule px-3"
            />
          )}
          <button
            type="submit"
            disabled={state.s === "wait"}
            className={`h-11 rounded-control px-4 text-small font-medium ${idle ? "flex-1 bg-mint text-body hover:bg-rule" : "border border-rule"}`}
          >
            {idle ? `Dial ${CODE}` : "Send"}
          </button>
          {!idle && (
            <button type="button" onClick={() => setState({ s: "idle" })} className="h-11 rounded-control px-3 text-small text-subtle">
              Cancel
            </button>
          )}
        </form>
      </div>
    </section>
  );
}

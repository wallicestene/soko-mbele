// Pure and deterministic: the app, the API and the USSD simulator all call recommend().
import { crop as cropDef, type CropDef, type CropId } from "./crops.ts";
import { tripCost, type Trip } from "./trip.ts";
import type { Costs, Forecast, PriceNow, QuietPrice, Road, Town } from "./types";

export type RecommendInput = {
  crop: CropId;
  quantity: number; // in the crop's selling unit (bags, kg)
  town: string; // Town.id
  storage: boolean;
  offer?: number; // broker's farm-gate offer, KSh/kg
};

export type EngineData = {
  asOf: string;
  towns: Town[];
  current: PriceNow[];
  quiet?: QuietPrice[]; // shown, never acted on
  forecasts: Forecast[];
  roads: Record<string, Road[]>; // nearest first
  costs: Costs;
};

export type Option = {
  id: string; // market|weeks
  market: string; // KAMIS name
  label: string;
  county: string;
  weeks: number; // 0 = sell today
  sellDate: string;
  price: number; // KSh/kg
  priceLow: number; // low end of the 80% range, or the lower of latest and typical
  priceHigh: number; // the higher of latest and typical
  priceSource: "observed" | "forecast";
  observed: string | null;
  km: number;
  hours: number; // one way, at lorry and matatu speed
  kg: number;
  gross: number;
  transport: number; // freight, loading, market fee, fare and time
  fare: number; // part of transport
  trip: Trip;
  storage: number;
  loss: number;
  net: number;
  netLow: number;
  netHigh: number;
  gainVsBaseline: number;
  gainLowVsBaseline: number;
};

export type Recommendation = {
  input: RecommendInput;
  asOf: string;
  crop: Pick<CropDef, "id" | "name" | "unit" | "storable">;
  town: Town;
  action: "sell_nearest" | "move" | "hold" | "hold_and_move";
  best: Option;
  baseline: Option; // sell today at the nearest market with a recent price
  baselineName: string;
  runnerUp: Option | null;
  threshold: number;
  options: Option[]; // ranked by worst case
  notCompared: { market: string; observed: string; km: number; estimate: number | null; likelyMiss: number | null }[];
  outOfLine: { market: string; km: number; why: "usually_high" | "above_neighbours"; ratio: number }[];
  headline: string;
  evidence: string;
  reasoning: string;
  ussd: string;
  sms: string; // at most 160 characters
  warnings: string[];
  // The lowest farm-gate offer worth taking, on the cautious numbers.
  walkAway: { perKg: number; perUnit: number; option: Option };
  broker: Broker | null;
};

// The broker collects, so the offer is all take-home; going yourself must beat it by the usual margin.
export type Broker = {
  offerPerKg: number;
  total: number;
  versus: Option;
  gain: number;
  gainLow: number;
  verdict: "sell_yourself" | "close" | "take_offer";
  headline: string;
  evidence: string;
};

export const FRESH_DAYS = 21; // older reported prices are not used for a sale today
const DAY = 86_400_000;

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
// KAMIS names some markets "Cheptiret - Uasin Gishu"; the county is shown separately.
export const marketLabel = (s: string) => s.replace(/\s+-\s+.*$/, "");
const cents = (x: number) => Math.round(x * 100) / 100;
const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * DAY).toISOString().slice(0, 10);

// A price this far out of line is a different grade or a typo.
export function tooHigh(p: PriceNow, c: Costs): "usually_high" | "above_neighbours" | null {
  if (p.usual_premium >= c.max_usual_premium) return "usually_high";
  if (p.nearby_median !== null && Math.min(p.wholesale, p.typical) > c.max_nearby_ratio * p.nearby_median) return "above_neighbours";
  return null;
}
export const tooLow = (p: PriceNow, c: Costs) => p.nearby_median !== null && Math.max(p.wholesale, p.typical) * c.max_nearby_ratio < p.nearby_median;

export function recommend(input: RecommendInput, data: EngineData): Recommendation {
  const { quantity, storage: canStore } = input;
  const { costs, asOf } = data;
  const crop = cropDef(input.crop);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new RangeError("quantity must be a positive number");
  const town = data.towns.find((t) => t.id === input.town);
  if (!town) throw new RangeError(`Unknown town: ${input.town}`);
  const reach = data.roads[town.id] ?? [];
  const kg = quantity * crop.unit.kg;

  const hoursOf = (road: Road) => road.hours * costs.road_time_factor;
  // Same-day trips only; fresh produce gets a shorter road.
  const maxHours = crop.storable ? costs.max_trip_hours : costs.max_trip_hours_fresh;
  const dayTrip = (road: Road) => hoursOf(road) <= maxHours;

  const build = (market: string, county: string, weeks: number, price: number, priceLow: number, priceHigh: number, source: Option["priceSource"], observed: string | null, road: Road) => {
    const trip = tripCost(kg, road.km, hoursOf(road), county, costs);
    const transport = trip.total;
    const fare = trip.fare;
    const storage = cents(weeks * costs.storage_per_kg_week * kg);
    const loss = (p: number) => cents(p * kg * crop.lossRatePerWeek * weeks);
    return {
      id: `${market}|${weeks}`,
      market,
      label: marketLabel(market),
      county,
      weeks,
      sellDate: addDays(asOf, weeks * 7),
      price,
      priceLow,
      priceHigh,
      priceSource: source,
      observed,
      km: road.km,
      hours: Math.round(hoursOf(road) * 10) / 10,
      kg,
      gross: cents(price * kg),
      transport,
      fare,
      trip,
      storage,
      loss: loss(price),
      net: cents(price * kg - transport - storage - loss(price)),
      netLow: cents(priceLow * kg - transport - storage - loss(priceLow)),
      netHigh: cents(priceHigh * kg - transport - storage - loss(priceHigh)),
    };
  };

  type Raw = ReturnType<typeof build>;
  const today: Raw[] = [];
  const notCompared: Recommendation["notCompared"] = [];
  for (const road of reach) {
    const p = data.current.find((c) => c.crop === crop.id && c.market === road.market);
    if (!p || daysBetween(p.observed, asOf) > FRESH_DAYS) {
      const q = data.quiet?.find((c) => c.crop === crop.id && c.market === road.market);
      const observed = q?.last_observed ?? p?.observed;
      if (observed && dayTrip(road)) notCompared.push({ market: road.market, observed, km: road.km, estimate: q?.estimate ?? null, likelyMiss: q?.likely_miss ?? null });
      continue;
    }
    // One report can be off, so the decision also weighs the 4-week typical price.
    today.push(build(p.market, p.county, 0, p.wholesale, Math.min(p.wholesale, p.typical), Math.max(p.wholesale, p.typical), "observed", p.observed, road));
  }
  if (!today.length) {
    throw new RangeError(`No market near ${town.name} has a price for ${crop.name.toLowerCase()} from the last three weeks. Try another crop or a bigger town nearby.`);
  }
  // The baseline may be beyond a day's trip: a remote farm still has to sell somewhere.
  let baseRaw = today.reduce((a, b) => (b.km < a.km ? b : a));
  // One low typo at the nearest market must not send the farmer on a trip.
  const near = data.current.find((c) => c.crop === crop.id && c.market === baseRaw.market)!;
  const lifted = tooLow(near, costs) ? near.nearby_median : null;
  if (lifted !== null) {
    const road = reach.find((r) => r.market === baseRaw.market)!;
    const i = today.indexOf(baseRaw);
    today[i] = baseRaw = build(near.market, near.county, 0, lifted, lifted, lifted, "observed", near.observed, road);
  }
  // Far above the country all year, or above its neighbours today: a different grade or a typo, never a destination.
  const doubt = (market: string): Recommendation["outOfLine"][number] | null => {
    const p = data.current.find((c) => c.crop === crop.id && c.market === market);
    if (!p || market === baseRaw.market) return null;
    const why = tooHigh(p, costs);
    if (!why) return null;
    return { market, km: 0, why, ratio: why === "usually_high" ? p.usual_premium : Math.min(p.wholesale, p.typical) / p.nearby_median! };
  };
  const inLine = (market: string) => doubt(market) === null;
  const outOfLine = today.filter((o) => o.hours <= maxHours && !inLine(o.market)).map((o) => ({ ...doubt(o.market)!, km: o.km }));
  const reachable = today.filter((o) => o === baseRaw || (o.hours <= maxHours && inLine(o.market)));

  const waits: Raw[] = [];
  if (crop.storable && canStore) {
    for (const f of data.forecasts) {
      if (f.crop !== crop.id) continue;
      const road = reach.find((r) => r.market === f.market);
      if (!road || (!dayTrip(road) && f.market !== baseRaw.market) || !inLine(f.market)) continue;
      // A forecast inherits a high latest report, so its low end is scaled back to the typical price.
      const now = data.current.find((c) => c.crop === crop.id && c.market === f.market);
      const caution = now ? Math.min(1, now.typical / now.wholesale) : 1;
      waits.push(build(f.market, f.county, f.horizon_days / 7, f.predicted_price, f.lower * caution, f.predicted_price, "forecast", null, road));
    }
  }

  // Cautious gain: the other market at its low, the nearest at its high.
  const withGain = (o: Raw): Option => ({ ...o, gainVsBaseline: cents(o.net - baseRaw.net), gainLowVsBaseline: cents(o.netLow - baseRaw.netHigh) });
  const baseline = withGain(baseRaw);
  const all = [...reachable, ...waits].map(withGain);

  // Best worst case wins: a smallholder can't absorb a bad bet.
  const threshold = Math.max(costs.min_gain_ksh, costs.min_gain_share * baseline.gross);
  const byWorstCase = (a: Option, b: Option) => b.netLow - a.netLow || b.net - a.net;
  const best = all.filter((o) => o.id !== baseline.id && o.gainLowVsBaseline >= threshold).sort(byWorstCase)[0] ?? baseline;

  const bestWait = new Map<string, Option>();
  for (const o of all.filter((o) => o.weeks > 0)) {
    const cur = bestWait.get(o.market);
    if (!cur || byWorstCase(o, cur) < 0) bestWait.set(o.market, o);
  }
  const options = [...all.filter((o) => o.weeks === 0), ...bestWait.values()].sort(byWorstCase);
  const runnerUp = options.find((o) => o.id !== baseline.id) ?? null;

  const action: Recommendation["action"] =
    best.id === baseline.id ? "sell_nearest" : best.weeks === 0 ? "move" : best.market === baseline.market ? "hold" : "hold_and_move";

  const move = options.find((o) => o.weeks === 0 && o.id !== baseline.id) ?? null;
  const closer = notCompared.filter((n) => n.km < baseline.km).sort((a, b) => a.km - b.km);
  const baselineName = closer.length ? "the nearest market with a recent price" : "your nearest market";
  const words = explain({ action, best, baseline, baselineName, move, threshold, crop, quantity, canStore });
  return {
    input,
    asOf,
    crop: { id: crop.id, name: crop.name, unit: crop.unit, storable: crop.storable },
    town,
    action,
    best,
    baseline,
    baselineName,
    runnerUp,
    threshold,
    options,
    notCompared: notCompared.sort((a, b) => a.km - b.km),
    outOfLine: outOfLine.sort((a, b) => a.km - b.km),
    ...words,
    reasoning: `${words.headline}. ${words.evidence}`,
    sms: smsText(action, best, baseline, crop, quantity),
    walkAway: walkAwayFor(best, crop),
    broker: input.offer === undefined ? null : brokerFor(input.offer, best, crop, quantity, costs),
    warnings: [
      ...(lifted !== null
        ? [`${baseline.label} reported ${aKilo(near.wholesale)}, far below the markets around it (${aKilo(lifted)}), so we count ${aKilo(lifted)} there. Check the price before you decide.`]
        : []),
      ...(closer.length
        ? [
            `${marketLabel(closer[0].market)} is ${closer[0].km < 1 ? "in your town" : `closer (${km(closer[0].km)})`} but has not reported a price for ${crop.name.toLowerCase().replace(/\s*\(.*\)/, "")} since ${longDay(closer[0].observed, asOf)}.` +
              (closer[0].estimate !== null
                ? ` At today's prices it would probably pay about ${aKilo(closer[0].estimate)}, but that could be ${Math.round(100 * closer[0].likelyMiss!)}% out either way.`
                : "") +
              ` Ask there before you travel.`,
          ]
        : []),
      ...(baseline.hours > maxHours ? [`Your nearest market with a recent price is ${km(baseline.km)} away, about ${Math.round(baseline.hours)} hours by road.`] : []),
    ],
  };
}

// The broker at the gate

function walkAwayFor(best: Option, crop: CropDef): Recommendation["walkAway"] {
  const perKg = Math.max(0, best.netLow / best.kg);
  return { perKg: cents(perKg), perUnit: cents(perKg * crop.unit.kg), option: best };
}

export function brokerFor(offerPerKg: number, versus: Option, crop: CropDef, quantity: number, costs: Costs): Broker {
  if (!Number.isFinite(offerPerKg) || offerPerKg <= 0) throw new RangeError("offer must be a positive number");
  const total = cents(offerPerKg * versus.kg);
  const gain = cents(versus.net - total);
  const gainLow = cents(versus.netLow - total);
  const margin = Math.max(costs.min_gain_ksh, costs.min_gain_share * total);
  const verdict: Broker["verdict"] = gainLow >= margin ? "sell_yourself" : gain > 0 ? "close" : "take_offer";
  const qty = quantityText(crop, quantity);
  const where = `${versus.label}${versus.weeks ? ` in ${weeksText(versus.weeks)}` : ""}`;
  const walk = unitPrice(walkAwayFor(versus, crop).perUnit, crop);
  const offer = unitPrice(offerPerKg * crop.unit.kg, crop);
  const words =
    verdict === "sell_yourself"
      ? {
          headline: `Selling at ${where} gets you ${ksh(gain)} more than the broker's offer`,
          evidence:
            `The broker offers ${ksh(total)} for ${qty} at your farm (${offer}). ` +
            `${where} leaves you about ${ksh(versus.net)} after the trip${versus.weeks ? " and storage" : ""}` +
            (Math.round(versus.netLow) < Math.round(versus.net) ? `, and at least ${ksh(versus.netLow)} if prices come in low. ` : ". ") +
            `If you would rather sell at the gate, ask the broker for at least ${walk}.`,
        }
      : verdict === "close"
        ? {
            headline: "The broker's offer is about as good as selling yourself",
            evidence:
              `${where} would leave you only ${ksh(gain)} more than the broker's ${ksh(total)}, after the trip, and prices can move that much in a week. ` +
              `Taking the offer saves you the trip. If you can, ask for ${walk}.`,
          }
        : {
            headline: "Take the broker's offer",
            evidence: `It beats every market once transport is paid: ${where}, the best of them, would leave you ${ksh(-gain)} less than the broker's ${ksh(total)}.`,
          };
  return { offerPerKg: cents(offerPerKg), total, versus, gain, gainLow, verdict, ...words };
}

export const unitPrice = (perUnit: number, c: Pick<CropDef, "unit">) =>
  c.unit.kg > 1 ? `${ksh(perUnit)} a bag` : `KSh ${perUnit.toFixed(2)} a kilo`;

// Words

export const ksh = (n: number) => `KSh ${Math.round(n).toLocaleString("en-KE")}`;
const perKg = (n: number) => `${n.toFixed(2)}/kg`; // SMS
const aKilo = (n: number) => `KSh ${n.toFixed(2)} a kilo`;
// "3 Sept" in the data's own year, "30 Sept 2025" before it.
const longDay = (iso: string, asOf: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(iso.slice(0, 4) !== asOf.slice(0, 4) ? { year: "numeric" } : {}), timeZone: "UTC" });
const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const weeksText = (w: number) => `${w} week${w === 1 ? "" : "s"}`;
const km = (n: number) => `${Math.round(n)} km`;
const hoursText = (h: number) => (h < 1 ? `${Math.max(10, Math.round((h * 60) / 10) * 10)} minutes` : `${Math.round(h * 2) / 2} hours`.replace(/^1 hours/, "1 hour"));

export function quantityText(c: Pick<CropDef, "unit">, q: number) {
  if (c.unit.kg === 1) return `${q.toLocaleString("en-KE")} kg`;
  return `${q} bag${q === 1 ? "" : "s"}`;
}

// "× 60 bags (5,400 kg)", so the weight is never read as a price.
export function weighed(c: Pick<CropDef, "unit">, q: number) {
  if (c.unit.kg === 1) return `× ${q.toLocaleString("en-KE")} kg`;
  return `× ${quantityText(c, q)} (${(q * c.unit.kg).toLocaleString("en-KE")} kg)`;
}

export const tripWords = (t: Trip) => `${t.vehicle.replace(/^paying /, "")}, loading, market fees${t.fare ? ", your fare" : ""} and your time`;

function smsText(action: Recommendation["action"], best: Option, base: Option, crop: CropDef, quantity: number): string {
  const name = crop.name.replace(/\s*\(.*\)/, "").toLowerCase();
  const text =
    action === "move"
      ? `Soko Mbele: Sell ${name} at ${best.label} today, not ${base.label}. You get ${ksh(best.gainVsBaseline)} more for ${quantityText(crop, quantity)} after transport (${km(best.km)}). ${best.label} paid ${perKg(best.price)} on ${day(best.observed!)}.`
      : action === "sell_nearest"
        ? `Soko Mbele: Sell ${name} at ${base.label} today, ${perKg(base.price)}. No market pays more once transport is paid. About ${ksh(base.net)} for ${quantityText(crop, quantity)}.`
        : `Soko Mbele: Keep your ${name} ${weeksText(best.weeks)}, then sell at ${best.label}. Likely ${ksh(best.gainVsBaseline)} more for ${quantityText(crop, quantity)} after costs, at least ${ksh(best.gainLowVsBaseline)}.`;
  if (text.length <= 160) return text;
  // Cut at the last full sentence that fits, never mid-word.
  const cut = text.lastIndexOf(". ", 159);
  return cut > 40 ? text.slice(0, cut + 1) : `${text.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

const NO_WAIT = "Waiting would not pay enough to be worth it.";
function waitingNote(a: { crop: CropDef; canStore: boolean }): string {
  return a.crop.storable && a.canStore ? ` ${NO_WAIT}` : "";
}

function explain(a: {
  action: Recommendation["action"];
  best: Option;
  baseline: Option;
  baselineName: string;
  move: Option | null;
  threshold: number;
  crop: CropDef;
  quantity: number;
  canStore: boolean;
}): { headline: string; evidence: string; ussd: string } {
  const { action, best, baseline: base, crop, quantity } = a;
  const qty = quantityText(crop, quantity);

  if (action === "move") {
    return {
      headline: `Sell today at ${best.label}`,
      evidence:
        `${best.label} paid ${aKilo(best.price)} on ${day(best.observed!)}. ${base.label}, ${a.baselineName}, paid ${aKilo(base.price)}. ` +
        `${best.label} is ${km(best.km)} away (about ${hoursText(best.hours)}), so the trip costs about ${ksh(best.transport)} instead of ${ksh(base.transport)}. ` +
        `Even after that, you take home ${ksh(best.gainVsBaseline)} more.` +
        waitingNote(a),
      ussd: `Sell at ${best.label} today: +${ksh(best.gainVsBaseline)} for ${qty} vs ${base.label}, after transport (${km(best.km)}).`,
    };
  }
  if (action === "hold" || action === "hold_and_move") {
    return {
      headline: `Wait ${weeksText(best.weeks)}, then sell at ${best.label}`,
      evidence:
        `We expect ${best.label} to pay about ${aKilo(best.price)} on ${day(best.sellDate)}, and probably not less than ${aKilo(best.priceLow)}. ` +
        `Today ${base.label} pays ${aKilo(base.price)}. Keeping the harvest until then costs about ${ksh(best.storage + best.loss)}. ` +
        `You should make about ${ksh(best.gainVsBaseline)} more, and at least ${ksh(best.gainLowVsBaseline)} more even if prices come in low.`,
      ussd: `Wait ${best.weeks} wk, sell at ${best.label}: +${ksh(best.gainVsBaseline)} for ${qty} expected, at least +${ksh(best.gainLowVsBaseline)}.`,
    };
  }

  const lines = [`${base.label} pays ${aKilo(base.price)} (reported ${day(base.observed!)}). You take home about ${ksh(base.net)} for ${qty} after ${ksh(base.transport)} transport.`];
  const { move } = a;
  if (move && move.gainVsBaseline > 0) {
    lines.push(
      `${move.label} pays ${aKilo(move.price)}, but it is ${km(move.km)} away. After transport you would make only ${ksh(move.gainVsBaseline)} more ` +
        `(${Math.round((100 * move.gainVsBaseline) / base.gross)}%). Prices often move that much in a week, so it is not worth the trip.`,
    );
  } else if (move) {
    lines.push(`${move.label} pays ${aKilo(move.price)}, but it is ${km(move.km)} away. After transport you would take home ${ksh(-move.gainVsBaseline)} less.`);
  } else {
    lines.push(`No other market nearby has a recent price.`);
  }
  if (!crop.storable) lines.push(`Fresh produce can't wait, so selling now is best.`);
  else if (a.canStore) lines.push(NO_WAIT);
  return {
    headline: `Sell today at ${base.label}, ${a.baselineName}`,
    evidence: lines.join(" "),
    ussd: `Sell at ${base.label} today: about ${ksh(base.net)} for ${qty} after transport. No market pays more once transport is paid.`,
  };
}

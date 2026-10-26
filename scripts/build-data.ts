// Builds data/*.json and the model's training rows (data/ml/) from data/raw/.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CROPS, type CropId } from "../lib/crops.ts";
import { Costs, Markets, Prices, Quality, Roads, Towns, type FlagReason, type PriceNow, type QuietPrice } from "../lib/types.ts";

const RAW = "data/raw";
// VALIDATE=1 trains to 2023 and scores 2024, so settings are chosen without touching the 2025-26 test.
const VALIDATE = process.env.VALIDATE === "1";
const TRAIN_END = VALIDATE ? "2023-12-25" : "2024-12-30"; // last Monday of training before the walk-forward test
const TEST_END = VALIDATE ? "2024-12-30" : "9999-12-31";
const HORIZONS = [1, 2, 3, 4]; // weeks ahead
const MAX_STALENESS = 3; // weeks; an older last price is not a usable "current" price
const RECENT_DAYS = 90; // a market is in the app if it reported within this window
const MAX_TRIP_KM = 300; // roads kept per town
const RAIN_NORMAL_YEARS = [2005, 2020]; // the "normal" rain is from years before any test period

// Utilities

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

// KAMIS publishes "53.33/Kg", "30.00/Kgs", "80.00/kg", and "-" for missing.
function parsePrice(s: string): number | null {
  const t = s.replace(/\/kgs?$/i, "").trim();
  if (t === "" || t === "-") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round = (x: number, dp = 2) => Math.round(x * 10 ** dp) / 10 ** dp;
const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const group = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) (m.get(key(x)) ?? m.set(key(x), []).get(key(x))!).push(x);
  return m;
};

// Weeks are numbered from Monday 2005-01-03 and named by their Monday.
const EPOCH = Date.UTC(2005, 0, 3);
const DAY = 86_400_000;
const weekOf = (iso: string) => Math.floor((Date.parse(iso) - EPOCH) / (7 * DAY));
const weekDate = (w: number) => new Date(EPOCH + w * 7 * DAY).toISOString().slice(0, 10);
const addDays = (iso: string, d: number) => new Date(Date.parse(iso) + d * DAY).toISOString().slice(0, 10);

function write(path: string, schema: { parse: (x: unknown) => unknown }, value: unknown) {
  writeFileSync(path, JSON.stringify(schema.parse(value)) + "\n");
  console.log(`wrote ${path}`);
}

// 1. clean KAMIS

type Row = {
  market: string;
  county: string;
  crop: CropId;
  date: string;
  wholesale: number | null;
  retail: number | null;
  supply: number | null;
};

let rowsIngested = 0;
let missingWholesale = 0;
const rows: Row[] = [];
const flagged: Quality["flagged"] = [];
const flagCounts: Record<FlagReason, number> = {
  retail_below_wholesale: 0,
  likely_per_bag_price: 0,
  implausibly_low: 0,
  outlier_vs_national: 0,
  not_a_market: 0,
};
const flag = (r: Row, reason: FlagReason) => {
  flagCounts[reason]++;
  flagged.push({ market: r.market, county: r.county, crop: r.crop, date: r.date, wholesale: r.wholesale, retail: r.retail, reason });
};

for (const c of CROPS) {
  const parsed: Row[] = [];
  for (const raw of parseCsv(readFileSync(`${RAW}/${c.file}`, "utf8"))) {
    rowsIngested++;
    if (c.id === "maize" && raw.Classification === "Yellow Maize") continue;
    const r: Row = {
      market: raw.Market.trim(),
      county: raw.County.replace(/-/g, " ").trim(),
      crop: c.id,
      date: raw.Date,
      wholesale: parsePrice(raw.Wholesale),
      retail: parsePrice(raw.Retail),
      supply: parsePrice(raw["Supply Volume"]),
    };
    if (r.wholesale === null) { missingWholesale++; continue; }
    // KAMIS's live data carries a test entry ("test market", county "test").
    if (/^test\b/i.test(r.market) || /^test$/i.test(r.county)) { flag(r, "not_a_market"); continue; }
    parsed.push(r);
  }
  // Judged per crop: KSh 80/kg is normal for beans and a typo for cabbages.
  const typical = median(parsed.map((r) => r.wholesale!));
  for (const r of parsed) {
    if (r.retail !== null && r.retail < r.wholesale!) flag(r, "retail_below_wholesale"); // kept: wholesale is what we model
    if (r.wholesale! > typical * 8) { flag(r, "likely_per_bag_price"); continue; }
    if (r.wholesale! < typical * 0.2) { flag(r, "implausibly_low"); continue; }
    rows.push(r);
  }
}

// National weekly median per crop, then drop rows far from it.
const prelim = group(rows, (r) => `${r.crop}|${weekOf(r.date)}`);
const clean = rows.filter((r) => {
  const peers = prelim.get(`${r.crop}|${weekOf(r.date)}`)!;
  if (peers.length < 5) return true;
  const ratio = r.wholesale! / median(peers.map((p) => p.wholesale!));
  if (ratio < 0.5 || ratio > 2) { flag(r, "outlier_vs_national"); return false; }
  return true;
});

// 2. weekly series

const series = new Map<string, Map<number, number>>(); // "crop|market" -> week -> median price
for (const [k, rs] of group(clean, (r) => `${r.crop}|${r.market}`)) {
  series.set(k, new Map([...group(rs, (r) => String(weekOf(r.date)))].map(([w, ps]) => [Number(w), median(ps.map((p) => p.wholesale!))])));
}

// A loop, not Math.max(...rows): spreading 400k values overflows the stack.
let lastWeek = -Infinity, firstWeek = Infinity;
for (const r of clean) {
  const w = weekOf(r.date);
  if (w > lastWeek) lastWeek = w;
  if (w < firstWeek) firstWeek = w;
}

// National level: median across markets' weekly prices, carried forward up to 4 weeks.
const national = new Map<CropId, Float64Array>();
for (const c of CROPS) {
  const byWeek = new Map<number, number[]>();
  for (const [k, m] of series) if (k.startsWith(c.id + "|")) for (const [w, p] of m) (byWeek.get(w) ?? byWeek.set(w, []).get(w)!).push(p);
  const arr = new Float64Array(lastWeek + 1).fill(NaN);
  for (const [w, ps] of byWeek) if (ps.length >= 3) arr[w] = median(ps);
  let last = NaN, age = 99;
  for (let w = firstWeek; w <= lastWeek; w++) {
    if (!Number.isNaN(arr[w])) { last = arr[w]; age = 0; }
    else if (++age <= 4) arr[w] = last;
  }
  national.set(c.id, arr);
}

// 3. seasonality

// Monthly pattern from data up to TRAIN_END only; maize and beans from World Bank RTFP, the rest from KAMIS.
const rtfp = parseCsv(readFileSync(`${RAW}/rtfp_national_monthly.csv`, "utf8"));

function seasonalProfile(monthly: Map<string, number>): number[] {
  const months = [...monthly.keys()].sort();
  const shift = (m: string, k: number) => {
    const d = new Date(m + "-01T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() + k);
    return d.toISOString().slice(0, 7);
  };
  const dev: number[][] = Array.from({ length: 12 }, () => []);
  for (const m of months) {
    const window = Array.from({ length: 13 }, (_, i) => monthly.get(shift(m, i - 6)));
    if (window.some((v) => v === undefined)) continue;
    const w = window as number[];
    const trend = (w[0] + w[12]) / 24 + w.slice(1, 12).reduce((a, b) => a + b, 0) / 12;
    dev[Number(m.slice(5)) - 1].push(monthly.get(m)! - trend);
  }
  if (dev.some((d) => d.length < 2)) return new Array(12).fill(0);
  const s = dev.map(mean);
  const c = mean(s);
  return s.map((x) => x - c);
}

const seasonal = new Map<CropId, number[]>();
for (const c of CROPS) {
  const monthly = new Map<string, number>();
  if ("rtfpColumn" in c && c.rtfpColumn) {
    for (const r of rtfp) if (r[c.rtfpColumn] && r.month <= TRAIN_END.slice(0, 7)) monthly.set(r.month, Math.log(Number(r[c.rtfpColumn])));
  } else {
    for (const [m, rs] of group(clean.filter((r) => r.crop === c.id && r.date <= TRAIN_END), (r) => r.date.slice(0, 7)))
      if (rs.length >= 10) monthly.set(m, Math.log(median(rs.map((r) => r.wholesale!))));
  }
  seasonal.set(c.id, seasonalProfile(monthly));
}
// Interpolated between month mid-points.
function seasonAt(crop: CropId, w: number) {
  const d = new Date(EPOCH + w * 7 * DAY + 3 * DAY);
  const pos = d.getUTCMonth() + (d.getUTCDate() - 15) / 30; // 0 = mid-January
  const s = seasonal.get(crop)!;
  const lo = Math.floor(pos);
  const f = pos - lo;
  return s[(lo + 12) % 12] * (1 - f) + s[(lo + 13) % 12] * f;
}

// 4. rainfall

// Rain is compared with the 2005-2020 normal for the same days of the year: a dry July is not news, a dry April is.
const countyKey = (s: string) =>
  s.toLowerCase().replace(/'/g, "").replace(/[-\s]+/g, " ").trim().replace(/^tharaka nithi$/, "tharaka");
const rainRaw = JSON.parse(readFileSync(`${RAW}/rain.json`, "utf8")) as { start: string; counties: Record<string, { mm: (number | null)[] }> };
const RAIN_START = Date.parse(rainRaw.start);
const dayIndex = (iso: string) => Math.round((Date.parse(iso) - RAIN_START) / DAY);
type RainCounty = { cum: Float64Array; normal: Record<number, Float64Array> };
const rain = new Map<string, RainCounty>();
for (const [name, { mm }] of Object.entries(rainRaw.counties)) {
  const cum = new Float64Array(mm.length + 1);
  for (let d = 0; d < mm.length; d++) cum[d + 1] = cum[d] + (mm[d] ?? 0); // the rare missing day counts as dry
  const normal: Record<number, Float64Array> = {};
  for (const span of [28, 84]) {
    const sums = Array.from({ length: 366 }, () => [] as number[]);
    for (let d = span; d < mm.length; d++) {
      const date = new Date(RAIN_START + d * DAY);
      const y = date.getUTCFullYear();
      if (y < RAIN_NORMAL_YEARS[0] || y > RAIN_NORMAL_YEARS[1]) continue;
      sums[Math.floor((date.getTime() - Date.UTC(y, 0, 1)) / DAY)].push(cum[d] - cum[d - span]);
    }
    normal[span] = Float64Array.from(sums, (s, i) => (s.length ? mean(s) : mean(sums[i - 1])));
  }
  rain.set(countyKey(name), { cum, normal });
}
// log(rain / normal) over `span` days: 0 normal, -0.7 half, +0.7 double.
function rainAnomaly(county: string, iso: string, span: number) {
  const c = rain.get(countyKey(county));
  const d = dayIndex(iso);
  if (!c || d - span < 0 || d >= c.cum.length) return NaN;
  const date = new Date(Date.parse(iso));
  const doy = Math.min(365, Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / DAY));
  return Math.log((c.cum[d] - c.cum[d - span] + 10) / (c.normal[span][doy] + 10));
}
// Mean over all counties, for crops that travel.
const nationalRain = new Map<number, number>();
function nationalRainAnomaly(w: number) {
  if (!nationalRain.has(w)) {
    const xs = [...rain.keys()].map((k) => rainAnomaly(k, weekDate(w), 84)).filter(Number.isFinite);
    nationalRain.set(w, xs.length ? mean(xs) : NaN);
  }
  return nationalRain.get(w)!;
}

// 5. model inputs

// Every input is known when the forecast is made; the target is the log price change over h weeks.
type Example = {
  crop: CropId;
  market: string;
  county: string;
  origin: number; // week the forecast is made
  h: number;
  base: number; // last observed price at origin
  x: number[];
  y: number; // log(actual / base); NaN when the target is unobserved
  actual: number;
  seasonalNaive: number | null;
};

const FEATURES = [
  "spread_vs_usual", // market vs the national price, beyond its usual premium
  "county_spread", // market vs the other markets in its county this fortnight
  "own_vs_52w", // price vs its own median over the past year
  "own_change_1w",
  "own_momentum_4w",
  "own_volatility_12w",
  "national_momentum_4w",
  "national_momentum_prev_4w",
  "national_vs_52w_mean",
  "seasonal_expected_change", // the usual move for this time of year
  "staleness_weeks",
  "rain_4w_anomaly", // the market's county
  "rain_12w_anomaly",
  "national_rain_12w_anomaly",
  "target_month",
  "crop_code", // categorical: trees learn each crop's own habits
];

function lastObs(m: Map<number, number>, w: number, maxBack: number): [number, number] | null {
  for (let b = 0; b <= maxBack; b++) if (m.has(w - b)) return [w - b, m.get(w - b)!];
  return null;
}

const marketCounty = new Map(clean.map((r) => [`${r.crop}|${r.market}`, r.county]));
const countyPeers = new Map<string, string[]>();
for (const k of series.keys()) {
  const [crop, market] = k.split("|");
  const ck = `${crop}|${countyKey(marketCounty.get(k)!)}`;
  (countyPeers.get(ck) ?? countyPeers.set(ck, []).get(ck)!).push(market);
}
const cropIndex = new Map(CROPS.map((c, i) => [c.id, i]));

function makeExample(key: string, m: Map<number, number>, origin: number, h: number): Example | null {
  const [crop, market] = key.split("|") as [CropId, string];
  const county = marketCounty.get(key)!;
  const nat = national.get(crop)!;
  const last = lastObs(m, origin, MAX_STALENESS);
  if (!last) return null;
  const [lw, base] = last;
  const n0 = nat[origin], n4 = nat[origin - 4], n8 = nat[origin - 8];
  if (![n0, n4, n8].every(Number.isFinite)) return null;
  let n52 = 0, c52 = 0;
  for (let b = 0; b < 52; b++) if (Number.isFinite(nat[origin - b])) { n52 += Math.log(nat[origin - b]); c52++; }
  if (c52 < 26) return null;
  // Only the gap beyond a market's usual premium is expected to close (Nairobi always trades above Meru).
  const spreads: number[] = [], own: number[] = [], moves: number[] = [];
  for (let w = origin - 52; w < lw; w++) {
    if (!m.has(w)) continue;
    own.push(m.get(w)!);
    if (Number.isFinite(nat[w])) spreads.push(Math.log(m.get(w)! / nat[w]));
    if (w >= origin - 12 && m.has(w - 1)) moves.push(Math.abs(Math.log(m.get(w)! / m.get(w - 1)!)));
  }
  if (spreads.length < 6) return null;
  const prev = lastObs(m, lw - 4, 8);
  const prev1 = m.get(lw - 1);
  const peers: number[] = [];
  for (const p of countyPeers.get(`${crop}|${countyKey(county)}`) ?? []) {
    if (p === market) continue;
    const o = lastObs(series.get(`${crop}|${p}`)!, origin, 1);
    if (o) peers.push(o[1]);
  }
  const actual = m.get(origin + h);
  const sn = lastObs(m, origin + h - 52 + 1, 2); // same week last year, +-1 week
  const forecastDay = weekDate(origin);
  return {
    crop, market, county, origin, h, base,
    x: [
      Math.log(base / n0) - median(spreads),
      peers.length ? Math.log(base / median(peers)) : NaN,
      Math.log(base / median(own)),
      prev1 !== undefined ? Math.log(base / prev1) : NaN,
      prev ? Math.log(base / prev[1]) : NaN,
      moves.length >= 4 ? median(moves) : NaN,
      Math.log(n0 / n4),
      Math.log(n4 / n8),
      Math.log(n0) - n52 / c52,
      seasonAt(crop, origin + h) - seasonAt(crop, lw),
      origin - lw,
      rainAnomaly(county, forecastDay, 28),
      rainAnomaly(county, forecastDay, 84),
      nationalRainAnomaly(origin),
      new Date(EPOCH + (origin + h) * 7 * DAY).getUTCMonth() + 1,
      cropIndex.get(crop)!,
    ],
    y: actual === undefined ? NaN : Math.log(actual / base),
    actual: actual ?? NaN,
    seasonalNaive: sn ? sn[1] : null,
  };
}

const examples: Example[] = [];
for (const [key, m] of series) {
  const weeks = [...m.keys()];
  const lo = Math.min(...weeks) + 8, hi = Math.max(...weeks);
  for (let origin = lo; origin <= hi; origin++)
    for (const h of HORIZONS) {
      const e = makeExample(key, m, origin, h);
      if (e && Number.isFinite(e.y)) examples.push(e);
    }
}

// CSV for the trainer: identifiers, the inputs, the target and the two baselines.
const sig = (x: number) => (Number.isFinite(x) ? String(Math.round(x * 1e6) / 1e6) : "");
function toCsv(es: Example[]) {
  const head = ["crop", "market", "county", "origin_week", "target_date", "h", "base", ...FEATURES, "y", "actual", "seasonal_naive"];
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = es.map((e) =>
    [e.crop, q(e.market), q(e.county), e.origin, weekDate(e.origin + e.h), e.h, sig(e.base), ...e.x.map(sig), sig(e.y), sig(e.actual), e.seasonalNaive === null ? "" : sig(e.seasonalNaive)].join(","),
  );
  return [head.join(","), ...lines].join("\n") + "\n";
}

// 6. markets

const asOf = clean.reduce((m, r) => (r.date > m ? r.date : m), "");
const originWeek = weekOf(asOf);
const recentCut = addDays(asOf, -RECENT_DAYS);

const geo = JSON.parse(readFileSync(`${RAW}/geo.json`, "utf8")) as {
  markets: Record<string, { lat: number; lon: number; county: string; approximate: boolean }>;
  roads: Record<string, Record<string, [number, number]>>;
};
// Markets that reported in the last two years; quiet ones are shown with an estimate.
const lastReport = new Map<string, string>();
for (const r of clean) if ((lastReport.get(r.market) ?? "") < r.date) lastReport.set(r.market, r.date);
const markets = Object.entries(geo.markets)
  .filter(([name]) => lastReport.has(name))
  .map(([name, g]) => ({
    name,
    county: g.county,
    lat: round(g.lat, 4),
    lon: round(g.lon, 4),
    approximate: g.approximate,
    last_reported: lastReport.get(name)!,
    reporting: lastReport.get(name)! >= recentCut,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
const inApp = new Set(markets.map((m) => m.name));

// 7. current prices, history, rows to forecast

const current: PriceNow[] = [];
for (const [k, rs] of group(clean.filter((r) => r.date >= recentCut && inApp.has(r.market)), (r) => `${r.crop}|${r.market}`)) {
  const [crop, market] = k.split("|") as [CropId, string];
  const latestDate = rs.reduce((m, r) => (r.date > m ? r.date : m), "");
  const day = rs.filter((r) => r.date === latestDate);
  const retail = day.map((r) => r.retail).filter((x): x is number => x !== null);
  const supply = day.map((r) => r.supply).filter((x): x is number => x !== null);
  const weekly = series.get(k)!;
  const recentWeeks = [...weekly].filter(([w]) => w > originWeek - 8).sort((a, b) => b[0] - a[0]).slice(0, 4).map(([, p]) => p);
  const nat = national.get(crop)!;
  const yearSpreads = [...weekly].filter(([w]) => w > originWeek - 52 && Number.isFinite(nat[w])).map(([w, p]) => Math.log(p / nat[w]));
  current.push({
    market,
    county: day[0].county,
    crop,
    observed: latestDate,
    wholesale: round(median(day.map((r) => r.wholesale!))),
    typical: round(recentWeeks.length ? median(recentWeeks) : median(day.map((r) => r.wholesale!))),
    usual_premium: round(yearSpreads.length >= 6 ? Math.exp(median(yearSpreads)) : 1, 3),
    retail: retail.length ? round(median(retail)) : null,
    supply_volume: supply.length ? round(median(supply)) : null,
    nearby_median: null,
  });
}

// Nearby markets can't stay far apart for long, so the engine distrusts a price far from this median.
const NEARBY_KM = 50; // straight line
const FRESH_DAYS = 21;
const where = new Map(markets.map((m) => [m.name, m]));
const haversine = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const freshCut = addDays(asOf, -FRESH_DAYS);
// Markets placed at their county's centre compare with their county instead.
const isNear = (a: (typeof markets)[number], b: (typeof markets)[number]) =>
  a.approximate || b.approximate ? a.county === b.county : haversine(a, b) <= NEARBY_KM;
for (const p of current) {
  const here = where.get(p.market);
  if (!here) continue;
  const near = current.filter((q) => {
    const there = where.get(q.market);
    return q.crop === p.crop && q.market !== p.market && q.observed >= freshCut && there !== undefined && isNear(here, there);
  });
  if (near.length >= 2) p.nearby_median = round(median(near.map((q) => q.wholesale)));
}

const history = current.flatMap(({ market, crop }) => {
  const points = [...(series.get(`${crop}|${market}`) ?? [])]
    .filter(([w]) => w > originWeek - 26)
    .sort((a, b) => a[0] - b[0])
    .map(([w, p]) => ({ week: weekDate(w), price: round(p) }));
  return points.length ? [{ market, crop, points }] : [];
});

// Quiet markets: last price × the national change since. Its typical miss is measured on past silences; shown, never used to choose.
const SILENCES = [4, 8, 13, 26, 52, 104]; // weeks
const nowcastMiss = SILENCES.map((L) => {
  const misses: number[] = [];
  for (const [k, m] of series) {
    const nat = national.get(k.split("|")[0] as CropId)!;
    for (const [w, p] of m) {
      if (w < weekOf("2021-07-01") || !m.has(w - L) || !Number.isFinite(nat[w]) || !Number.isFinite(nat[w - L])) continue;
      misses.push(Math.abs((m.get(w - L)! * nat[w]) / nat[w - L] - p) / p);
    }
  }
  return misses.length >= 500 ? median(misses) : NaN;
});
const missAfter = (weeks: number) => {
  const i = SILENCES.findIndex((L) => weeks <= L);
  const v = nowcastMiss[i === -1 ? SILENCES.length - 1 : i];
  return Number.isFinite(v) ? v : nowcastMiss.filter(Number.isFinite).at(-1)!;
};
const quietCut = addDays(asOf, -730);
const freshCut21 = addDays(asOf, -21);
const quiet: QuietPrice[] = [];
for (const [k, rs] of group(clean.filter((r) => inApp.has(r.market) && r.date >= quietCut), (r) => `${r.crop}|${r.market}`)) {
  const [crop, market] = k.split("|") as [CropId, string];
  const lastDate = rs.reduce((m, r) => (r.date > m ? r.date : m), "");
  if (lastDate >= freshCut21) continue; // still reporting
  const m = series.get(k)!;
  const lw = weekOf(lastDate);
  const nat = national.get(crop)!;
  let now = originWeek;
  while (now > lw && !Number.isFinite(nat[now])) now--;
  if (!m.has(lw) || !Number.isFinite(nat[lw]) || now === lw) continue;
  quiet.push({
    market,
    county: rs[0].county,
    crop,
    last_price: round(m.get(lw)!),
    last_observed: lastDate,
    estimate: round((m.get(lw)! * nat[now]) / nat[lw]),
    likely_miss: round(missAfter(originWeek - lw), 3),
  });
}
console.log("quiet-market estimate, median miss by weeks silent:", Object.fromEntries(SILENCES.map((L, i) => [L, round(nowcastMiss[i], 3)])));

// What train.py forecasts from: every market with a recent price, today.
const live: Example[] = current.flatMap(({ market, crop }) =>
  HORIZONS.flatMap((h) => makeExample(`${crop}|${market}`, series.get(`${crop}|${market}`)!, originWeek, h) ?? []),
);

const ML = VALIDATE ? "data/ml/validate" : "data/ml";
mkdirSync(ML, { recursive: true });
writeFileSync(`${ML}/examples.csv`, toCsv(examples));
writeFileSync(`${ML}/live.csv`, toCsv(live));
writeFileSync(
  `${ML}/meta.json`,
  JSON.stringify({ as_of: asOf, origin_week: originWeek, train_end_week: weekOf(TRAIN_END), test_end_week: Math.min(lastWeek, weekOf(TEST_END)), epoch: weekDate(0), horizons: HORIZONS, features: FEATURES, categorical: ["crop_code"], crops: CROPS.map((c) => c.id) }, null, 1) + "\n",
);
console.log(`wrote ${ML}/: ${examples.length} training rows, ${live.length} rows to forecast`);
if (VALIDATE) process.exit(0);

// 8. farm towns, roads, costs

// Main towns plus every OpenStreetMap suburb and village; the first spelling of a place wins.
type RawPlace = { name: string; county: string | null; lat: number; lon: number; osm_id: number; place?: string };
const rawTowns = JSON.parse(readFileSync(`${RAW}/towns.json`, "utf8")) as RawPlace[];
const rawPlaces = JSON.parse(readFileSync(`${RAW}/places.json`, "utf8")) as RawPlace[];
const seen = new Set<string>();
const seenOsm = new Set<number>();
const towns = [...rawTowns.map((t) => ({ ...t, place: "town" })), ...rawPlaces].flatMap((t) => {
  const reach = geo.roads[String(t.osm_id)];
  if (!t.county || !reach || seenOsm.has(t.osm_id)) return [];
  seenOsm.add(t.osm_id);
  const county = t.county.replace(/[–-]/g, " ").replace(/\s+/g, " "); // "Taita–Taveta" -> "Taita Taveta", as KAMIS spells it
  // OpenStreetMap has several points for some places (four "Tala"); a farmer needs one.
  const id = slug(`${t.name}-${county}`);
  if (seen.has(id)) return [];
  seen.add(id);
  const name = t.name.replace(/^\p{Ll}/u, (c) => c.toUpperCase()); // OSM has some names in lower case ("muguga")
  return [{ id, name, county, lat: round(t.lat, 4), lon: round(t.lon, 4), main: t.place === "city" || t.place === "town", osm: String(t.osm_id) }];
});
const marketIndex = new Map(markets.map((m, i) => [m.name, i]));
const roads = {
  source: "Road distance and drive time from OpenStreetMap (Overpass, Nominatim, OSRM routing)",
  markets: markets.map((m) => m.name),
  from: Object.fromEntries(
    towns.map((t) => {
      const all = Object.entries(geo.roads[t.osm])
        .filter(([m]) => marketIndex.has(m))
        .map(([market, [km, hours]]) => [marketIndex.get(market)!, km, hours] as [number, number, number])
        .sort((a, b) => a[1] - b[1]);
      // Plus the nearest three reporting markets, so a remote place still gets an answer.
      const nearestReporting = new Set(all.filter(([m]) => markets[m].reporting).slice(0, 3).map(([m]) => m));
      return [t.id, all.filter(([m, km]) => km <= MAX_TRIP_KM || nearestReporting.has(m))];
    }),
  ),
};

// Planning estimates from published Kenyan figures, set at KSh 227.76/l diesel; each rate's fuel share follows diesel.json.
const dieselRaw = JSON.parse(readFileSync(`${RAW}/diesel.json`, "utf8")) as { place: string; prices: { from: string; ksh_per_litre: number }[] };
const latestDiesel = dieselRaw.prices.filter((p) => p.from <= asOf).sort((a, b) => b.from.localeCompare(a.from))[0] ?? dieselRaw.prices[0];
const DIESEL = { ksh_per_litre: latestDiesel.ksh_per_litre, reference_ksh_per_litre: 227.76, from: latestDiesel.from, place: dieselRaw.place };
const costs = {
  transport_modes: [
    // Traders paid KSh 152 a bag over 73 km in 2021; with diesel doubled since, this makes 73 km KSh 244. No boda: ~15× a lorry per tonne-km.
    { id: "shared", label: "paying per bag on a produce lorry or matatu", charged: "per_bag", max_kg: 900, max_km: 1000, base: 40, per_km: 2.8, fuel_share: 0.4, farmer_rides: false },
    // 1.8 t pickup at about 10 km/l, there and back: 100 km costs KSh 9,500, inside the KSh 8,000-15,000 a day firms quote.
    { id: "pickup", label: "in a hired pickup", charged: "per_trip", max_kg: 1800, max_km: 1000, base: 2500, per_km: 70, fuel_share: 0.65, farmer_rides: true },
    // 10 t lorry at about 3.5 km/l, there and back: 100 km costs KSh 20,000, about KSh 180 a bag when full.
    { id: "lorry", label: "in a hired lorry", charged: "per_trip", max_kg: 10000, max_km: 3000, base: 5000, per_km: 150, fuel_share: 0.85, farmer_rides: true },
  ],
  diesel: DIESEL,
  handling_per_bag: 60, // KSh 30 to load, 30 to offload; Mombasa loaders asked KSh 35 per 50 kg bag in 2025
  market_fee_per_bag: 20, // county cess averaged KSh 17 a bag where maize is grown (Tegemeo, 2018)
  market_fee_city_per_bag: 70, // and KSh 64-70 a bag entering Mombasa and Nairobi
  city_market_counties: ["Nairobi", "Mombasa"],
  fare_per_km: 4, // matatu fares: Nairobi-Eldoret (323 km) KSh 1,000-1,700, Nairobi-Western about 1,500
  farmer_day_ksh: 385, // a day of the farmer's time: the 2026 agricultural minimum wage, unskilled
  working_day_hours: 8,
  road_time_factor: 1.5, // OSRM times are a car's; a loaded lorry with stops is about half as slow again
  max_trip_hours: 4, // each way: go, sell and be home the same day
  max_trip_hours_fresh: 3, // tomatoes and kales do not take a long, hot road well
  storage_per_kg_week: round(12 / 90, 5), // Warehouse Receipt System: KSh 48 a bag for the first month
  // A gain must beat a normal week's price movement: "no change" misses next week by 8.6% on average.
  min_gain_ksh: 1000,
  min_gain_share: 0.1,
  max_usual_premium: 1.4, // 40% above the national price all year: a different grade or measure, not a bargain
  max_nearby_ratio: 1.4, // 40% away from the markets within 50 km today: a typo or a different unit, not a bargain
  sources: [
    { what: "Cost by vehicle: motorbike, pickup, lorry", source: "Hine et al., Overcoming the first mile (Nyeri transporter survey)", url: "https://www.gov.uk/research-for-development-outputs/overcoming-the-first-mile-lessons-from-farmers-in-kenya-and-tanzania", year: "2015" },
    { what: "Maize transport cost per bag", source: "Economics of open-air sun drying in the maize value chain of Kenya", url: "https://www.sciencedirect.com/science/article/pii/S2666154321000879", year: "2021" },
    { what: "Pickup hire per day", source: "Bamm Tours, 2-tonne pickup hire, Nairobi", url: "https://bammtours.co.ke/cars/2-tonne-pick-up-truck-for-hire-nairobi/", year: "2026" },
    { what: "Diesel price", source: "EPRA pump prices", url: "https://www.epra.go.ke/pump-prices", year: "2026" },
    { what: "Transport price inflation (15.7%)", source: "KNBS consumer price index, via People Daily", url: "https://peopledaily.digital/business/knbs-consumer-index-transport-costs-outpace-food-as-kenyas-biggest-inflation-driver", year: "2026" },
    { what: "County produce cess per bag", source: "Tegemeo Institute, working paper 69", url: "https://tegemeo.egerton.ac.ke/images/_tegemeo_institute/downloads/publications/working_papers/wp69_2018.pdf", year: "2018" },
    { what: "Loading rates per bag", source: "The Standard, cargo loaders' pay", url: "https://thestandard.ke/business/amp/coast/article/2001525176/cargo-loaders-stage-protests-over-poor-pay", year: "2025" },
    { what: "Matatu and shuttle fares", source: "Nairobi News, holiday fares", url: "https://nairobinews.nation.africa/?p=275820", year: "2024" },
    { what: "Farm minimum wage", source: "Grant Thornton Kenya wages guide", url: "https://www.grantthornton.co.ke/globalassets/1.-member-firms/kenya/insights/pdf/wages-guide-2026.pdf", year: "2026" },
    { what: "Storage fee per bag", source: "Warehouse Receipt System, via Logistics Business Africa", url: "https://www.logisticsbusinessafrica.co.za/warehouse-receipt-system-in-kenya-open-doors-to-maize-farmers/", year: "unknown" },
  ],
};

// 9. data quality

function monthlyCorrelation(c: CropId, col: string): [number, number] {
  const rt = new Map(rtfp.filter((r) => r[col]).map((r) => [r.month, Math.log(Number(r[col]))]));
  const pairs = [...group(clean.filter((r) => r.crop === c), (r) => r.date.slice(0, 7))]
    .filter(([m, ps]) => rt.has(m) && ps.length >= 20)
    .map(([m, ps]) => [Math.log(median(ps.map((p) => p.wholesale!))), rt.get(m)!]);
  const ax = mean(pairs.map((p) => p[0])), ay = mean(pairs.map((p) => p[1]));
  const cov = mean(pairs.map(([x, y]) => (x - ax) * (y - ay)));
  const sx = Math.sqrt(mean(pairs.map(([x]) => (x - ax) ** 2))), sy = Math.sqrt(mean(pairs.map(([, y]) => (y - ay) ** 2)));
  return [round(cov / (sx * sy), 3), pairs.length];
}
const [corrMaize, monthsMaize] = monthlyCorrelation("maize", "maize_median");
const [corrBeans] = monthlyCorrelation("beans", "beans_median");

// Months with almost no maize rows since reporting became dense in mid-2021.
const monthly = new Map<string, number>();
for (const r of rows) if (r.crop === "maize" && r.date >= "2021-01") monthly.set(r.date.slice(0, 7), (monthly.get(r.date.slice(0, 7)) ?? 0) + 1);
const reportingGaps: { from: string; to: string; rows: number }[] = [];
for (let d = new Date([...monthly.keys()].sort()[0] + "-01T00:00:00Z"); d.toISOString().slice(0, 7) <= asOf.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) {
  const m = d.toISOString().slice(0, 7);
  const n = monthly.get(m) ?? 0;
  if (n >= 30) continue;
  const last = reportingGaps.at(-1);
  const prevMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
  if (last && last.to === prevMonth) { last.to = m; last.rows += n; }
  else reportingGaps.push({ from: m, to: m, rows: n });
}

const quality = {
  generated: asOf,
  sources: [
    { name: "KAMIS, Ministry of Agriculture", role: `Observed wholesale and retail prices for ${CROPS.length} crops; ground truth for the model`, url: "https://kamis.kilimo.go.ke/site/market" },
    { name: "World Bank RTFP (KEN_2021_RTFP_v02_M)", role: "Modelled monthly estimates, 2007-2026; seasonal pattern for maize and beans, and a cross-check", url: "https://microdata.worldbank.org/index.php/catalog/6167" },
    { name: "NASA POWER", role: "Daily rainfall since 2005 for every county; dry and wet spells are model inputs", url: "https://power.larc.nasa.gov/" },
    { name: "geoBoundaries (KEN ADM1)", role: "The 47 county boundaries, to place rainfall readings", url: "https://www.geoboundaries.org/" },
    { name: "OpenStreetMap (Overpass, Nominatim, OSRM)", role: "Farm towns, market locations and road distances", url: "https://www.openstreetmap.org/copyright" },
  ],
  rows_ingested: rowsIngested,
  rows_clean: clean.length,
  missing_wholesale: missingWholesale,
  markets_covered: new Set(clean.map((r) => r.market)).size,
  counties_covered: new Set(clean.map((r) => r.county)).size,
  date_range: [clean.reduce((m, r) => (r.date < m ? r.date : m), "9999"), asOf],
  flag_counts: flagCounts,
  reporting_gaps: reportingGaps,
  rtfp_correlation: { maize: corrMaize, beans: corrBeans, months: monthsMaize },
  flagged: flagged.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 250),
};

// Write

write("data/markets.json", Markets, markets);
write("data/towns.json", Towns, towns.map(({ id, name, county, lat, lon, main }) => ({ id, name, county, lat, lon, main })));
write("data/roads.json", Roads, roads);
write("data/costs.json", Costs, costs);
write("data/prices.json", Prices, { as_of: asOf, current, quiet, history });
write("data/quality.json", Quality, quality);
console.log({ asOf, rowsIngested, clean: clean.length, markets: markets.length, towns: towns.length, current: current.length, examples: examples.length });

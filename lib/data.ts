// Server-only. A malformed data file throws here, at build time, not on a farmer's screen.
import backtestJson from "@/data/backtest.json";
import costsJson from "@/data/costs.json";
import forecastsJson from "@/data/forecasts.json";
import marketsJson from "@/data/markets.json";
import modelJson from "@/data/model.json";
import pricesJson from "@/data/prices.json";
import qualityJson from "@/data/quality.json";
import roadsJson from "@/data/roads.json";
import townsJson from "@/data/towns.json";
import { CROPS } from "./crops";
import type { EngineData, Recommendation } from "./engine";
import { Backtest, Costs, Forecasts, Markets, ModelInfo, Prices, Quality, Roads, Towns, type Road } from "./types";

export const markets = Markets.parse(marketsJson);
export const towns = Towns.parse(townsJson);
const roadTable = Roads.parse(roadsJson);
export const roads = {
  source: roadTable.source,
  from: Object.fromEntries(
    Object.entries(roadTable.from).map(([id, rs]) => [id, rs.map(([m, km, hours]): Road => ({ market: roadTable.markets[m], km, hours }))]),
  ),
};
// The short list for the homepage and phone menu.
export const mainTowns = towns.filter((t) => t.main);
export const reportingMarkets = markets.filter((m) => m.reporting);
export const costs = Costs.parse(costsJson);
export const prices = Prices.parse(pricesJson);
export const forecasts = Forecasts.parse(forecastsJson);
export const backtest = Backtest.parse(backtestJson);
export const quality = Quality.parse(qualityJson);
export const model = ModelInfo.parse(modelJson);

export const engineData: EngineData = {
  asOf: prices.as_of,
  towns,
  current: prices.current,
  quiet: prices.quiet,
  forecasts,
  roads: roads.from,
  costs,
};

export const cropChoices = CROPS.filter((c) => prices.current.some((p) => p.crop === c.id)).map((c) => ({
  id: c.id,
  name: c.name,
  group: c.group,
  unit: c.unit,
  defaultQuantity: c.defaultQuantity,
  storable: c.storable,
}));
export type CropChoice = (typeof cropChoices)[number];

export const counties = [...new Set(towns.map((t) => t.county))].sort();

export function chartsFor(rec: Recommendation) {
  const wanted = [...new Set([rec.baseline.market, rec.best.market])];
  return wanted.map((market) => ({
    market,
    history: prices.history.find((h) => h.crop === rec.crop.id && h.market === market)?.points.slice(-12) ?? [],
    forecasts: forecasts.filter((f) => f.crop === rec.crop.id && f.market === market).sort((a, b) => a.horizon_days - b.horizon_days),
  }));
}
export type ChartData = ReturnType<typeof chartsFor>;

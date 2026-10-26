// Every figure the pages state comes from the data, never typed by hand.
import { crop } from "./crops";
import { backtest, cropChoices, engineData, markets, prices, quality, reportingMarkets, towns } from "./data";
import { FRESH_DAYS, marketLabel, recommend } from "./engine";

const DAY = 86_400_000;
const fresh = (observed: string) => (Date.parse(prices.as_of) - Date.parse(observed)) / DAY <= FRESH_DAYS;

export const DEMO = { crop: "maize" as const, town: "meru-meru", quantity: 10, storage: true };

export function demoRecommendation() {
  return recommend(DEMO, engineData);
}

export function maizeSpread() {
  const today = prices.current.filter((p) => p.crop === "maize" && fresh(p.observed)).sort((a, b) => a.wholesale - b.wholesale);
  const low = today[0];
  const high = today[today.length - 1];
  return {
    markets: today.length,
    low: { market: marketLabel(low.market), county: low.county, price: low.wholesale },
    high: { market: marketLabel(high.market), county: high.county, price: high.wholesale },
  };
}

export function coverage() {
  return {
    crops: cropChoices.length,
    markets: reportingMarkets.length,
    marketCounties: new Set(reportingMarkets.map((m) => m.county)).size,
    towns: towns.length,
    counties: new Set(towns.map((t) => t.county)).size,
    reports: quality.rows_ingested,
    asOf: prices.as_of,
  };
}

export function forecastHeadline() {
  const two = backtest.metrics.find((m) => m.horizon_weeks === 2)!;
  return {
    held: Math.round(two.band_coverage * 100),
    model: two.model_mae,
    naive: two.naive_mae,
    seasonal: two.seasonal_mae,
    lessThanSeasonal: Math.round((1 - two.model_mae / two.seasonal_mae) * 100),
    directionHit: Math.round(two.direction_hit * 100),
    allBetter: backtest.metrics.every((m) => m.model_mae < m.naive_mae),
    forecasts: two.n,
    crops: backtest.by_crop.length,
    trainEnd: backtest.train_end,
    testStart: backtest.test_start,
    testEnd: backtest.test_end,
    // The series with the most test weeks.
    series: [...backtest.series].sort((a, b) => b.points.length - a.points.length)[0],
  };
}

export const marketNames = () => [...new Set(markets.map((m) => marketLabel(m.name)))].sort();

export const cropName = (id: string) => crop(id).name;

export function postedMaize() {
  return prices.current
    .filter((p) => p.crop === "maize" && fresh(p.observed))
    .map((p) => ({ market: marketLabel(p.market), price: p.wholesale }))
    .sort((a, b) => a.market.localeCompare(b.market));
}

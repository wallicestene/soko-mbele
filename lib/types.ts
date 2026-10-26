// The data contract: every file in data/ is validated against these on write and on load.
import { z } from "zod";
import { CROP_IDS } from "./crops.ts";

export const Crop = z.enum(CROP_IDS);
export type Crop = z.infer<typeof Crop>;

export const Confidence = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof Confidence>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Price = z.number().positive(); // KSh per kg

export const Market = z.object({
  name: z.string(),
  county: z.string(),
  lat: z.number(),
  lon: z.number(),
  approximate: z.boolean(), // placed at its county's centre
  last_reported: IsoDate,
  reporting: z.boolean(), // within the last 90 days
});
export type Market = z.infer<typeof Market>;
export const Markets = z.array(Market);

export const Town = z.object({
  id: z.string(),
  name: z.string(),
  county: z.string(),
  lat: z.number(),
  lon: z.number(),
  main: z.boolean(),
});
export type Town = z.infer<typeof Town>;
export const Towns = z.array(Town);

export const Road = z.object({ market: z.string(), km: z.number().nonnegative(), hours: z.number().nonnegative() });
export type Road = z.infer<typeof Road>;
// Compact on disk: [market index, km, hours] per place.
export const Roads = z.object({
  source: z.string(),
  markets: z.array(z.string()),
  from: z.record(z.string(), z.array(z.tuple([z.number().int().nonnegative(), z.number().nonnegative(), z.number().nonnegative()]))),
});
export type Roads = z.infer<typeof Roads>;

// Hired vehicles are charged per trip (empty return included); shared transport per 90 kg bag.
export const TransportMode = z.object({
  id: z.enum(["shared", "pickup", "lorry"]),
  label: z.string(), // "in a hired pickup"
  charged: z.enum(["per_trip", "per_bag"]),
  max_kg: z.number().positive(),
  max_km: z.number().positive(),
  base: z.number().nonnegative(), // KSh per trip or per bag
  per_km: z.number().nonnegative(), // at the reference diesel price
  fuel_share: z.number().min(0).max(1), // part of per_km that follows diesel
  farmer_rides: z.boolean(), // so pays no fare
});
export type TransportMode = z.infer<typeof TransportMode>;

export const CostSource = z.object({ what: z.string(), source: z.string(), url: z.string().url(), year: z.string() });

export const Costs = z.object({
  transport_modes: z.array(TransportMode).min(1),
  diesel: z.object({ ksh_per_litre: z.number().positive(), reference_ksh_per_litre: z.number().positive(), from: IsoDate, place: z.string() }),
  handling_per_bag: z.number().nonnegative(),
  market_fee_per_bag: z.number().nonnegative(),
  market_fee_city_per_bag: z.number().nonnegative(),
  city_market_counties: z.array(z.string()),
  fare_per_km: z.number().nonnegative(), // each way
  farmer_day_ksh: z.number().nonnegative(),
  working_day_hours: z.number().positive(),
  road_time_factor: z.number().min(1), // loaded lorry vs a car
  max_trip_hours: z.number().positive(), // one way
  max_trip_hours_fresh: z.number().positive(),
  storage_per_kg_week: z.number().nonnegative(),
  min_gain_ksh: z.number().nonnegative(),
  min_gain_share: z.number().min(0).max(1),
  max_usual_premium: z.number().min(1),
  max_nearby_ratio: z.number().min(1),
  sources: z.array(CostSource),
});
export type Costs = z.infer<typeof Costs>;

export const PriceNow = z.object({
  market: z.string(),
  county: z.string(),
  crop: Crop,
  observed: IsoDate,
  wholesale: Price, // latest report
  typical: Price, // median of the last 4 weeks
  usual_premium: z.number().positive(), // vs the national median over the past year (1 = in line)
  nearby_median: Price.nullable(), // other markets within 50 km; null with fewer than two
  retail: Price.nullable(),
  supply_volume: z.number().nonnegative().nullable(),
});
export type PriceNow = z.infer<typeof PriceNow>;

export const PricePoint = z.object({ week: IsoDate, price: Price });
export type PricePoint = z.infer<typeof PricePoint>;

// Last price × the national change since; shown, never acted on.
export const QuietPrice = z.object({
  market: z.string(),
  county: z.string(),
  crop: Crop,
  last_price: Price,
  last_observed: IsoDate,
  estimate: Price,
  likely_miss: z.number().min(0).max(1),
});
export type QuietPrice = z.infer<typeof QuietPrice>;

export const Prices = z.object({
  as_of: IsoDate,
  current: z.array(PriceNow),
  quiet: z.array(QuietPrice),
  history: z.array(
    z.object({ market: z.string(), crop: Crop, points: z.array(PricePoint) }),
  ),
});
export type Prices = z.infer<typeof Prices>;

export const Forecast = z
  .object({
    market: z.string(),
    county: z.string(),
    crop: Crop,
    date: IsoDate,
    horizon_days: z.number().int().positive(),
    predicted_price: Price,
    confidence: Confidence,
    lower: Price,
    upper: Price,
  })
  .refine((f) => f.lower <= f.predicted_price && f.predicted_price <= f.upper, {
    message: "expected lower <= predicted_price <= upper",
  });
export type Forecast = z.infer<typeof Forecast>;
export const Forecasts = z.array(Forecast);

export const HorizonMetrics = z.object({
  horizon_weeks: z.number().int().positive(),
  n: z.number().int().nonnegative(),
  model_mae: z.number(),
  model_mape: z.number(),
  naive_mae: z.number(),
  naive_mape: z.number(),
  seasonal_mae: z.number(),
  seasonal_mape: z.number(),
  band_coverage: z.number().min(0).max(1),
  big_moves: z.number().int().nonnegative(), // moves of 10% or more
  direction_hit: z.number().min(0).max(1),
  gain_ksh: z.number(), // KSh/kg closer than "no change"
  gain_low: z.number(), // 95% interval, 1,000 week resamples
  gain_high: z.number(),
  beat_share: z.number().min(0).max(1),
});
export type HorizonMetrics = z.infer<typeof HorizonMetrics>;

export const BacktestPoint = z.object({
  date: IsoDate,
  actual: Price,
  predicted: Price,
  lower: Price,
  upper: Price,
  naive: Price,
});
export type BacktestPoint = z.infer<typeof BacktestPoint>;

export const CropMetrics = z.object({
  crop: Crop,
  n: z.number().int().nonnegative(),
  model_mae: z.number(),
  naive_mae: z.number(),
  seasonal_mae: z.number(),
  model_mape: z.number(),
  band_coverage: z.number().min(0).max(1),
});
export type CropMetrics = z.infer<typeof CropMetrics>;

export const Backtest = z.object({
  model: z.string(),
  train_end: IsoDate,
  test_start: IsoDate,
  test_end: IsoDate,
  band: z.string(),
  metrics: z.array(HorizonMetrics),
  by_crop: z.array(CropMetrics), // 14-day horizon
  series: z.array(
    z.object({
      market: z.string(),
      crop: Crop,
      horizon_weeks: z.number().int().positive(),
      points: z.array(BacktestPoint),
    }),
  ),
});
export type Backtest = z.infer<typeof Backtest>;

export const ModelInfo = z.object({
  algorithm: z.string(),
  library: z.string(),
  objective: z.string(),
  trees: z.number().int().positive(),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])),
  horizons_weeks: z.array(z.number().int().positive()),
  training_rows: z.record(z.string(), z.number().int().nonnegative()),
  examples: z.number().int().nonnegative(),
  trained_on: IsoDate,
  importance: z.array(z.object({ feature: z.string(), share: z.number().min(0).max(1) })),
  checks: z.object({
    shuffled: z.object({ rows: z.number().int(), real_mae: z.number(), shuffled_mae: z.number(), naive_mae: z.number() }),
    behaviour: z.record(
      z.enum(["above_usual", "below_usual"]),
      z.object({ rows: z.number().int(), predicted_change: z.number(), actual_change: z.number(), moved_as_expected: z.number().min(0).max(1) }),
    ),
  }),
});
export type ModelInfo = z.infer<typeof ModelInfo>;

export const FlagReason = z.enum([
  "retail_below_wholesale",
  "likely_per_bag_price",
  "implausibly_low",
  "outlier_vs_national",
  "not_a_market",
]);
export type FlagReason = z.infer<typeof FlagReason>;

export const Quality = z.object({
  generated: IsoDate,
  sources: z.array(z.object({ name: z.string(), role: z.string(), url: z.string() })),
  rows_ingested: z.number().int(),
  rows_clean: z.number().int(),
  missing_wholesale: z.number().int(),
  markets_covered: z.number().int(),
  counties_covered: z.number().int(),
  date_range: z.tuple([IsoDate, IsoDate]),
  flag_counts: z.record(FlagReason, z.number().int()),
  reporting_gaps: z.array(z.object({ from: z.string(), to: z.string(), rows: z.number().int() })),
  rtfp_correlation: z.object({ maize: z.number(), beans: z.number(), months: z.number().int() }),
  flagged: z.array(
    z.object({
      market: z.string(),
      county: z.string(),
      crop: Crop,
      date: IsoDate,
      wholesale: z.number().nullable(),
      retail: z.number().nullable(),
      reason: FlagReason,
    }),
  ),
});
export type Quality = z.infer<typeof Quality>;

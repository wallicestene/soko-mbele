// Last step of `pnpm data`: a bad training run fails here, not on a farmer's screen.
import { readFileSync } from "node:fs";
import { Backtest, Costs, Forecasts, Markets, ModelInfo, Prices, Quality, Roads, Towns } from "../lib/types.ts";

const files = { markets: Markets, towns: Towns, roads: Roads, costs: Costs, prices: Prices, forecasts: Forecasts, backtest: Backtest, model: ModelInfo, quality: Quality };
for (const [name, schema] of Object.entries(files)) schema.parse(JSON.parse(readFileSync(`data/${name}.json`, "utf8")));
console.log(`checked ${Object.keys(files).length} data files`);

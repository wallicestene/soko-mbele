"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { kg, shortDate } from "@/lib/format";
import type { Forecast, PricePoint } from "@/lib/types";

// Rounds to multiples of 5 so ticks land on numbers people read prices in.
export function niceDomain(values: number[]): [number, number] {
  const lo = Math.min(...values), hi = Math.max(...values), pad = (hi - lo) * 0.08 || 2;
  return [Math.max(0, Math.floor((lo - pad) / 5) * 5), Math.ceil((hi + pad) / 5) * 5];
}

export function niceTicks([lo, hi]: [number, number]): number[] {
  const step = [5, 10, 20, 50].find((s) => (hi - lo) / s <= 5) ?? 100;
  const ticks: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t);
  return ticks;
}

export function forecastTakeaway(lastPrice: number, f: Forecast) {
  const change = f.predicted_price / lastPrice - 1;
  const range = `most likely between KSh ${Math.round(f.lower)} and KSh ${Math.round(f.upper)} a kilo`;
  if (Math.abs(change) < 0.02) return `We expect the price here to stay about the same until ${shortDate(f.date)}, ${range}.`;
  return `We expect the price here to ${change > 0 ? "rise" : "fall"} about ${Math.round(Math.abs(change) * 100)}% by ${shortDate(f.date)}, ${range}.`;
}

export function ForecastChart({ history, forecasts }: { history: PricePoint[]; forecasts: Forecast[] }) {
  const last = history.at(-1);
  const end = forecasts.at(-1);
  const data = [
    // The last reported week starts the forecast line too, so the two join.
    ...history.map((p) =>
      p === last ? { date: p.week, actual: p.price, predicted: p.price, band: [p.price, p.price] as [number, number] } : { date: p.week, actual: p.price },
    ),
    ...forecasts.map((f) => ({ date: f.date, predicted: f.predicted_price, band: [f.lower, f.upper] as [number, number] })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ ...d, t: Date.parse(d.date) }));

  const values = [...history.map((p) => p.price), ...forecasts.flatMap((f) => [f.lower, f.upper])];

  return (
    <figure className="flex flex-col gap-3">
      {last && end && <figcaption className="text-copy font-medium text-pretty">{forecastTakeaway(last.price, end)}</figcaption>}
      <div className="h-60 w-full" role="img" aria-label={`Weekly prices and the forecast range for the next ${forecasts.length} weeks`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t: number) => shortDate(new Date(t).toISOString().slice(0, 10))}
              tick={{ fill: "var(--subtle)", fontSize: 13 }}
              axisLine={{ stroke: "var(--rule)" }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={niceDomain(values)}
              ticks={niceTicks(niceDomain(values))}
              tick={{ fill: "var(--subtle)", fontSize: 13 }}
              className="num"
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              formatter={(v, name) =>
                Array.isArray(v) ? [`${kg(Number(v[0]))}–${kg(Number(v[1]))}`, "Range"] : [kg(Number(v)), name === "actual" ? "Reported" : "Likely"]
              }
              labelFormatter={(t) => shortDate(new Date(Number(t)).toISOString().slice(0, 10))}
              contentStyle={{ borderRadius: 4, border: "1px solid var(--rule)", boxShadow: "none", fontSize: 14 }}
            />
            <Area dataKey="band" stroke="none" fill="var(--subtle)" fillOpacity={0.16} isAnimationActive={false} />
            <Line dataKey="actual" stroke="var(--body)" strokeWidth={2} dot={{ r: 2.5, fill: "var(--body)" }} connectNulls isAnimationActive={false} />
            <Line dataKey="predicted" stroke="var(--body)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            {last && (
              <ReferenceLine
                x={Date.parse(last.week)}
                stroke="var(--rule)"
                label={{ value: "Last price", position: "insideTopRight", fill: "var(--subtle)", fontSize: 13 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-caption text-subtle">
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-0.5 w-5 bg-body" /> Prices reported
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block w-5 border-t-2 border-dashed border-body" /> Our forecast
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2.5 w-5 bg-subtle/20" /> Likely range (8 in 10 times)
        </li>
      </ul>
    </figure>
  );
}

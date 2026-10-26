"use client";

import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { kg, marketName, shortDate } from "@/lib/format";
import type { Backtest, BacktestPoint } from "@/lib/types";
import { niceDomain, niceTicks } from "./forecast-chart";
import { Select } from "./select";

type Series = Backtest["series"][number];
export type SeriesIndex = { crop: string; cropName: string; market: string; weeks: number }[];

// Two-week-ahead forecasts against the prices then reported, on weeks the model never trained on.
export function BacktestPanel({ index, initial }: { index: SeriesIndex; initial: Series }) {
  const [s, setS] = useState<Series>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const crops = [...new Set(index.map((x) => x.cropName))];

  async function choose(key: string) {
    const [crop, market] = key.split("|");
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/backtest?${new URLSearchParams({ crop, market })}`);
      if (!res.ok) throw new Error((await res.json()).error);
      setS(await res.json());
    } catch (e) {
      setError(e instanceof TypeError ? "Could not load that series. Check the connection and pick it again." : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const data = s.points.map((p) => ({
    ...p,
    t: Date.parse(p.date),
    band: [p.lower, p.upper] as [number, number],
    outside: p.actual < p.lower || p.actual > p.upper ? p.actual : null,
  }));
  const errModel = s.points.reduce((a, p) => a + Math.abs(p.predicted - p.actual), 0) / s.points.length;
  const errNaive = s.points.reduce((a, p) => a + Math.abs(p.naive - p.actual), 0) / s.points.length;
  const held = s.points.filter((p) => p.actual >= p.lower && p.actual <= p.upper).length / s.points.length;
  const values = s.points.flatMap((p) => [p.lower, p.upper, p.actual]);
  const cropName = index.find((x) => x.crop === s.crop)?.cropName ?? s.crop;
  const inside = s.points.length - s.points.filter((p) => p.actual < p.lower || p.actual > p.upper).length;
  const domain = niceDomain(values);

  return (
    <div className="rounded-board border border-rule bg-card">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule px-4 py-3">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-subtle">Crop and market (weeks checked)</span>
          <Select chevron="text-subtle"
            value={`${s.crop}|${s.market}`}
            onChange={(e) => choose(e.target.value)}
            className="h-11 rounded-control border border-rule bg-card px-3 text-small text-body"
          >
            {crops.map((c) => (
              <optgroup key={c} label={c}>
                {index
                  .filter((x) => x.cropName === c)
                  .map((x) => (
                    <option key={`${x.crop}|${x.market}`} value={`${x.crop}|${x.market}`}>
                      {marketName(x.market)} ({x.weeks} weeks)
                    </option>
                  ))}
              </optgroup>
            ))}
          </Select>
        </label>
        <dl className="num flex gap-6 text-small" aria-live="polite">
          <div>
            <dt className="text-caption text-subtle">In our range</dt>
            <dd className="font-display text-h2 font-semibold">{Math.round(held * 100)}%</dd>
          </div>
          <div>
            <dt className="text-caption text-subtle">Our forecast off by</dt>
            <dd className="font-display text-h2 font-semibold">{kg(errModel)}</dd>
          </div>
          <div>
            <dt className="text-caption text-subtle">Simple guess off by</dt>
            <dd className="font-display text-h2 font-semibold text-subtle">{kg(errNaive)}</dd>
          </div>
        </dl>
      </div>

      {error && <p role="alert" className="px-4 pt-3 text-small text-down-ink">{error}</p>}
      <p className="px-4 pt-4 text-copy font-medium text-pretty">
        {cropName} at {marketName(s.market)}: in {inside} of {s.points.length} weeks, the real price landed inside the range we gave two
        weeks before.
      </p>

      <div
        className={`h-80 px-2 pt-4 ${loading ? "opacity-50" : ""}`}
        role="img"
        aria-label={`Two-week-ahead forecast and its range against reported prices for ${marketName(s.market)}: the range held ${Math.round(held * 100)}% of weeks`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t: number) => new Date(t).toLocaleDateString("en-GB", { month: "short", year: "2-digit" })}
              tick={{ fill: "var(--subtle)", fontSize: 13 }}
              axisLine={{ stroke: "var(--rule)" }}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis domain={domain} ticks={niceTicks(domain)} tick={{ fill: "var(--subtle)", fontSize: 13 }} axisLine={false} tickLine={false} width={44} />
            <Tooltip cursor={{ stroke: "var(--subtle)", strokeWidth: 1 }} content={<WeekTip />} isAnimationActive={false} />
            <Area dataKey="band" stroke="none" fill="var(--leaf)" fillOpacity={0.3} activeDot={false} isAnimationActive={false} />
            <Line dataKey="actual" stroke="var(--body)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "var(--body)", stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
            <Scatter dataKey="outside" fill="var(--card)" stroke="var(--body)" strokeWidth={2} shape="circle" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ul className="flex flex-wrap gap-x-6 gap-y-2 px-4 pb-4 pt-2 text-caption text-subtle">
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2.5 w-5 bg-leaf/30" /> Range we predicted 2 weeks before
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-0.5 w-5 bg-body" /> Price traders really paid
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-pill border-2 border-body bg-card" /> Week the price fell outside our range
        </li>
      </ul>
    </div>
  );
}

// Custom: the default tooltip shows the outside dots' date as a price.
type Row = BacktestPoint & { t: number };
function WeekTip({ active, payload }: { active?: boolean; payload?: { payload?: Row }[] }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  const outside = p.actual < p.lower || p.actual > p.upper;
  return (
    <div className="num rounded-board border border-rule bg-card px-3 py-2.5 text-small text-body">
      <p className="font-medium">Week of {shortDate(p.date)}</p>
      <dl className="mt-1.5 grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5">
        <dt className="text-subtle">Real price</dt>
        <dd className="text-right">KSh {kg(p.actual)}</dd>
        <dt className="text-subtle">Our range</dt>
        <dd className="text-right">
          {kg(p.lower)} to {kg(p.upper)}
        </dd>
        <dt className="text-subtle">Our forecast</dt>
        <dd className="text-right">{kg(p.predicted)}</dd>
        <dt className="text-subtle">Simple guess</dt>
        <dd className="text-right">{kg(p.naive)}</dd>
      </dl>
      {outside && <p className="mt-1.5 text-subtle">The real price fell outside our range this week.</p>}
    </div>
  );
}

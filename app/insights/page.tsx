import type { Metadata, Viewport } from "next";
import { BacktestPanel, type SeriesIndex } from "@/components/backtest-panel";
import { SiteFooter, SiteNav } from "@/components/site";
import { crop } from "@/lib/crops";
import { backtest, forecasts, model, quality, reportingMarkets, towns } from "@/lib/data";
import { kg, longDate, marketName, shortDate } from "@/lib/format";
import type { FlagReason } from "@/lib/types";

export const metadata: Metadata = {
  title: "Results | Soko Mbele",
  description: "How Soko Mbele goes from government price data to one answer, and how its trained price model performs on prices it never saw.",
};

export const viewport: Viewport = { themeColor: "#f5f7f2" };

const WHY: Record<FlagReason, string> = {
  likely_per_bag_price: "The price of a whole bag typed into the price-per-kilo box.",
  implausibly_low: "Under a fifth of the crop's normal price: a typing slip.",
  outlier_vs_national: "More than double, or under half, what the rest of the country paid that week.",
  not_a_market: "KAMIS's own test record, not a real market.",
  retail_below_wholesale: "Kept: we only use the trader price, and the shop price is the one that looks wrong.",
};

const REASONS: Record<FlagReason, string> = {
  retail_below_wholesale: "Shop price below trader price (kept)",
  likely_per_bag_price: "Bag price typed as a kilo price",
  implausibly_low: "Too low to be real",
  outlier_vs_national: "Far off the rest of the country",
  not_a_market: "Test entry, not a market",
};

// Plain-words groups of the model's inputs.
const LOOKS_AT: [string, string[]][] = [
  ["How this market's price compares with the rest of the country and its county", ["spread_vs_usual", "county_spread"]],
  ["How the price moved in the last few weeks", ["own_change_1w", "own_momentum_4w", "own_volatility_12w"]],
  ["Which crop it is", ["crop_code"]],
  ["The price against its own past year", ["own_vs_52w"]],
  ["The national price trend", ["national_momentum_4w", "national_momentum_prev_4w", "national_vs_52w_mean"]],
  ["The time of year", ["seasonal_expected_change", "target_month"]],
  ["Rain: wetter or drier than normal", ["rain_4w_anomaly", "rain_12w_anomaly", "national_rain_12w_anomaly"]],
  ["How old the last price is", ["staleness_weeks"]],
];

const month = (ym: string) => new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const n = (x: number) => x.toLocaleString("en-KE");
const money = (x: number) => x.toLocaleString("en-KE", { maximumFractionDigits: 2 });
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function Insights() {
  const two = backtest.metrics.find((m) => m.horizon_weeks === 2)!;
  const allBetter = backtest.metrics.every((m) => m.model_mae < m.naive_mae);
  const share = (fs: string[]) => model.importance.filter((i) => fs.includes(i.feature)).reduce((a, i) => a + i.share, 0);
  const looksAt = LOOKS_AT.map(([label, fs]) => ({ label, share: share(fs) })).sort((a, b) => b.share - a.share);
  const top = looksAt[0].share;
  const gap = quality.reporting_gaps[0];
  const index: SeriesIndex = backtest.series.map((s) => ({ crop: s.crop, cropName: crop(s.crop).name, market: s.market, weeks: s.points.length }));
  // The series with the most test weeks, not the best-looking one.
  const initial = [...backtest.series].sort((a, b) => b.points.length - a.points.length)[0];

  return (
    <main className="flex-1 bg-paper text-body">
      <SiteNav current="/insights" />
      <div className="mx-auto max-w-280 px-4 pb-8 lg:pb-12">
        <section className="mt-4 lg:mt-8" aria-labelledby="built">
          <h1 id="built" className="font-display text-h2 font-semibold text-balance lg:text-h1">
            From government prices to one answer
          </h1>
          <p className="mt-3 max-w-[40em] text-copy text-pretty">
            Four steps, run again every week. Each one is something you can check on this page.
          </p>
          <ol className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: "Data",
                figure: n(quality.rows_ingested),
                title: "price reports",
                body: `From KAMIS, the Ministry of Agriculture's market reports, ${quality.date_range[0].slice(0, 4)} to today: ${n(quality.markets_covered)} markets in ${quality.counties_covered} counties. Checked and cleaned, with daily rain for every county and road distances added.`,
              },
              {
                step: "Machine learning",
                figure: n(model.examples),
                title: "past price moves to learn from",
                body: "A machine-learning model learns how prices move from 16 signals, including rain, the time of year and how far a market sits from the rest of the country. It is retrained every Monday on the newest prices.",
              },
              {
                step: "Prediction",
                figure: n(forecasts.length),
                title: "forecasts this week",
                body: `The price at every market with a recent report, 1 to 4 weeks ahead, with a likely range. On prices it never saw, the range held ${pct(two.band_coverage)} of the time.`,
              },
              {
                step: "Decision",
                figure: "1",
                title: "answer per farmer",
                body: "The decision engine weighs the prices, the forecast, transport, your fare, storage and risk. It only says move or wait when that still pays if prices come in low, and says why.",
              },
            ].map((s) => (
              <li key={s.step} className="flex flex-col rounded-board border border-rule bg-card p-5">
                <h2 className="text-small font-semibold">{s.step}</h2>
                <p className="mt-3">
                  <span className="expanded num block text-[32px] font-bold leading-none">{s.figure}</span>
                  <span className="mt-1.5 block text-small text-subtle">{s.title}</span>
                </p>
                <p className="mt-4 text-small text-pretty">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
        <section className="mt-16" aria-labelledby="forecast">
          <h2 id="forecast" className="font-display text-h2 font-semibold lg:text-h1">
            Does it work?
          </h2>
          <p className="mt-4 max-w-[36em] text-copy text-pretty">
            We trained the model on prices up to {longDate(backtest.train_end)}, then tested it week by week on {backtest.test_start.slice(0, 4)}{" "}
            and {backtest.test_end.slice(0, 4)} prices it had never seen. {allBetter ? "Its forecasts were closer to the real price than the simple guess, that the price stays where it was last reported, whether looking 1, 2, 3 or 4 weeks ahead." : ""} Market
            prices are hard to call exactly, so the bigger value is the range, and knowing which way a big move will go.
          </p>

          <dl className="num mt-8 grid rounded-board bg-ink px-5 text-chalk sm:grid-cols-3 sm:px-0">
            <div className="border-line py-5 sm:border-r sm:px-6 flex flex-col-reverse justify-end">
              <dt className="text-small text-pretty text-muted">
                of the time, the real price two weeks later landed inside the range we predicted. We aimed for 80%.
              </dt>
              <dd className="mb-2 font-display text-board font-semibold">{pct(two.band_coverage)}</dd>
            </div>
            <div className="border-t border-line py-5 sm:border-r sm:border-t-0 sm:px-6 flex flex-col-reverse justify-end">
              <dt className="text-small text-pretty text-muted">KSh a kilo off on average, two weeks ahead: our forecast against the simple guess that the price stays the same.</dt>
              <dd className="mb-2 font-display text-board font-semibold">
                {kg(two.model_mae)} <span className="text-h2 text-muted">vs {kg(two.naive_mae)}</span>
              </dd>
            </div>
            <div className="border-t border-line py-5 sm:border-t-0 sm:px-6 flex flex-col-reverse justify-end">
              <dt className="text-small text-pretty text-muted">
                of big price moves (10% or more in two weeks) called the right way. The simple guess can&apos;t call any.
              </dt>
              <dd className="mb-2 font-display text-board font-semibold">{pct(two.direction_hit)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-caption text-pretty text-subtle">
            {n(two.n)} estimates checked against what really happened, for {backtest.by_crop.length} crops, from{" "}
            {longDate(backtest.test_start)} to {longDate(backtest.test_end)}. The estimates only learned from prices up to{" "}
            {longDate(backtest.train_end)}, and were updated every 4 weeks as new prices came in.
          </p>

          {/* The gates in scripts/model/train.py. */}
          <div className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
              <h3 className="font-display text-h2 font-semibold">Five checks behind every forecast</h3>
              <p className="text-small text-subtle">Last passed {longDate(model.trained_on)}</p>
            </div>
            <p className="mt-3 max-w-[44em] text-copy text-pretty">
              Every Monday the model is retrained on the newest prices. It is published only if it passes all five; if any fails, last
              week&apos;s model stays.
            </p>
            <ul className="mt-6 grid gap-3">
              {[
                {
                  title: "Beats the simple guess, and not by luck",
                  body: `We re-ran the two-week comparison 1,000 times on reshuffled weeks. The model came out closer than the simple guess every time: KSh ${two.gain_ksh.toFixed(2)} a kilo on average, and 95% sure it is between ${two.gain_low.toFixed(2)} and ${two.gain_high.toFixed(2)}.`,
                  figure: `${n(Math.round(two.beat_share * 1000))} of 1,000`,
                  label: "re-runs won",
                },
                {
                  title: "Learns real patterns",
                  body: `Trained on shuffled prices, where there is nothing to learn, the same model misses by KSh ${model.checks.shuffled.shuffled_mae.toFixed(2)} a kilo, exactly as much as the simple guess (${model.checks.shuffled.naive_mae.toFixed(2)}). Trained on the real prices, it misses by less. So its edge comes from real patterns, not from a quirk in the test.`,
                  figure: `${model.checks.shuffled.shuffled_mae.toFixed(2)} = ${model.checks.shuffled.naive_mae.toFixed(2)}`,
                  label: "shuffled model vs simple guess",
                },
                {
                  title: "Behaves like a market",
                  body: `When a market was priced 15% or more above its usual level, the model expected it to fall, and of the prices that moved, ${pct(model.checks.behaviour.above_usual.moved_as_expected)} fell. Below its usual level it expected a rise, and ${pct(model.checks.behaviour.below_usual.moved_as_expected)} rose.`,
                  figure: `${pct(model.checks.behaviour.above_usual.moved_as_expected)} and ${pct(model.checks.behaviour.below_usual.moved_as_expected)}`,
                  label: "moved the way it expected",
                },
                {
                  title: "Its range holds",
                  body: `Two weeks ahead, the real price landed inside the predicted range ${pct(two.band_coverage)} of the time. We aim for 80%; a range that holds less than 72% or more than 88% of the time is not published.`,
                  figure: pct(two.band_coverage),
                  label: "inside the range",
                },
                {
                  title: "Never sees the future",
                  body: `Every input is known on the day of the forecast. The settings were fixed on 2024 prices before the ${backtest.test_start.slice(0, 4)}–${backtest.test_end.slice(0, 4)} test, and the test was never used to tune it.`,
                  figure: n(two.n),
                  label: "unseen prices tested",
                },
              ].map((c) => (
                <li key={c.title} className="grid gap-x-8 gap-y-3 rounded-board border border-rule bg-card p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex gap-3">
                    <svg role="img" aria-label="Passed" viewBox="0 0 20 20" className="mt-0.5 size-5 shrink-0 text-brand">
                      <circle cx="10" cy="10" r="10" fill="currentColor" />
                      <path d="M5.8 10.4l2.8 2.8 5.6-5.8" fill="none" stroke="var(--card)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <div>
                      <p className="font-semibold">{c.title}</p>
                      <p className="mt-1 max-w-[60em] text-small text-pretty">{c.body}</p>
                    </div>
                  </div>
                  <p className="pl-8 sm:pl-0 sm:text-right">
                    <span className="expanded num block text-[24px] font-bold leading-none">{c.figure}</span>
                    <span className="mt-1.5 block text-caption text-subtle">{c.label}</span>
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-8">
            <BacktestPanel index={index} initial={initial} />
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-[3fr_2fr]">
            <div className="overflow-x-auto">
              <table className="num w-full text-small">
                <caption className="pb-3 text-left text-small font-medium text-body">Each crop, two weeks ahead</caption>
                <thead>
                  <tr className="border-b border-rule text-left text-caption text-subtle">
                    <th className="py-2 pr-3 font-medium">Crop</th>
                    <th className="py-2 pr-3 text-right font-medium">In our range</th>
                    <th className="py-2 pr-3 text-right font-medium">Our forecast off by</th>
                    <th className="py-2 pr-3 text-right font-medium">Simple guess off by</th>
                    <th className="hidden py-2 pr-3 text-right font-medium sm:table-cell">Same week last year off by</th>
                    <th className="hidden py-2 text-right font-medium sm:table-cell">Checks</th>
                  </tr>
                </thead>
                <tbody>
                  {backtest.by_crop.map((c) => (
                    <tr key={c.crop} className="border-b border-rule">
                      <td className="py-2 pr-3">{crop(c.crop).name}</td>
                      <td className="py-2 pr-3 text-right font-semibold">{pct(c.band_coverage)}</td>
                      <td className="py-2 pr-3 text-right">{kg(c.model_mae)}</td>
                      <td className="py-2 pr-3 text-right">{kg(c.naive_mae)}</td>
                      <td className="hidden py-2 pr-3 text-right sm:table-cell">{kg(c.seasonal_mae)}</td>
                      <td className="hidden py-2 text-right text-subtle sm:table-cell">{n(c.n)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-caption text-pretty text-subtle">
                Off by: the average miss, in KSh a kilo. Simple guess: the price stays where it was last reported. Same week last year: the
                price a year earlier.
              </p>
            </div>

            <div className="flex flex-col gap-8">
              <table className="num w-full text-small">
                <caption className="pb-3 text-left text-small font-medium text-body">How far ahead, all crops</caption>
                <thead>
                  <tr className="border-b border-rule text-left text-caption text-subtle">
                    <th className="py-2 pr-3 font-medium">Ahead</th>
                    <th className="py-2 pr-3 text-right font-medium">In our range</th>
                    <th className="py-2 pr-3 text-right font-medium">Our forecast off by</th>
                    <th className="py-2 text-right font-medium">Simple guess off by</th>
                  </tr>
                </thead>
                <tbody>
                  {backtest.metrics.map((m) => (
                    <tr key={m.horizon_weeks} className="border-b border-rule">
                      <td className="py-2 pr-3">{m.horizon_weeks * 7} days</td>
                      <td className="py-2 pr-3 text-right font-semibold">{pct(m.band_coverage)}</td>
                      <td className="py-2 pr-3 text-right">{kg(m.model_mae)}</td>
                      <td className="py-2 text-right">{kg(m.naive_mae)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="text-small text-pretty">
                <h3 className="text-small font-medium">How the range is set</h3>
                <p className="mt-2">
                  Each crop gets its own range from the model&apos;s own misses over the last 26 weeks it did not learn from, so tomatoes,
                  whose prices jump around more, get a wider range than maize.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-14 grid gap-8 lg:grid-cols-[2fr_3fr]">
            <div className="text-copy text-pretty">
              <h3 className="font-display text-h2 font-semibold">What the model looks at</h3>
              <p className="mt-3 text-subtle">
                How much each kind of signal helped the model&apos;s decision trees, as a share of everything it learned. It leans on
                recent price moves and on how far a market sits from the rest of the country, because those gaps tend to close. Rain
                counts for less week to week, but helps it call big moves.
              </p>
            </div>
            <ul className="num flex flex-col gap-4 text-small">
              {looksAt.map((l) => (
                <li key={l.label}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-pretty">{l.label}</span>
                    <span className="font-semibold">{pct(l.share)}</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-r-board bg-brand" style={{ width: `${(l.share / top) * 100}%` }} aria-hidden />
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="mt-16" aria-labelledby="data">
          <h2 id="data" className="font-display text-h2 font-semibold">
            The data
          </h2>
          <dl className="num mt-6 grid grid-cols-2 border-l border-t border-rule md:grid-cols-4">
            {[
              ["Price reports collected", n(quality.rows_ingested)],
              ["Used after checking", n(quality.rows_clean)],
              ["Crops", n(backtest.by_crop.length)],
              ["Markets reporting now", n(reportingMarkets.length)],
              ["Towns and villages covered", n(towns.length)],
              ["History", `${quality.date_range[0].slice(0, 4)} to ${quality.date_range[1].slice(0, 4)}`],
              ["Counties with farm places", "All 47"],
              ["Match with World Bank data (1 = perfect)", `${quality.rtfp_correlation.maize} maize, ${quality.rtfp_correlation.beans} beans`],
            ].map(([k, v]) => (
              <div key={k} className="border-b border-r border-rule px-4 py-3">
                <dt className="text-caption text-subtle">{k}</dt>
                <dd className="mt-1 font-display font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          {gap && (
            <p className="mt-6 max-w-[36em] text-small text-pretty">
              KAMIS reporting almost stopped from {month(gap.from)} to {month(gap.to)}. We don&apos;t learn from or test on that
              gap, and the ranges are set only from weeks that had prices.
            </p>
          )}
          <p className="mt-3 max-w-[36em] text-small text-pretty text-subtle">
            Rain comes from NASA POWER, daily since 2005, for the centre of every county; the model compares the last 4 and 12 weeks
            with what is normal for that time of year. The World Bank&apos;s food prices are estimates, not reported prices, so KAMIS is our source of truth. We use the World Bank
            data only for the yearly price pattern of maize and beans, and as a check ({quality.rtfp_correlation.months} months compared).
          </p>

          <h3 className="mt-10 text-copy font-semibold">Reports we set aside, and why</h3>
          <p className="mt-2 max-w-[44em] text-small text-pretty text-subtle">
            Every report is checked before the model sees it. These are the kinds that fail, each with a real one from the latest data.
          </p>
          <ul className="num mt-4 grid gap-3 lg:grid-cols-2">
            {(["likely_per_bag_price", "implausibly_low", "outlier_vs_national", "not_a_market", "retail_below_wholesale"] as FlagReason[]).map((r) => {
              const ex = quality.flagged.find((f) => f.reason === r);
              return (
                <li key={r} className={`rounded-board border border-rule bg-card p-4 ${r === "retail_below_wholesale" ? "lg:col-span-2" : ""}`}>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="font-semibold">{REASONS[r]}</span>
                    <span className="expanded shrink-0 text-[20px] font-bold">{n(quality.flag_counts[r])}</span>
                  </div>
                  <p className="mt-1 text-small text-pretty">{WHY[r]}</p>
                  {ex && (
                    <p className="mt-2 text-small text-pretty text-subtle">
                      For example: {crop(ex.crop).name.toLowerCase()} at {marketName(ex.market)}, {shortDate(ex.date)}:{" "}
                      {r === "retail_below_wholesale" ? `shop KSh ${money(ex.retail ?? 0)}, trader KSh ${money(ex.wholesale ?? 0)}` : `KSh ${money(ex.wholesale ?? 0)} a kilo`}.
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <details className="mt-4">
            <summary className="cursor-pointer text-small font-medium underline underline-offset-4">See the latest reports we set aside</summary>
            <div className="mt-4 max-h-96 overflow-y-auto rounded-board border border-rule bg-card">
              <table className="num w-full text-small">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left text-caption text-subtle">
                    <th className="px-3 py-2 font-medium">Reported</th>
                    <th className="px-3 py-2 font-medium">Market</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">Crop</th>
                    <th className="px-3 py-2 text-right font-medium">Wholesale</th>
                    <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Retail</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {quality.flagged.slice(0, 80).map((f, i) => (
                    <tr key={i} className="border-t border-rule align-top">
                      <td className="whitespace-nowrap px-3 py-2">{shortDate(f.date)}</td>
                      <td className="px-3 py-2">
                        {marketName(f.market)}, {f.county}
                        <span className="block text-caption text-subtle md:hidden">
                          {crop(f.crop).name}: {REASONS[f.reason].toLowerCase()}
                        </span>
                      </td>
                      <td className="hidden px-3 py-2 md:table-cell">{crop(f.crop).name}</td>
                      <td className="px-3 py-2 text-right">{f.wholesale === null ? "–" : kg(f.wholesale)}</td>
                      <td className="hidden px-3 py-2 text-right md:table-cell">{f.retail === null ? "–" : kg(f.retail)}</td>
                      <td className="hidden px-3 py-2 text-subtle md:table-cell">{REASONS[f.reason]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
        <section className="mt-16" aria-labelledby="sources">
          <h2 id="sources" className="font-display text-h2 font-semibold">
            Sources
          </h2>
          <ul className="mt-4 grid gap-4 text-small md:grid-cols-2">
            {quality.sources.map((s) => (
              <li key={s.name}>
                <a href={s.url} className="font-medium underline underline-offset-4">
                  {s.name}
                </a>
                <span className="block text-pretty text-subtle">{s.role}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <SiteFooter />
    </main>
  );
}

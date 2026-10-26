import type { Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { Channels } from "@/components/home/parts";
import { SaleSlip } from "@/components/home/sale-slip";
import { SiteFooter, SiteNav } from "@/components/site";
import { cropChoices } from "@/lib/data";
import { kg, ksh, longDate, quantityText, shortDate } from "@/lib/format";
import { coverage, demoRecommendation, forecastHeadline, maizeSpread, postedMaize } from "@/lib/site";

export const viewport: Viewport = { themeColor: "#f5f7f2" };

const n = (x: number) => x.toLocaleString("en-KE");
const whole = (x: number) => kg(x).replace(/\.00$/, "");
const DISPLAY = "clamp(48px, 5.2vw, 80px)";
const H2 = "clamp(36px, 4vw, 60px)";

export default function Home() {
  const rec = demoRecommendation();
  const spread = maizeSpread();
  const cov = coverage();
  const fc = forecastHeadline();
  const posted = postedMaize();

  return (
    <main className="flex-1">
      <section className="bg-paper text-body" aria-labelledby="home-title">
        <SiteNav />
        <SaleSlip
          initial={rec}
          crops={cropChoices}

          intro={
            <>
              <h1 id="home-title" className="font-display font-semibold leading-[0.98] tracking-tight" style={{ fontSize: DISPLAY }}>
                Sell where
                <br />
                it pays.
              </h1>
              <p className="mt-6 hidden max-w-[40ch] text-[18px] leading-relaxed text-pretty sm:block">
                Before you sell, see which market pays you the most for your harvest, after you pay to get there. Based on the
                government&apos;s own market prices.
              </p>
              <p className="mt-5 hidden items-center gap-2 text-small text-subtle sm:flex">
                <span aria-hidden className="size-2 rounded-pill bg-leaf" />
                Prices from {cov.markets} markets, updated {longDate(cov.asOf)}
              </p>
            </>
          }
        />
      </section>
      <section className="bg-card text-body" aria-labelledby="gap-title">
        <div className="mx-auto max-w-340 px-4 py-24 sm:px-8 lg:px-10 lg:py-36">
          <h2 id="gap-title" className="font-display font-bold leading-[0.95] tracking-tight" style={{ fontSize: H2 }}>
            Same maize.
            <br />
            Different price.
          </h2>
          <dl className="num mt-14 grid gap-8 sm:grid-cols-3 sm:items-end">
            <div className="flex flex-col-reverse justify-end gap-2">
              <dt className="text-[18px]">
                {spread.low.market}, {spread.low.county}
              </dt>
              <dd className="expanded font-bold leading-none" style={{ fontSize: DISPLAY }}>
                {whole(spread.low.price)}
              </dd>
            </div>
            <div className="flex flex-col-reverse justify-end gap-2 sm:text-center">
              <dt className="text-[18px]">shillings a kilo more</dt>
              <dd className="expanded font-bold leading-none text-brand" style={{ fontSize: DISPLAY }}>
                {whole(spread.high.price - spread.low.price)}
              </dd>
            </div>
            <div className="flex flex-col-reverse justify-end gap-2 sm:text-right">
              <dt className="text-[18px]">
                {spread.high.market}, {spread.high.county}
              </dt>
              <dd className="expanded font-bold leading-none" style={{ fontSize: DISPLAY }}>
                {whole(spread.high.price)}
              </dd>
            </div>
          </dl>
          <div className="mt-16 grid gap-12 lg:grid-cols-12">
            <p className="max-w-[44ch] text-[18px] leading-relaxed text-pretty lg:col-span-5">
              Prices traders paid for maize, in shillings a kilo, at {spread.markets} markets in the three weeks to {longDate(cov.asOf)}. Most
              farmers sell to whoever comes to the farm, so they never see this difference. Getting to a better market costs money, so
              Soko Mbele always takes transport off before it suggests a trip.
            </p>
            <div className="grid grid-cols-2 gap-4 lg:col-span-6 lg:col-start-7">
              <figure>
                <Image
                  src="/photos/maize-miller.jpg"
                  alt="A boy cycles home with a sack of maize flour on his carrier, on a dirt road lined with trees."
                  width={1400}
                  height={935}
                  sizes="(min-width: 1024px) 24vw, 45vw"
                  className="aspect-square w-full rounded-board object-cover"
                />
                <figcaption className="mt-2 text-small text-subtle">Back from the posho mill, Munami, Kakamega.</figcaption>
              </figure>
              <figure>
                <Image
                  src="/photos/beautiful-local-market-of-nariobi-kenya.jpg"
                  alt="A market stall in Nairobi piled with green beans, chillies, aubergines and limes."
                  width={1080}
                  height={804}
                  sizes="(min-width: 1024px) 24vw, 45vw"
                  className="aspect-square w-full rounded-board object-cover"
                />
                <figcaption className="mt-2 text-small text-subtle">A vegetable stall, Nairobi.</figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>
      <section className="bg-paper text-body" aria-labelledby="how-title">
        <div className="mx-auto max-w-340 px-4 py-24 sm:px-8 lg:px-10 lg:py-36">
          <div className="grid gap-8 lg:grid-cols-12">
            <h2 id="how-title" className="font-display font-bold leading-[0.95] tracking-tight lg:col-span-5" style={{ fontSize: H2 }}>
              How it works
            </h2>
            <p className="max-w-[44ch] text-[18px] leading-relaxed text-pretty lg:col-span-6 lg:col-start-7">
              Four simple steps. You can check every number: in the app, one tap shows exactly how each answer was worked out.
            </p>
          </div>
          <div className="mt-14 grid gap-12 lg:grid-cols-12">
            <ol className="lg:col-span-8">
              {[
                {
                  name: "Prices",
                  body: `The market prices the Ministry of Agriculture collects, for ${cov.crops} crops. Every report is checked before we use it.`,
                  figure: n(cov.reports),
                },
                {
                  name: "Distance",
                  body: `The real road distance from your town or village to every market within a day's trip, for farms in all ${cov.counties} counties. We take off what it costs to get your harvest there.`,
                  figure: `${n(cov.towns)} places`,
                },
                {
                  name: "Next weeks",
                  body: `A machine-learning model, trained on years of prices and rain, forecasts each market's price for the next 4 weeks as a likely range. Tested on prices it never saw, the real price landed in our range ${fc.held} times out of 100.`,
                  figure: `${fc.held}%`,
                },
                {
                  name: "Your answer",
                  body: "We only tell you to travel or wait if you would still make more even when prices come in low. If not, we tell you to sell at your nearest market.",
                  figure: "1 SMS",
                },
              ].map((step) => (
                <li
                  key={step.name}
                  className="grid gap-x-6 gap-y-2 border-b-2 border-rule py-6 [grid-template-areas:'name'_'figure'_'body'] first:pt-0 sm:grid-cols-[180px_1fr_auto] sm:[grid-template-areas:'name_body_figure']"
                >
                  <span className="font-display text-[24px] font-bold [grid-area:name]">{step.name}</span>
                  <span className="text-[18px] leading-relaxed text-pretty [grid-area:body]">{step.body}</span>
                  <span className="expanded num text-[36px] font-bold leading-none [grid-area:figure] sm:text-right">{step.figure}</span>
                </li>
              ))}
            </ol>
            <figure className="lg:col-span-4">
              <Image
                src="/photos/wangige-vegetable-local-market-in-kiambu-kenya.jpg"
                alt="A trader stands behind sacks of onions, carrots and green peas at Wangige market."
                width={1120}
                height={1400}
                sizes="(min-width: 1024px) 28vw, 90vw"
                className="aspect-4/5 w-full rounded-board object-cover"
              />
              <figcaption className="mt-2 text-small text-subtle">Wangige market, Kiambu County.</figcaption>
            </figure>
          </div>
        </div>
      </section>
      <section className="bg-ink text-chalk" aria-labelledby="posted-title">
        <div className="mx-auto max-w-340 px-4 pt-24 sm:px-8 lg:px-10 lg:pt-36">
          <h2 id="posted-title" className="font-display font-bold leading-[0.95] tracking-tight" style={{ fontSize: H2 }}>
            Maize prices
            <br />
            this week.
          </h2>
        </div>
        <div className="mx-auto max-w-340 px-4 sm:px-8 lg:px-10">
          <p className="num mt-12 font-display font-bold leading-[1.15] tracking-tight text-balance" style={{ fontSize: "clamp(22px, 3.6vw, 56px)" }}>
            {posted.map((p) => (
              <span key={p.market} className="flex items-baseline justify-between gap-4 sm:mr-[0.7em] sm:inline-block sm:whitespace-nowrap">
                <span>{p.market}</span> <span className="expanded shrink-0 text-leaf">{kg(p.price)}</span>
              </span>
            ))}
          </p>
        </div>
        <div className="mx-auto max-w-340 px-4 pb-24 pt-10 sm:px-8 lg:px-10 lg:pb-36">
          <p className="max-w-[36em] text-[18px] leading-relaxed text-pretty">
            What traders paid for a kilo of maize at the {posted.length} markets that reported in the last three weeks. For all crops,
            Soko Mbele compares {cov.markets} markets, for farms in all {cov.counties} counties.
          </p>
        </div>
      </section>
      <section className="bg-card text-body" aria-labelledby="test-title">
        <div className="mx-auto max-w-340 px-4 py-24 sm:px-8 lg:px-10 lg:py-36">
          <h2 id="test-title" className="font-display font-bold leading-[0.95] tracking-tight" style={{ fontSize: H2 }}>
            We checked it
            <br />
            against real prices.
          </h2>
          <div className="mt-14 grid gap-12 lg:grid-cols-12">
            <dl className="num lg:col-span-5">
              {[
                [`${fc.held}%`, "of the time, the real price two weeks later landed inside the range we predicted. We aimed for 80%."],
                [
                  `${kg(fc.model)} / ${kg(fc.naive)}`,
                  `KSh a kilo: how far off our forecast was on average, two weeks ahead, against the simple guess that the price stays the same.${fc.allBetter ? " Our forecast was closer whether looking 1, 2, 3 or 4 weeks ahead." : ""}`,
                ],
                [`${fc.directionHit}%`, "of big price moves (10% or more) called the right way. The simple guess can't call any."],
                [n(fc.forecasts), `forecasts checked against what really happened, for ${fc.crops} crops, ${longDate(fc.testStart)} to ${longDate(fc.testEnd)}.`],
              ].map(([figure, label]) => (
                <div key={label} className="flex flex-col-reverse gap-2 border-b-2 border-rule py-5 first:pt-0">
                  <dt className="text-[16px] text-pretty text-subtle">{label}</dt>
                  <dd className="expanded text-[36px] font-bold leading-none">{figure}</dd>
                </div>
              ))}
            </dl>
            <div className="lg:col-span-7">
              <MiniBacktest series={fc.series} />
              <p className="mt-6 text-[18px]">
                <Link href="/insights" className="font-medium underline underline-offset-4">
                  See the results for every crop
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
      <section className="bg-paper text-body" aria-labelledby="phone-title">
        <div className="mx-auto max-w-340 px-4 py-24 sm:px-8 lg:px-10 lg:py-36">
          <h2 id="phone-title" className="mb-12 font-display font-bold leading-[0.95] tracking-tight" style={{ fontSize: H2 }}>
            Any phone will do.
          </h2>
          <Channels
            sms={rec.sms}
            ussd={["Soko Mbele\n1. Check prices\n2. Where and when to sell\n3. Markets near me\n0. Exit", `${rec.ussd}\n1. More\n2. SMS me this\n0. Main menu`]}
            web={{
              headline: rec.headline,
              figure: rec.action === "sell_nearest" ? ksh(rec.baseline.net) : `+${ksh(rec.best.gainVsBaseline)}`,
              caption: `${quantityText(rec.crop, rec.input.quantity)} of ${rec.crop.name.toLowerCase()} from ${rec.town.name}, after transport`,
            }}
          />
        </div>
      </section>
      <section className="bg-brand text-card" aria-labelledby="close-title">
        <div className="mx-auto max-w-340 px-4 pb-20 pt-24 sm:px-8 lg:px-10 lg:pb-24 lg:pt-36">
          <h2 id="close-title" className="font-display font-bold leading-[0.9] tracking-tight" style={{ fontSize: "clamp(56px, 8vw, 128px)" }}>
            Know before
            <br />
            you load.
          </h2>
          <div className="mt-14 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-[40ch] text-[18px] leading-relaxed text-pretty">
              Pick your crop and the town nearest your farm. The answer takes a few seconds, and you can see every shilling.
            </p>
            <Link href="/sell" className="flex h-14 items-center justify-center rounded-control bg-card px-8 text-[18px] font-semibold text-brand transition-colors hover:bg-mint">
              Find where to sell
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}

function MiniBacktest({ series }: { series: ReturnType<typeof forecastHeadline>["series"] }) {
  const pts = series.points;
  const W = 1200, H = 520, P = 10;
  const values = pts.flatMap((p) => [p.lower, p.upper, p.actual]);
  const lo = Math.min(...values), hi = Math.max(...values);
  const x = (i: number) => P + (i / (pts.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
  const band = [...pts.map((p, i) => `${x(i)},${y(p.upper)}`), ...pts.map((p, i) => `${x(i)},${y(p.lower)}`).reverse()].join(" ");
  const actual = pts.map((p, i) => `${x(i)},${y(p.actual)}`).join(" ");
  const outside = pts.map((p, i) => ({ p, i })).filter(({ p }) => p.actual < p.lower || p.actual > p.upper);
  const crop = series.crop.replace(/_/g, " ");
  return (
    <figure>
      <p className="mb-4 text-[18px] font-medium text-pretty">
        {series.market.replace(/\s+-\s+.*$/, "")}, {crop}: {pts.length - outside.length} of {pts.length} weeks inside the range we gave two weeks before.
      </p>
      <div className="flex gap-3">
        <div className="num flex shrink-0 flex-col justify-between text-right text-[14px] text-subtle">
          <span>KSh {Math.round(hi)}</span>
          <span>KSh {Math.round(lo)}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto min-w-0 flex-1" role="img" aria-label={`Forecast range and reported ${series.crop} prices at ${series.market}: ${pts.length - outside.length} of ${pts.length} weeks inside the range.`}>
          <polygon points={band} fill="var(--leaf)" fillOpacity={0.3} />
          <polyline points={actual} fill="none" stroke="var(--body)" strokeWidth={3} strokeLinejoin="round" />
          {outside.map(({ p, i }) => (
            <circle key={i} cx={x(i)} cy={y(p.actual)} r={7} fill="var(--card)" stroke="var(--body)" strokeWidth={3} />
          ))}
        </svg>
      </div>
      <div className="num mt-2 flex justify-between pl-16 text-[14px] text-subtle">
        <span>{shortDate(pts[0].date)} {pts[0].date.slice(0, 4)}</span>
        <span>{shortDate(pts.at(-1)!.date)} {pts.at(-1)!.date.slice(0, 4)}</span>
      </div>
      <figcaption className="mt-3 max-w-[36em] text-[16px] text-pretty text-subtle">
        The green band is the price range we predicted two weeks ahead. The line is the price traders really paid. Circles mark the weeks
        it fell outside.
      </figcaption>
    </figure>
  );
}

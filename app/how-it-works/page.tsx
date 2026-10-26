import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import { SiteFooter, SiteNav } from "@/components/site";
import { costs } from "@/lib/data";
import { kg, ksh, longDate, quantityText } from "@/lib/format";
import { coverage, demoRecommendation, forecastHeadline } from "@/lib/site";
import { atDiesel } from "@/lib/trip";

export const metadata: Metadata = {
  title: "How it works | Soko Mbele",
  description: "Where the prices come from, how transport is costed, what the forecast can and cannot do, and how the answer is decided.",
};

export const viewport: Viewport = { themeColor: "#f5f7f2" };

const n = (x: number) => x.toLocaleString("en-KE");

const SECTIONS = [
  ["question", "The question"],
  ["prices", "Where the prices come from"],
  ["distance", "From the farm to the market"],
  ["forecast", "The next few weeks"],
  ["decision", "The advice"],
  ["channels", "Three ways to get the answer"],
  ["limits", "What it can't do yet"],
] as const;

type Photo = { src: string; alt: string; caption: string; w: number; h: number };
const PHOTOS: Record<string, Photo> = {
  question: { src: "/photos/maize-miller.jpg", alt: "A boy cycles home with a sack of maize flour on his carrier, on a dirt road lined with trees.", caption: "Back from the posho mill, Munami, Kakamega.", w: 1400, h: 935 },
  prices: { src: "/photos/wangige-vegetable-local-market-in-kiambu-kenya.jpg", alt: "A trader stands behind sacks of onions, carrots and green peas at Wangige market.", caption: "Wangige market, Kiambu County.", w: 1120, h: 1400 },
  decision: { src: "/photos/icipe-orientation-grain-traders-africa.jpg", alt: "Grain traders gather around white hermetic storage bags laid out on the street outside a row of shops.", caption: "Grain traders learning hermetic storage. Waiting only pays if the grain keeps.", w: 1296, h: 864 },
  channels: { src: "/photos/beautiful-local-market-of-nariobi-kenya.jpg", alt: "A market stall in Nairobi piled with green beans, chillies, aubergines and limes.", caption: "A vegetable stall, Nairobi.", w: 1080, h: 804 },
};

function Part({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  const photo = PHOTOS[id];
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="grid scroll-mt-8 gap-8 lg:grid-cols-9 lg:gap-12">
      <div className="max-w-[34em] lg:col-span-6 [&>p]:mt-4 [&>p]:text-pretty">
        <h2 id={`${id}-title`} className="font-display text-[36px] font-bold leading-tight">
          {title}
        </h2>
        {children}
      </div>
      {photo && (
        <figure className="lg:col-span-3 lg:pt-16">
          <Image src={photo.src} alt={photo.alt} width={photo.w} height={photo.h} sizes="(min-width: 1024px) 22vw, 90vw" className="aspect-4/5 w-full rounded-board object-cover" />
          <figcaption className="mt-2 text-small text-subtle">{photo.caption}</figcaption>
        </figure>
      )}
    </section>
  );
}

function Figure({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col-reverse justify-end gap-2">
      <dt className="text-[16px] text-subtle">{label}</dt>
      <dd className="expanded text-[36px] font-bold leading-tight">{value}</dd>
    </div>
  );
}

export default function HowItWorks() {
  const cov = coverage();
  const fc = forecastHeadline();
  const rec = demoRecommendation();
  const sale = rec.action === "sell_nearest" ? rec.baseline : rec.best;
  const perBag = (x: number) => (x * 90).toFixed(2).replace(/\.00$/, "");

  return (
    <main className="flex-1 bg-paper text-body">
      <SiteNav current="/how-it-works" />

      <header className="mx-auto max-w-340 px-4 pb-16 pt-12 sm:px-8 lg:px-10 lg:pb-24 lg:pt-20">
        <h1 className="max-w-[16ch] font-display font-bold leading-[0.95] tracking-tight" style={{ fontSize: "clamp(48px, 5.2vw, 80px)" }}>
          How the answer is made.
        </h1>
        <p className="mt-8 max-w-[34em] text-[18px] leading-relaxed text-pretty">
          We take the government&apos;s market prices, the real distance to each market and a short look ahead, and turn them into one
          answer you can check. Here is each step, in plain words, and what it can&apos;t do yet.
        </p>
      </header>

      <div className="mx-auto grid max-w-340 gap-12 px-4 pb-24 sm:px-8 lg:grid-cols-12 lg:px-10 lg:pb-32">
        <nav aria-label="On this page" className="lg:col-span-3">
          <ul className="flex flex-col gap-2 text-small lg:sticky lg:top-8">
            {SECTIONS.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-subtle underline-offset-4 hover:text-body hover:underline">
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-24 text-[18px] leading-relaxed lg:col-span-9">
          <Part id="question" title="The question">
            <p>
              When you have a harvest to sell, you want to know three things. Where should I sell it? Should I sell now or wait? And how much
              will I actually take home once I have paid for transport? Most farmers never get those answers, so they sell to whoever comes
              to the farm, at whatever price they offer.
            </p>
            <p>
              Soko Mbele answers all three from where your farm is, what you are selling and how much you have. For crops that keep, like
              maize and beans, it also tells you whether waiting is likely to pay. Fresh produce like tomatoes and kales can&apos;t wait, so
              for those it only tells you where to sell today.
            </p>
          </Part>

          <Part id="prices" title="Where the prices come from">
            <p>
              Every price comes from KAMIS, the market price system run by the Ministry of Agriculture. People at markets around the country
              report what traders pay each day. We use {n(cov.reports)} of these reports for {cov.crops} crops. Some go back to 2005, but most
              are from 2021 onwards.
            </p>
            <p>
              Every report is checked before we use it. Right now {cov.markets} markets in {cov.marketCounties} counties are reporting. As a
              check, we compared KAMIS with the World Bank&apos;s food price estimates: month by month they move together very closely.
            </p>
          </Part>

          <Part id="distance" title="From the farm to the market">
            <p>
              You pick the town or village nearest your farm, from {n(cov.towns)} places in all {cov.counties} counties. We use the real road distance from
              that town to each market, not a straight line on a map.
            </p>
            <p>
              Every choice includes the full cost of getting there, even your nearest market. For each market we pick the cheapest way to
              move your harvest, the way you would: a few bags go on a produce lorry or matatu, paying per bag; a bigger harvest hires a
              pickup or a lorry, and you ride in the cab. Hire prices follow today&apos;s diesel price (KSh {costs.diesel.ksh_per_litre} a
              litre in {costs.diesel.place}). These are estimates built from published figures, not quotes:
            </p>
            <table className="num mt-6 w-full text-[16px]">
              <tbody>
                {[
                  ...costs.transport_modes.map((m) => {
                    const perKm = atDiesel(m.per_km, m.fuel_share, costs);
                    return m.charged === "per_bag"
                      ? [`Paying per bag on a lorry or matatu (up to ${Math.round(m.max_kg / 90)} bags)`, `KSh ${m.base} a bag, plus KSh ${perKm.toFixed(2)} a bag for every km`]
                      : [`Hiring ${m.label.replace(/^in an? hired /, "a ")} (up to ${Math.round(m.max_kg / 90)} bags)`, `KSh ${n(m.base)}, plus KSh ${Math.round(perKm)} for every km`];
                  }),
                  ["Loading and offloading", `KSh ${costs.handling_per_bag} a 90 kg bag`],
                  ["Market fee (county cess)", `KSh ${costs.market_fee_per_bag} a bag, KSh ${costs.market_fee_city_per_bag} in ${costs.city_market_counties.join(" and ")}`],
                  ["Your own fare, there and back", `KSh ${(2 * costs.fare_per_km).toFixed(0)} for every km, unless you ride with the load`],
                  ["Your time on the road", `KSh ${costs.farmer_day_ksh} a day, the farm minimum wage`],
                  ["Keeping the harvest (crops that keep)", `KSh ${perBag(costs.storage_per_kg_week)} a bag each week`],
                  ["Lost while kept", "about 1 shilling in every 400, each week"],
                  ["Longest trip we suggest", `${costs.max_trip_hours} hours each way, ${costs.max_trip_hours_fresh} for fresh produce, so you are home the same day`],
                ].map(([k, v]) => (
                  <tr key={k} className="border-b border-rule last:border-0">
                    <th scope="row" className="py-3 pr-4 text-left font-normal text-subtle">
                      {k}
                    </th>
                    <td className="py-3 text-right">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <details className="mt-4 text-small">
              <summary className="cursor-pointer font-medium underline underline-offset-4">Where these numbers come from</summary>
              <ul className="mt-3 flex flex-col gap-2 text-subtle">
                {costs.sources.map((s) => (
                  <li key={s.what}>
                    {s.what}:{" "}
                    <a href={s.url} className="underline underline-offset-4">
                      {s.source}
                    </a>{" "}
                    ({s.year})
                  </li>
                ))}
              </ul>
            </details>
          </Part>

          <Part id="forecast" title="The next few weeks">
            <p>
              For each market, a machine-learning model, the kind large retailers use to forecast sales, estimates the price for the
              next 1 to 4 weeks. It learned from over 400,000 past examples how prices move: how far a market has drifted
              from the rest of the country, how its price moved lately, the time of year, and whether the rains came early, late or not at
              all. Instead of one number, we give a likely range: the price should land inside it about 8 times out of 10.
            </p>
            <p>
              To check it honestly, we only let it learn from prices up to {longDate(fc.trainEnd)}. Then we tested it on {n(fc.forecasts)}{" "}
              real prices from after that date, for {fc.crops} crops, up to {longDate(fc.testEnd)}.
            </p>
            <dl className="num mt-6 grid gap-6 sm:grid-cols-3">
              <Figure value={`${fc.held}%`} label="of the time, the real price landed inside our range" />
              <Figure value={`${kg(fc.model)} / ${kg(fc.naive)}`} label="KSh a kilo off on average, two weeks ahead: our forecast / the simple guess that the price stays the same" />
              <Figure value={`${fc.directionHit}%`} label="of big price moves called the right way" />
            </dl>
            <p>
              To be straight with you about the middle number: market prices are hard to call exactly, and the model is only a little
              closer than the simple guess that the price stays the same. What it adds is a range you can trust and a sense of which way a big move
              will go, so Soko Mbele only acts on the low end of that range, never on a hopeful guess.{" "}
              <Link href="/insights" className="font-medium underline underline-offset-4">
                See the results for every crop
              </Link>
              .
            </p>
          </Part>

          <Part id="decision" title="The advice">
            <p>
              We start from what you would get by selling today at your nearest market. Then we work out what you would take home at
              every other market you can reach and come back from the same day, each with its own trip cost. We only tell you to go
              to another market, or to wait, if you would still make at least KSh {costs.min_gain_ksh.toLocaleString("en-KE")} more, or{" "}
              {Math.round(costs.min_gain_share * 100)}% more than at your nearest market if that is bigger, even when prices come in lower
              than expected. Prices often move that much in a week, so a smaller gain could be gone by the time you arrive. If there is
              more than one good choice, we pick the safest.
            </p>
            <p>
              We don&apos;t trust a price that is far out of line. Nearby markets can&apos;t stay far apart for long, because traders would
              carry the crop from one to the other. So a market paying {Math.round((costs.max_nearby_ratio - 1) * 100)}% more than the
              markets around it, or one that has paid {Math.round((costs.max_usual_premium - 1) * 100)}% more than the rest of the
              country all year, is usually buying a different grade, using a different measure, or has a typing mistake. We never send
              you there; we tell you why. And if your nearest market reports far less than the markets around it, we count it at their
              price, so one wrong number never sends you on a trip.
            </p>
            <p>
              Most harvests are sold to a broker who comes to the farm. So every answer also gives you the lowest price worth taking
              from one: what the best market leaves you per bag after the whole trip, even if prices come in low. Tell the app a
              broker&apos;s offer and it says whether to take it. Going yourself has to beat the offer by the same margin as any trip
              (KSh {costs.min_gain_ksh.toLocaleString("en-KE")}, or {Math.round(costs.min_gain_share * 100)}%), because the broker
              saves you the journey.
            </p>
            <p>
              Today, for {quantityText(rec.crop, rec.input.quantity)} of {rec.crop.name.toLowerCase()} from {rec.town.name}:
            </p>
            <div className="num mt-6 rounded-board bg-card p-6 text-[16px]">
              <p className="font-display text-[24px] font-semibold">{rec.headline}</p>
              <table className="mt-4 w-full">
                <tbody>
                  {[
                    [`${sale.label}, ${Math.round(sale.km)} km`, `KSh ${kg(sale.price)} a kilo`],
                    [`× ${n(sale.kg)} kg`, ksh(sale.gross)],
                    ["− transport", ksh(sale.transport)],
                    ["= you take home", ksh(sale.net)],
                    ...(rec.action === "sell_nearest" ? [] : [[`At ${rec.baseline.label}, ${rec.baselineName}`, ksh(rec.baseline.net)]]),
                  ].map(([k, v], i) => (
                    <tr key={k} className={i === 3 ? "border-t-2 border-body font-semibold" : ""}>
                      <td className="py-1.5 pr-4 text-subtle">{k}</td>
                      <td className="py-1.5 text-right">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-subtle">{rec.evidence}</p>
            </div>
          </Part>

          <Part id="channels" title="Three ways to get the answer">
            <p>
              It is built to give the same answer three ways: on this website, through a phone menu you dial (USSD, no internet needed), or
              as one SMS. The numbers always match, because one system works them all out. Developers can also ask it directly at{" "}
              <a href="/api/recommend?crop=maize&town=meru-meru&quantity=10&storage=1" className="font-medium underline underline-offset-4">
                /api/recommend
              </a>
              .
            </p>
            <p className="rounded-board bg-card px-5 py-4 text-[16px]">{rec.sms}</p>
          </Part>

          <Part id="limits" title="What it can't do yet">
            <ul className="mt-4 flex list-disc flex-col gap-3 pl-5 marker:text-subtle">
              <li>On this site the SMS and the *944# phone menu are previews: they show the reply on screen instead of sending it.</li>
              <li>Prices only come from the {cov.markets} markets reporting right now. If your farm is far from all of them, the answer is far too.</li>
              <li>Fresh produce is counted in kilograms. We still need to check with farmers which crates and bags they use.</li>
              <li>
                It looks 1 to 4 weeks ahead. Keeping grain usually pays over months, as prices climb after the harvest, which is further
                than it can see, so it rarely says wait.
              </li>
              <li>It is in English only. Swahili is next.</li>
            </ul>
          </Part>
        </div>
      </div>

      <SiteFooter />
    </main>
  );
}

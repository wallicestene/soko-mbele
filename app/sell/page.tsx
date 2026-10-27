import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { FarmerFlow } from "@/components/farmer-flow";
import { SiteNav } from "@/components/site";
import { chartsFor, costs, cropChoices, engineData, mainTowns, prices } from "@/lib/data";
import { CHOICE_COOKIE, readChoice } from "@/lib/choice";
import { crop as cropDef } from "@/lib/crops";
import { recommend } from "@/lib/engine";
import { Crop } from "@/lib/types";
import { longDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "Where to sell | Soko Mbele",
  description: "Pick your crop and your nearest town: see which market pays most after transport, and whether waiting pays.",
};

export const viewport: Viewport = { themeColor: "#f5f7f2" };

type Params = Promise<Record<string, string | string[] | undefined>>;

export default function Sell({ searchParams }: { searchParams: Params }) {
  const shared = { asOf: prices.as_of, crops: cropChoices, towns: mainTowns };
  return (
    <main className="flex-1 bg-paper text-body">
      <SiteNav current="/sell" />
      <div className="mx-auto grid max-w-300 gap-8 px-4 pb-12 pt-2 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)] lg:grid-rows-[auto_auto_1fr] lg:gap-x-16 lg:gap-y-10 lg:px-10 lg:pb-20 lg:pt-6">
        <header className="max-w-[34rem] lg:col-start-1 lg:row-start-1">
          <h1 className="font-display text-h2 font-semibold lg:text-h1">Where to sell today</h1>
          <p className="mt-2 text-copy text-pretty text-subtle">
            Tell us what you are selling and where your farm is. We will show you which market pays you the most after transport.
          </p>
          <p className="mt-4 text-small">
            <Link href="/#phone" className="font-medium underline underline-offset-4">
              No smartphone? Try the phone menu
            </Link>
          </p>
        </header>

        <div className="lg:col-start-2 lg:row-span-3 lg:row-start-1">
          {/* A shared link's answer streams in behind the static form. */}
          <Suspense fallback={<FarmerFlow {...shared} costs={costs} />}>
            <FromLink searchParams={searchParams} shared={shared} />
          </Suspense>
        </div>

        {/* Desktop only: on a phone the form comes first. */}
        <dl className="hidden max-w-[34rem] lg:col-start-1 lg:row-start-2 lg:block">
          {[
            ["Where to sell", "Every market within a day's trip, compared on what you take home after transport."],
            ["Whether to wait", "For crops that keep, the next 4 weeks and whether waiting pays."],
            ["What a broker must offer", "The lowest price worth taking at your gate."],
          ].map(([title, text]) => (
            <div key={title} className="border-t border-rule py-4">
              <dt className="font-medium">{title}</dt>
              <dd className="mt-1 text-small text-pretty text-subtle">{text}</dd>
            </div>
          ))}
        </dl>

        <footer className="max-w-[34rem] text-small text-subtle lg:col-start-1 lg:row-start-3 lg:self-start">
          <p className="text-pretty">Prices come from KAMIS, the Ministry of Agriculture&apos;s market reports, up to {longDate(prices.as_of)}.</p>
          <p className="mt-2">
            <Link href="/how-it-works" className="font-medium text-body underline underline-offset-4">
              How the answer is worked out
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}

async function FromLink({ searchParams, shared }: { searchParams: Params; shared: Omit<React.ComponentProps<typeof FarmerFlow>, "costs" | "initial"> }) {
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const crop = Crop.safeParse(one(q.crop));
  const town = one(q.town);
  const quantity = Number(one(q.quantity));
  let initial;
  if (crop.success && town && quantity > 0) {
    try {
      const offer = Number(one(q.offer));
      const perKg = offer > 0 ? (one(q.offer_unit) === "kg" ? offer : offer / cropDef(crop.data).unit.kg) : undefined;
      const rec = recommend({ crop: crop.data, town, quantity, storage: one(q.storage) !== "0", offer: perKg }, engineData);
      initial = { ...rec, charts: chartsFor(rec) };
    } catch {
      // Unknown town or no market in reach: the empty form.
    }
  }
  if (initial) return <FarmerFlow {...shared} costs={costs} initial={initial} />;
  const saved = readChoice((await cookies()).get(CHOICE_COOKIE)?.value);
  const place = saved && engineData.towns.find((t) => t.id === saved.place.id);
  const start = saved && place ? { crop: saved.crop, place: { id: place.id, name: place.name, county: place.county }, quantity: saved.quantity } : undefined;
  return <FarmerFlow {...shared} costs={costs} start={start} />;
}

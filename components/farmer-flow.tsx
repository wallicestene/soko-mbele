"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { choiceFromCookies, saveChoice } from "@/lib/choice";
import type { ChartData, CropChoice } from "@/lib/data";
import type { Option, Recommendation } from "@/lib/engine";
import { kg, ksh, marketName, quantityText, reported, shortDate, signed, signedKsh, unitPrice } from "@/lib/format";
import type { CropId } from "@/lib/crops";
import type { Town } from "@/lib/types";
import { ForecastChart } from "./forecast-chart";
import { type Place, PlaceCombobox } from "./place-combobox";
import { RollingNumber } from "./rolling-number";
import { Select } from "./select";

type Props = {
  asOf: string;
  crops: CropChoice[];
  towns: Town[];
  initial?: Answer; // a shared link's answer, from the server
  start?: { crop: CropId; place: Place; quantity: number }; // the farmer's last choice
};

export type Answer = Recommendation & { charts: ChartData };

const STEPS = ["Your harvest", "Prices near you", "Next 4 weeks", "Your answer"];
const DEFAULT_TOWN = "Meru";

const noSubscribe = () => () => {};

// The instant static copy of the page can't read cookies, so it picks up the last choice on the phone.
export function FarmerFlow(props: Props) {
  const cookies = useSyncExternalStore(noSubscribe, () => document.cookie, () => "");
  const saved = props.initial || props.start ? null : choiceFromCookies(cookies);
  const start = props.start ?? (saved && props.crops.some((c) => c.id === saved.crop) ? saved : undefined);
  return <Flow key={start ? "saved" : "default"} {...props} start={start} />;
}

function Flow({ asOf, crops, towns, initial, start }: Props) {
  const firstTown = initial?.town ?? start?.place ?? towns.find((t) => t.name === DEFAULT_TOWN) ?? towns[0];
  const firstCrop = crops.find((c) => c.id === (initial?.input.crop ?? start?.crop)) ?? crops[0];
  const [step, setStepState] = useState(initial ? 3 : 0);
  const [dir, setDir] = useState(0);
  const setStep = (n: number) => {
    setDir(n >= step ? 1 : -1);
    setStepState(n);
  };
  const [cropId, setCropId] = useState<CropId>(firstCrop.id);
  const [place, setPlace] = useState<Place>({ id: firstTown.id, name: firstTown.name, county: firstTown.county });
  const town = place.id;
  const [quantity, setQuantity] = useState(String(initial?.input.quantity ?? start?.quantity ?? firstCrop.defaultQuantity));
  const [storage, setStorage] = useState(initial?.input.storage ?? true);
  const [offer, setOffer] = useState(initial?.input.offer ? String(Math.round(initial.input.offer * firstCrop.unit.kg * 100) / 100) : "");
  const [offerUnit, setOfferUnit] = useState<OfferUnit>("unit");
  const [rec, setRec] = useState<Answer | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ field: "quantity" | "offer" | "form"; message: string } | null>(null);

  const crop = crops.find((c) => c.id === cropId)!;
  const groups = useMemo(() => [...new Set(crops.map((c) => c.group))], [crops]);
  const isBags = crop.unit.kg > 1;

  // Focus the new step's heading so screen readers announce it.
  const frame = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (frame.current && frame.current.getBoundingClientRect().top < 0) frame.current.scrollIntoView({ block: "start" });
    heading.current?.focus({ preventScroll: true });
  }, [step]);

  function chooseCrop(id: CropId) {
    const c = crops.find((x) => x.id === id)!;
    setCropId(id);
    setQuantity(String(c.defaultQuantity));
    setError(null);
  }

  // Each answer goes in the address bar, so it can be shared as a link.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(quantity);
    if (!Number.isFinite(n) || n <= 0) {
      setError({ field: "quantity", message: `Enter how many ${crop.unit.plural} you have, for example ${crop.defaultQuantity}.` });
      return;
    }
    if (offer.trim() && !(Number(offer) > 0)) {
      setError({ field: "offer", message: "Enter the broker's price as a number, or leave it empty." });
      return;
    }
    await ask(crop, town, n, storage, { offer, unit: offerUnit });
  }

  async function ask(c: CropChoice, townId: string, n: number, keep: boolean, o: { offer?: string; unit?: OfferUnit; stay?: boolean } = {}) {
    setBusy(true);
    setError(null);
    try {
      const q = new URLSearchParams({ crop: c.id, town: townId, quantity: String(n), storage: keep && c.storable ? "1" : "0" });
      if (Number(o.offer) > 0) {
        q.set("offer", String(Number(o.offer)));
        if (o.unit === "kg") q.set("offer_unit", "kg");
      }
      const res = await fetch(`/api/recommend?${q}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The recommendation could not be worked out.");
      window.history.replaceState(null, "", `/sell?${q}`);
      const r = body as Answer;
      saveChoice({ crop: r.input.crop, place: { id: r.town.id, name: r.town.name, county: r.town.county }, quantity: r.input.quantity });
      setRec(body as Answer);
      if (!o.stay) setStep(1);
    } catch (err) {
      setError({
        field: "form",
        message:
          err instanceof TypeError
            ? "No connection to the price service. Check your data connection and try again."
            : (err as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

  const step1 = (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <h2 ref={heading} tabIndex={-1} className="font-display text-h2 font-semibold outline-none">
        What are you selling?
      </h2>

      <Field label="Crop">
        <Select value={cropId} onChange={(e) => chooseCrop(e.target.value as CropId)} className={selectClass}>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {crops
                .filter((c) => c.group === g)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </Select>
      </Field>

      <PlaceCombobox label="Nearest town or village to your farm" labelClass="text-small font-medium" value={place} onChange={setPlace} />

      <div role="group" aria-labelledby="qty-label" className="flex flex-col gap-2">
        <span id="qty-label" className="text-small font-medium">
          {isBags ? "How many bags?" : "How many kilograms?"}
        </span>
        <div className="flex items-stretch gap-2">
          <Stepper label={isBags ? "One bag fewer" : "50 kg fewer"} onClick={() => setQuantity(String(Math.max(isBags ? 1 : 50, (Number(quantity) || 0) - (isBags ? 1 : 50))))}>
            −
          </Stepper>
          <input
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/[^0-9.]/g, ""))}
            aria-labelledby="qty-label"
            aria-describedby={error?.field === "quantity" ? "qty-unit qty-error" : "qty-unit"}
            aria-invalid={error?.field === "quantity"}
            className="num h-12 w-full min-w-0 rounded-control border border-rule bg-card px-3 text-center text-h2 font-semibold aria-invalid:border-down-ink"
          />
          <Stepper label={isBags ? "One bag more" : "50 kg more"} onClick={() => setQuantity(String((Number(quantity) || 0) + (isBags ? 1 : 50)))}>
            +
          </Stepper>
        </div>
        <span id="qty-unit" className="text-caption text-subtle">
          {crop.unit.plural}
        </span>
        {error?.field === "quantity" && (
          <p id="qty-error" role="alert" className="text-small text-down-ink">
            {error.message}
          </p>
        )}
      </div>

      {crop.storable ? (
        <Choice
          legend="Can you keep the harvest for a few weeks?"
          value={storage ? "yes" : "no"}
          onChange={(v) => setStorage(v === "yes")}
          options={[
            { value: "yes", label: "Yes, I can wait" },
            { value: "no", label: "No, I sell now" },
          ]}
        />
      ) : (
        <p className="text-small text-subtle">Fresh produce can&apos;t wait, so we&apos;ll show you where to sell today.</p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="offer" className="text-small font-medium">
          Has a broker offered you a price? <span className="font-normal text-subtle">Optional</span>
        </label>
        <OfferInput
          id="offer"
          value={offer}
          onChange={setOffer}
          unit={offerUnit}
          onUnit={setOfferUnit}
          isBags={isBags}
          invalid={error?.field === "offer"}
          describedBy={error?.field === "offer" ? "offer-error" : "offer-hint"}
        />
        {error?.field === "offer" ? (
          <p id="offer-error" role="alert" className="text-small text-down-ink">
            {error.message}
          </p>
        ) : (
          <p id="offer-hint" className="text-caption text-pretty text-subtle">
            We will tell you whether to take it, and the lowest price worth taking.
          </p>
        )}
      </div>

      {error?.field === "form" && (
        <p role="alert" className="text-small text-down-ink">
          {error.message}
        </p>
      )}

      <div className={`flex ${PINNED}`}>
        <PrimaryButton type="submit" disabled={busy}>
          {busy ? "Working it out…" : "See prices near you"}
        </PrimaryButton>
      </div>
    </form>
  );

  return (
    <section ref={frame} aria-label="Soko Mbele app" className="w-full scroll-mt-4 overflow-clip rounded-board border border-rule bg-card">
      <header className="border-b border-rule px-4 pb-3 pt-4 sm:px-6">
        <ol className="grid grid-cols-4 gap-1.5">
          {STEPS.map((s, i) => {
            const reachable = i !== step && (i === 0 || rec !== null);
            const bar = (
              <span aria-hidden className="block h-1 overflow-hidden rounded-pill bg-rule">
                <span className={`block h-full origin-left bg-brand transition-transform duration-300 ease-out motion-reduce:transition-none ${i <= step ? "scale-x-100" : "scale-x-0"}`} />
              </span>
            );
            const name = <span className={`mt-2 hidden text-caption sm:block ${i === step ? "font-medium text-body" : "text-subtle group-hover:text-body"}`}>{s}</span>;
            return (
              <li key={s} aria-current={i === step ? "step" : undefined}>
                {reachable ? (
                  <button type="button" onClick={() => setStep(i)} className="group relative block w-full text-left before:absolute before:inset-x-0 before:-inset-y-5 before:content-[''] sm:before:hidden" aria-label={`Go to: ${s}`}>
                    {bar}
                    {name}
                  </button>
                ) : (
                  <>
                    {bar}
                    {name}
                  </>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 flex justify-between text-caption sm:hidden">
          <span className="font-medium text-body">{STEPS[step]}</span>
          <span className="num text-subtle">{step + 1} of 4</span>
        </p>
      </header>

      <div key={step} className={`px-4 py-6 sm:px-6 sm:py-8 ${dir > 0 ? "step-forward" : dir < 0 ? "step-back" : ""}`}>
        {step === 0 && step1}
        {step === 1 && rec && <PricesNear rec={rec} asOf={asOf} heading={heading} onNext={() => setStep(2)} onBack={() => setStep(0)} />}
        {step === 2 && rec && <ForecastStep rec={rec} heading={heading} onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && rec && (
          <RecommendationStep
            rec={rec}
            heading={heading}
            busy={busy}
            onBack={() => setStep(2)}
            onRestart={() => setStep(0)}
            onCompare={(o, u) => {
              setOffer(o);
              setOfferUnit(u);
              const c = crops.find((x) => x.id === rec.input.crop)!;
              void ask(c, rec.input.town, rec.input.quantity, rec.input.storage, { offer: o, unit: u, stay: true });
            }}
          />
        )}
      </div>
    </section>
  );
}

type StepProps = { rec: Answer; heading: React.RefObject<HTMLHeadingElement | null>; onNext: () => void; onBack: () => void };

function StepHeading({ heading, children, sub }: { heading: StepProps["heading"]; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <h2 ref={heading} tabIndex={-1} className="font-display text-h2 font-semibold text-balance outline-none">
        {children}
      </h2>
      {sub && <p className="mt-1 text-small text-pretty text-subtle">{sub}</p>}
    </div>
  );
}

// Screen 2

function PricesNear({ rec, asOf, heading, onNext, onBack }: StepProps & { asOf: string }) {
  const today = rec.options.filter((o) => o.weeks === 0).sort((a, b) => b.price - a.price);
  const bestToday = rec.options.find((o) => o.weeks === 0)!;

  return (
    <div className="flex flex-col gap-6">
      <StepHeading heading={heading} sub={`What each market pays per kilo, and what you keep per kilo after paying to get there from ${rec.town.name}.`}>
        {rec.crop.name} near {rec.town.name}
      </StepHeading>

      <table className="num w-full text-small">
        <thead>
          <tr className="text-left text-caption text-subtle">
            <th className="pb-2 font-medium">Market</th>
            <th className="pb-2 text-right font-medium">Price</th>
            <th className="pb-2 pl-3 text-right font-medium">You keep</th>
          </tr>
        </thead>
        <tbody>
          {today.map((o) => (
            <tr key={o.id} className="border-t border-rule align-baseline">
              <td className="py-3 pr-2">
                <span className="text-copy font-medium">{o.label}</span>
                <span className="block text-caption text-subtle">
                  {Math.round(o.km)} km, {reported(o.observed!, asOf)}
                </span>
                {(o.id === rec.baseline.id || o.id === bestToday.id) && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {o.id === rec.baseline.id && <Tag>nearest</Tag>}
                    {o.id === bestToday.id && <Tag strong>pays you most</Tag>}
                  </span>
                )}
              </td>
              <td className="py-3 text-right font-display text-copy font-semibold">{kg(o.price)}</td>
              <td className="py-3 pl-3 text-right">{kg(o.net / o.kg)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {rec.notCompared.length > 0 && (
        <details className="text-caption text-subtle">
          <summary className="cursor-pointer py-2.5 underline-offset-4 hover:underline">
            {rec.notCompared.length === 1 ? "1 more market" : `${rec.notCompared.length} more markets`} near you had no recent price, so
            {rec.notCompared.length === 1 ? " it is" : " they are"} not compared
          </summary>
          <p className="mt-1 text-pretty">{rec.notCompared.map((n) => marketName(n.market)).join(", ")}.</p>
        </details>
      )}
      {rec.outOfLine.length > 0 && (
        <p className="text-caption text-pretty text-subtle">
          Not suggested, because the price is hard to believe:{" "}
          {rec.outOfLine
            .map((o) =>
              o.why === "usually_high"
                ? `${marketName(o.market)} (usually ${o.ratio.toFixed(1)}× the rest of the country)`
                : `${marketName(o.market)} (${o.ratio.toFixed(1)}× the markets around it)`,
            )
            .join(", ")}
          . A price that far out of line is usually a different grade, a different measure or a typing mistake. Call ahead if you want
          to try it.
        </p>
      )}

      <StepButtons onBack={onBack} onNext={onNext} next={rec.crop.storable ? "See the next 4 weeks" : "See the price outlook"} />
    </div>
  );
}

// Screen 3

function ForecastStep({ rec, heading, onNext, onBack }: StepProps) {
  const [shown, setShown] = useState(rec.charts[0]?.market);
  const chart = rec.charts.find((c) => c.market === shown);

  return (
    <div className="flex flex-col gap-6">
      <StepHeading heading={heading} sub={`${rec.crop.name} at ${chart ? marketName(chart.market) : "your market"}, KSh per kg`}>
        Next 4 weeks
      </StepHeading>

      {rec.charts.length > 1 && (
        <div role="tablist" aria-label="Market" className="flex flex-wrap gap-2">
          {rec.charts.map((c) => (
            <button
              key={c.market}
              role="tab"
              aria-selected={c.market === shown}
              onClick={() => setShown(c.market)}
              className={`min-h-11 rounded-pill border px-4 text-small ${c.market === shown ? "border-brand bg-mint font-medium text-body" : "border-rule text-subtle hover:text-body"}`}
            >
              {marketName(c.market)}
            </button>
          ))}
        </div>
      )}

      {chart && chart.forecasts.length ? (
        <>
          <ForecastChart history={chart.history} forecasts={chart.forecasts} />
          <table className="num w-full text-small">
            <thead>
              <tr className="text-left text-caption text-subtle">
                <th className="pb-1 font-medium">Week of</th>
                <th className="pb-1 text-right font-medium">Likely price</th>
                <th className="pb-1 text-right font-medium">Could be</th>
              </tr>
            </thead>
            <tbody>
              {chart.forecasts.map((f) => (
                <tr key={f.date} className="border-t border-rule">
                  <td className="py-2">{shortDate(f.date)}</td>
                  <td className="py-2 text-right font-semibold">{kg(f.predicted_price)}</td>
                  <td className="py-2 text-right text-subtle">
                    {kg(f.lower)}–{kg(f.upper)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-caption text-pretty text-subtle">
            {rec.crop.storable
              ? "When we tested this on past prices, the real price landed inside this range about 8 times out of 10."
              : "Fresh produce can't wait, so use this to plan your next harvest."}
          </p>
        </>
      ) : (
        <p className="text-small text-pretty text-subtle">
          {chart ? marketName(chart.market) : "This market"} has not reported often enough lately for a forecast. The recommendation uses
          the latest prices.
        </p>
      )}

      <StepButtons onBack={onBack} onNext={onNext} next="See recommendation" />
    </div>
  );
}

// Screen 4

function RecommendationStep({
  rec,
  heading,
  busy,
  onBack,
  onRestart,
  onCompare,
}: Omit<StepProps, "onNext"> & { busy: boolean; onRestart: () => void; onCompare: (offer: string, unit: OfferUnit) => void }) {
  const { best, baseline, runnerUp, action, crop } = rec;
  const staying = action === "sell_nearest";
  const other = staying ? (rec.options.find((o) => o.weeks === 0 && o.id !== baseline.id) ?? runnerUp) : best;
  const qty = quantityText(crop, rec.input.quantity);
  const when = (o: Option) => (o.weeks ? `in ${o.weeks} wk` : shortDate(o.observed!));

  return (
    <div className="flex flex-col gap-6">
      <div className="-mx-4 -mt-6 bg-ink px-4 pb-6 pt-5 text-chalk sm:-mx-6 sm:-mt-8 sm:px-6 sm:pt-6">
        <h2 ref={heading} tabIndex={-1} className="font-display text-h2 font-semibold text-balance outline-none">
          {rec.headline}
        </h2>
        {other && (
          <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-end gap-3 border-t border-line pt-4">
            <PriceSide label={`${baseline.label}, ${when(baseline)}`} price={baseline.price} />
            <span className="num pb-1 text-small text-muted">{signed(other.price - baseline.price)}/kg</span>
            <PriceSide label={`${other.label}, ${when(other)}`} price={other.price} align="right" />
          </div>
        )}
        <p className="mt-6 flex flex-wrap items-baseline gap-x-2 text-grain">
          <span className="expanded text-h2 font-bold">{staying ? "KSh" : "+KSh"}</span>
          <span className="expanded font-bold" style={{ fontSize: "clamp(40px, 13vw, 56px)" }}>
            <RollingNumber value={Math.round(staying ? baseline.net : best.gainVsBaseline).toLocaleString("en-KE")} rollIn delay={150} />
          </span>
        </p>
        <p className="mt-1 text-small text-pretty text-muted">
          {staying
            ? `what you take home for ${qty} at ${baseline.label}, after transport`
            : `more than selling at ${baseline.label}, after transport${best.weeks ? " and storage" : ""}`}
        </p>
        {staying && other && (
          <p className="num mt-3 border-t border-line pt-3 text-small text-pretty text-chalk">
            {other.label}, {other.weeks ? `in ${other.weeks} week${other.weeks === 1 ? "" : "s"}` : `${Math.round(other.km)} km away`}:{" "}
            {other.gainVsBaseline >= 0 ? `only ${ksh(other.gainVsBaseline)} more` : `${ksh(-other.gainVsBaseline)} less`} after{" "}
            {other.weeks ? "storage" : "transport"}.
          </p>
        )}
      </div>

      <BrokerBlock rec={rec} busy={busy} onCompare={onCompare} />

      <p className="text-copy text-pretty">{rec.evidence}</p>

      {rec.warnings.map((w) => (
        <p key={w} className="rounded-board border border-rule bg-paper px-3 py-2.5 text-small text-pretty">
          {w}
        </p>
      ))}

      <Workings
        pick={staying ? baseline : best}
        alt={(staying ? other : baseline) ?? undefined}
        altNote={staying ? "Next best" : "Your nearest"}
        crop={crop}
        quantity={rec.input.quantity}
        threshold={rec.threshold}
        note={costNote(rec.threshold)}
      />

      <figure>
        <figcaption className="text-small font-medium">The same answer by SMS</figcaption>
        <p className="mt-2 rounded-board border border-rule bg-paper px-3 py-2 text-small text-pretty">{rec.sms}</p>
        <p className="num mt-1 text-caption text-subtle">{rec.sms.length} of 160 characters, any phone</p>
      </figure>

      {rec.options.length > 1 && (
        <div>
          <h3 className="text-small font-medium">Your other choices, safest first</h3>
          <ul className="mt-2">
            {rec.options.slice(0, 6).map((o) => (
              <li key={o.id} className="num grid grid-cols-[1fr_auto] items-baseline gap-x-4 border-b border-rule py-2 text-small">
                <span>
                  {o.label}, {o.weeks ? `in ${o.weeks} wk` : "today"}{" "}
                  {o.id === best.id && <Tag strong>recommended</Tag>}
                  {o.id === baseline.id && o.id !== best.id && <Tag>nearest</Tag>}
                </span>
                <span className="text-right">
                  {o.id === baseline.id ? (
                    <span className="text-subtle">{ksh(o.net)}</span>
                  ) : (
                    <span className={o.gainLowVsBaseline > 0 ? "text-up-ink" : o.gainVsBaseline < 0 ? "text-down-ink" : "text-subtle"}>
                      {signedKsh(o.gainVsBaseline)}
                    </span>
                  )}
                  {o.id !== baseline.id && Math.abs(o.gainLowVsBaseline - o.gainVsBaseline) >= 1 && (
                    <span className="block text-caption text-subtle">or {signedKsh(o.gainLowVsBaseline)} if prices come in low</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-3">
        <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        <PrimaryButton onClick={onRestart}>Change crop or place</PrimaryButton>
      </div>
    </div>
  );
}

// The broker at the gate

type OfferUnit = "unit" | "kg";

function BrokerBlock({ rec, busy, onCompare }: { rec: Answer; busy: boolean; onCompare: (offer: string, unit: OfferUnit) => void }) {
  const { broker, walkAway, crop } = rec;
  const isBags = crop.unit.kg > 1;
  const [offer, setOffer] = useState("");
  const [unit, setUnit] = useState<OfferUnit>("unit");
  const [invalid, setInvalid] = useState(false);
  const where = `${walkAway.option.label}${walkAway.option.weeks ? ` in ${walkAway.option.weeks} week${walkAway.option.weeks === 1 ? "" : "s"}` : ""}`;
  const verdictTone = broker?.verdict === "sell_yourself" ? "text-up-ink" : "text-body";

  return (
    <section aria-labelledby="broker-title" aria-live="polite" aria-busy={busy} className={`rounded-board border border-rule bg-paper p-4 sm:p-5 ${busy ? "opacity-70" : ""}`}>
      {broker ? (
        <>
          <h3 id="broker-title" className={`font-display text-[20px] font-semibold leading-snug text-balance ${verdictTone}`}>
            {broker.headline}
          </h3>
          <p className="mt-2 text-copy text-pretty">{broker.evidence}</p>
        </>
      ) : (
        <>
          <h3 id="broker-title" className="font-display text-[20px] font-semibold leading-snug text-balance">
            A broker at your gate?
          </h3>
          <p className="mt-2 text-copy text-pretty">
            Don&apos;t sell for less than <strong className="num font-semibold">{unitPrice(walkAway.perUnit, crop)}</strong>. That is what {where}{" "}
            leaves you after the trip, even if prices come in low.
          </p>
        </>
      )}
      <form
        className="mt-4 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!(Number(offer) > 0)) return setInvalid(true);
          setInvalid(false);
          onCompare(offer, unit);
        }}
      >
        <label htmlFor="broker-offer" className="text-small font-medium">
          {broker ? "Try another offer" : "Their offer"}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="min-w-0 flex-1">
            <OfferInput id="broker-offer" value={offer} onChange={setOffer} unit={unit} onUnit={setUnit} isBags={isBags} invalid={invalid} />
          </div>
          <SecondaryButton type="submit" disabled={busy}>
            {busy ? "Comparing…" : "Compare"}
          </SecondaryButton>
        </div>
        {invalid && (
          <p role="alert" className="text-small text-down-ink">
            Enter the broker&apos;s price as a number.
          </p>
        )}
      </form>
      {broker && (
        <p className="mt-3 text-small text-subtle">
          The lowest price worth taking: <span className="num font-medium text-body">{unitPrice(walkAway.perUnit, crop)}</span>.
        </p>
      )}
    </section>
  );
}

function OfferInput({
  id,
  value,
  onChange,
  unit,
  onUnit,
  isBags,
  invalid = false,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  unit: OfferUnit;
  onUnit: (u: OfferUnit) => void;
  isBags: boolean;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="flex gap-2">
      <span className="relative min-w-0 flex-1">
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-copy text-subtle">
          KSh
        </span>
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ""))}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className="num h-12 w-full min-w-0 rounded-control border border-rule bg-card pl-12 pr-3 text-copy aria-invalid:border-down-ink"
        />
      </span>
      {isBags ? (
        <div role="radiogroup" aria-label="Price for" className="grid shrink-0 grid-cols-2 overflow-hidden rounded-control border border-rule">
          {(["unit", "kg"] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              onClick={() => onUnit(u)}
              className={`h-12 px-3 text-small transition-colors ${unit === u ? "bg-mint font-semibold text-brand" : "bg-card text-subtle hover:text-body"}`}
            >
              {u === "unit" ? "a bag" : "a kilo"}
            </button>
          ))}
        </div>
      ) : (
        <span className="flex h-12 shrink-0 items-center text-small text-subtle">a kilo</span>
      )}
    </div>
  );
}

function costNote(threshold: number) {
  return `We only suggest a trip or a wait that pays at least ${ksh(threshold)} more, even if prices fall.`;
}

function PriceSide({ label, price, align = "left" }: { label: string; price: number; align?: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <p className="text-caption text-muted">{label}</p>
      <p className="num font-display text-h2 font-semibold">{kg(price)}</p>
    </div>
  );
}

type Line = { label: string; value: number; minus?: boolean; notes: string[] };

// One market at a time, read top to bottom like a receipt; the switch shows the other choice.
function Workings({ pick, alt, altNote, crop, quantity, threshold, note }: { pick: Option; alt?: Option; altNote: string; crop: Recommendation["crop"]; quantity: number; threshold: number; note: string }) {
  const [showAlt, setShowAlt] = useState(false);
  const o = showAlt && alt ? alt : pick;
  const other = o === pick ? alt : pick;
  const when = (x: Option) => (x.weeks ? `in ${x.weeks} week${x.weeks === 1 ? "" : "s"}` : "today");
  const t = o.trip;
  const per = crop.unit.kg > 1 ? "a bag" : "a kilo";
  const perUnit = (x: number) => (crop.unit.kg > 1 ? ksh(x / (o.kg / crop.unit.kg)) : `KSh ${(x / o.kg).toFixed(2)}`);
  const time = o.hours < 1 ? "under an hour" : `about ${Math.round(o.hours * 2) / 2} hours`;
  const lines: Line[] = [
    { label: "Sale", value: o.gross, notes: [`${o.kg.toLocaleString("en-KE")} kg × KSh ${kg(o.price)} a kilo`, o.weeks ? `Forecast for ${shortDate(o.sellDate)}` : `Reported ${shortDate(o.observed!)}`] },
    {
      label: "Transport",
      value: t.freight,
      minus: true,
      notes: [t.mode === "shared" ? `${perUnit(t.freight)} ${per} on a lorry or matatu` : `${t.trips > 1 ? `${t.trips} hired ${t.mode}s` : `A hired ${t.mode}`}`, `${Math.round(o.km)} km, ${time} each way`],
    },
    { label: "Loading and market fee", value: t.handling + t.marketFee, minus: true, notes: [`Loading ${ksh(t.handling)}, market fee ${ksh(t.marketFee)}`] },
    { label: "Your trip", value: t.fare + t.time, minus: true, notes: [t.fare ? `Fare ${ksh(t.fare)}, your time ${ksh(t.time)}` : `You ride with the load. Your time ${ksh(t.time)}`] },
  ];
  if (o.storage + o.loss > 0) lines.push({ label: `Keeping it ${o.weeks} week${o.weeks === 1 ? "" : "s"}`, value: o.storage + o.loss, minus: true, notes: [`Storage ${ksh(o.storage)}, lost in store ${ksh(o.loss)}`] });
  const diff = other ? o.net - other.net : 0;
  // The recommended choice leaves less only when the other's gain is too small or too uncertain to count on.
  const pickWins = o === pick ? diff >= 0 : diff <= 0;
  const notPicked = o === pick ? other : o;
  const tabs = alt ? [{ x: pick, label: "Recommended" }, { x: alt, label: altNote }] : [];

  return (
    <details className="group rounded-board border border-rule bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="font-display text-[20px] font-semibold">How we worked it out</span>
        <svg viewBox="0 0 20 20" aria-hidden className="size-5 shrink-0 fill-none stroke-current text-subtle transition-transform group-open:rotate-180">
          <path d="M5 7.5l5 5 5-5" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="px-4 pb-5 sm:px-5">
        {alt && (
          <div role="tablist" aria-label="Market" className="grid grid-cols-2 gap-2">
            {tabs.map(({ x, label }) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                aria-selected={x === o}
                onClick={() => setShowAlt(x === alt)}
                className={`min-w-0 rounded-control border px-3 py-2 text-left transition-colors ${x === o ? "border-brand bg-mint" : "border-rule hover:border-subtle"}`}
              >
                <span className="block truncate text-small font-medium">{x.label}</span>
                <span className="block text-caption text-subtle">{label}</span>
              </button>
            ))}
          </div>
        )}
        <p className="mt-4 text-small text-subtle">
          {o.label}, {when(o)}, {quantityText(crop, quantity)}
          {crop.unit.kg > 1 ? ` (${o.kg.toLocaleString("en-KE")} kg)` : ""}
        </p>
        <dl className="num mt-1" role={alt ? "tabpanel" : undefined}>
          {lines.map((l) => (
            <div key={l.label} className="flex items-start justify-between gap-4 py-3">
              <dt className="min-w-0">
                <span className="text-copy">{l.label}</span>
                {l.notes.map((n) => (
                  <span key={n} className="block text-small text-pretty text-subtle">
                    {n}
                  </span>
                ))}
              </dt>
              <dd className="shrink-0 text-copy">
                {l.minus ? "− " : ""}
                {ksh(l.value)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-x-4 border-t border-rule pt-4">
          <span className="font-display text-[20px] font-semibold">You take home</span>
          <span className={`expanded num text-[30px] font-bold leading-tight ${o === pick ? "text-up-ink" : "text-body"}`}>{ksh(o.net)}</span>
        </div>
        {other && pickWins && (
          <p className={`num mt-2 text-small ${o === pick ? "font-medium text-up-ink" : "text-subtle"}`}>
            {ksh(Math.abs(diff))} {diff >= 0 ? "more" : "less"} than at {other.label}, {when(other)}
          </p>
        )}
        {other && notPicked && !pickWins && (
          <p className="num mt-2 text-small text-pretty text-subtle">
            {notPicked.label}, {when(notPicked)}, could leave {ksh(Math.abs(diff))} more, but if prices come in low the gain is under the{" "}
            {ksh(threshold)} we ask for, so we don&apos;t suggest it.
          </p>
        )}
        {o.netLow < o.net - 0.5 && <p className="num mt-1 text-small text-subtle">If prices come in low: {ksh(o.netLow)}</p>}
        <p className="mt-4 border-t border-rule pt-4 text-caption text-pretty text-subtle">{note}</p>
      </div>
    </details>
  );
}

// Controls

const selectClass = "h-12 w-full min-w-0 rounded-control border border-rule bg-card px-3 text-copy";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-small font-medium">{label}</span>
      {children}
    </label>
  );
}

function Tag({ children, strong = false }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <span className={`inline-block rounded-pill border px-2 text-caption ${strong ? "border-body text-body" : "border-rule text-subtle"}`}>
      {children}
    </span>
  );
}

function Choice({
  legend,
  value,
  onChange,
  options,
}: {
  legend: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-small font-medium">{legend}</legend>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex h-12 cursor-pointer items-center justify-center rounded-control border px-3 text-copy has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-body ${
              value === o.value ? "border-brand bg-mint font-medium text-body" : "border-rule bg-card"
            }`}
          >
            <input type="radio" className="sr-only" name={legend} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Stepper({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className="h-12 w-12 shrink-0 rounded-control border border-rule text-h2">
      {children}
    </button>
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="h-12 grow rounded-control bg-brand px-4 font-medium text-card transition-colors hover:bg-brand-hover disabled:opacity-60" />;
}

function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} className="h-12 rounded-control border border-rule px-4 font-medium" />;
}

// On a phone the next step stays in reach while a long list scrolls.
const PINNED = "sticky bottom-0 z-10 -mx-4 -mb-6 border-t border-rule bg-card px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:mb-0 sm:border-0 sm:p-0";

function StepButtons({ onBack, onNext, next }: { onBack: () => void; onNext: () => void; next: string }) {
  return (
    <div className={`flex gap-3 ${PINNED}`}>
      <SecondaryButton onClick={onBack}>Back</SecondaryButton>
      <PrimaryButton onClick={onNext}>{next}</PrimaryButton>
    </div>
  );
}

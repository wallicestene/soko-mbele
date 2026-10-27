"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { CropChoice } from "@/lib/data";
import type { Recommendation } from "@/lib/engine";
import { saveChoice } from "@/lib/choice";
import { kg, ksh, quantityText, shortDate } from "@/lib/format";
import { type Place, PlaceCombobox } from "../place-combobox";
import { RollingNumber } from "../rolling-number";
import { Select } from "../select";

export function SaleSlip({ initial, crops, intro }: { initial: Recommendation; crops: CropChoice[]; intro: ReactNode }) {
  const [rec, setRec] = useState(initial);
  const [crop, setCrop] = useState(initial.input.crop as string);
  const [place, setPlace] = useState<Place>({ id: initial.town.id, name: initial.town.name, county: initial.town.county });
  const town = place.id;
  const [quantity, setQuantity] = useState(String(initial.input.quantity));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cropDef = crops.find((c) => c.id === crop)!;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function ask(c: string, t: string, q: string) {
    const n = Number(q);
    if (!Number.isFinite(n) || n <= 0) return setError("Enter a quantity above zero.");
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ crop: c, town: t, quantity: String(n), storage: "1" });
      const res = await fetch(`/api/recommend?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      const r = body as Recommendation;
      setRec(r);
      saveChoice({ crop: r.input.crop, place: { id: r.town.id, name: r.town.name, county: r.town.county }, quantity: r.input.quantity });
    } catch (e) {
      setError(e instanceof TypeError ? "No connection. Check your data connection and try again." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Typing a quantity waits for a pause.
  function change(next: { crop?: string; town?: string; quantity?: string }, delay = 0) {
    const c = next.crop ?? crop;
    const t = next.town ?? town;
    let q = next.quantity ?? quantity;
    if (next.crop) {
      q = String(crops.find((x) => x.id === next.crop)!.defaultQuantity);
      setQuantity(q);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void ask(c, t, q), delay);
  }
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const link = `/sell?${new URLSearchParams({ crop: rec.input.crop, town: rec.input.town, quantity: String(rec.input.quantity), storage: "1" })}`;
  const field = "h-12 w-full min-w-0 rounded-control border border-rule bg-card px-3 text-copy text-body";

  return (
    <div className="grid min-h-[calc(100svh-88px)] [grid-template-areas:'intro'_'form'_'answer'_'stage'] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'intro_stage'_'form_stage']">
      <div className="px-4 pt-2 [grid-area:intro] sm:px-8 sm:pt-6 lg:pl-[max(40px,calc((100vw-1360px)/2+40px))] lg:pr-12 lg:pt-16">{intro}</div>
      <form
        className="mx-4 mb-0 mt-6 grid max-w-[460px] grid-cols-[minmax(0,1fr)_8.5rem] gap-x-3 gap-y-4 [grid-area:form] sm:mx-8 sm:mt-8 lg:mb-20 lg:ml-[max(40px,calc((100vw-1360px)/2+40px))] lg:mr-12 lg:mt-10 lg:self-start"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(crop, town, quantity);
        }}
        aria-describedby={error ? "slip-error" : undefined}
      >
        <label className="flex flex-col gap-1.5 text-small font-medium text-body">
          What are you selling?
          <Select className={field} value={crop} onChange={(e) => (setCrop(e.target.value), change({ crop: e.target.value }))}>
            {[...new Set(crops.map((c) => c.group))].map((g) => (
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
        </label>
        <label className="flex flex-col gap-1.5 text-small font-medium text-body">
          How much? <span className="sr-only">in {cropDef.unit.plural}</span>
          <span className="relative">
            <input
              className={`${field} num pr-14`}
              inputMode="decimal"
              value={quantity}
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9.]/g, "");
                setQuantity(v);
                change({ quantity: v }, 600);
              }}
            />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-small text-subtle">
              {cropDef.unit.kg > 1 ? cropDef.unit.plural.replace(/^\d+ kg /, "") : "kg"}
            </span>
          </span>
        </label>
        <div className="col-span-2">
          <PlaceCombobox
            label="Nearest town or village to your farm"
            labelClass="text-small font-medium text-body"
            value={place}
            onChange={(p) => (setPlace(p), change({ town: p.id }))}
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="col-span-2 mt-1 h-12 rounded-control bg-brand px-5 font-medium text-card transition-colors hover:bg-brand-hover active:translate-y-px disabled:opacity-70"
        >
          {busy ? "Working it out…" : "See where to sell"}
        </button>
        {error && (
          <p id="slip-error" role="alert" className="col-span-2 text-small text-down-ink">
            {error}
          </p>
        )}
      </form>

      {/* Phones: the answer under the form, inside the first screen. */}
      <div className="mx-4 mt-6 rounded-board bg-ink px-4 py-4 [grid-area:answer] sm:mx-8 lg:hidden" aria-hidden>
        <p className="flex flex-wrap items-baseline gap-x-2 text-grain">
          <span className="expanded text-h2 font-bold">{rec.action === "sell_nearest" ? "KSh" : "+KSh"}</span>
          <RollingNumber
            className="expanded text-[48px] font-bold"
            value={Math.round(rec.action === "sell_nearest" ? rec.baseline.net : rec.best.gainVsBaseline).toLocaleString("en-KE")}
            rollIn
            delay={300}
          />
        </p>
        <p className="mt-2 text-[18px] text-pretty text-chalk">
          {rec.action === "sell_nearest"
            ? `${rec.headline}.`
            : `${rec.headline}: KSh ${Math.round(rec.best.gainVsBaseline).toLocaleString("en-KE")} more than at ${rec.baseline.label}, after transport${rec.best.weeks ? " and storage" : ""}.`}
        </p>
      </div>

      <div className="stage mt-6 bg-brand px-4 pb-12 pt-16 [grid-area:stage] sm:mt-10 sm:px-8 sm:pt-24 lg:mt-0 lg:px-14 lg:pb-16 lg:pt-32">
        <SlipPaper rec={rec} link={link} busy={busy} />
      </div>
    </div>
  );
}

function Line({ label, value, strong = false, sub }: { label: string; value: string; strong?: boolean; sub?: string }) {
  return (
    <div className={`grid grid-cols-[1fr_auto] items-baseline gap-4 py-1.5 sm:py-2 ${strong ? "border-t-2 border-body pt-3 font-semibold" : ""}`}>
      <span className="text-body">
        {label}
        {sub && <span className="block text-caption font-normal text-subtle">{sub}</span>}
      </span>
      <RollingNumber className="font-display text-body" value={value} />
    </div>
  );
}

export function SlipPaper({ rec, link, busy }: { rec: Recommendation; link: string; busy: boolean }) {
  const { best, baseline, action, crop } = rec;
  const staying = action === "sell_nearest";
  const sale = staying ? baseline : best;
  const qty = quantityText(crop, rec.input.quantity);

  return (
    <div className="slip-slot max-w-[640px]">
      {/* The till's mouth the slip feeds out of. */}
      <div aria-hidden className="-mx-2 h-1.5 rounded-board bg-ink" />
      <div className="feed-slot">
      <article
        aria-live="polite"
        aria-busy={busy}
        className={`feed w-full rounded-b-board bg-paper text-body transition-opacity ${busy ? "opacity-70" : ""}`}
      >
        <div className="px-6 pb-2 pt-6 sm:px-8 sm:pt-7">
          <div className="flex items-baseline justify-between gap-4 text-small text-subtle">
            <span>
              {crop.name}, {qty}
            </span>
            <span className="num">From {rec.town.name}</span>
          </div>
          <h2 className="mt-3 font-display text-h2 font-semibold text-balance">
            {rec.headline}
          </h2>

          <div className="mt-4 text-small">
            <Line label={`${sale.label}, ${Math.round(sale.km)} km`} sub={sale.weeks ? `forecast for ${shortDate(sale.sellDate)}` : `reported ${shortDate(sale.observed!)}`} value={`${kg(sale.price)}/kg`} />
            <Line label={`× ${sale.kg.toLocaleString("en-KE")} kg`} value={ksh(sale.gross)} />
            <Line label="− transport" value={ksh(sale.transport)} />
            {sale.storage + sale.loss > 0 && <Line label="− storage and losses" value={ksh(sale.storage + sale.loss)} />}
            <Line label="= you take home" value={ksh(sale.net)} strong />
            {!staying && (
              <Line label={`At ${baseline.label}, ${rec.baselineName} (${Math.round(baseline.km)} km)`} value={ksh(baseline.net)} />
            )}
          </div>

          <div className="mt-5 rounded-board bg-ink px-5 py-5 text-chalk">
            {/* Gold from lg only: below it the compact answer is the gold one. */}
            <p className="flex flex-wrap items-baseline gap-x-2 text-chalk lg:text-grain">
              <span className="expanded text-h2 font-bold">{staying ? "KSh" : "+KSh"}</span>
              <span className="expanded font-bold" style={{ fontSize: "clamp(56px, 7.6vw, 112px)" }}>
                <RollingNumber value={Math.round(staying ? baseline.net : best.gainVsBaseline).toLocaleString("en-KE")} rollIn delay={900} />
              </span>
            </p>
            <p className="mt-1 text-small text-balance text-muted">
              {staying ? "no other market pays you more after transport" : `more than selling at ${baseline.label}, after transport`}
            </p>
          </div>

          <p className="mt-4 text-small text-pretty">
            A broker at your gate must offer at least{" "}
            <RollingNumber
              className="font-semibold"
              value={crop.unit.kg > 1 ? ksh(rec.walkAway.perUnit) : `KSh ${rec.walkAway.perUnit.toFixed(2)}`}
            />{" "}
            {crop.unit.kg > 1 ? "a bag" : "a kilo"} to beat this.
          </p>
        </div>

        <div className="mt-4 border-t-2 border-dotted border-rule px-6 pb-6 pt-4 sm:px-8">
          <p className="text-caption text-subtle">By SMS, on any phone</p>
          <p className="mt-1 text-small text-pretty">{rec.sms}</p>
        </div>
      </article>
      </div>
      <p className="mt-4 text-small text-card">
        <Link href={link} className="underline underline-offset-4 hover:text-mint">
          See the full answer, with every market and the next 4 weeks
        </Link>
      </p>
    </div>
  );
}

"use client";

import { Combobox, ComboboxInput, ComboboxOption, ComboboxOptions, Field, Label } from "@headlessui/react";
import { useEffect, useState } from "react";

export type Place = { id: string; name: string; county: string };

// Searched on the server as the farmer types, so the ~7,900 places never travel to the phone.
export function PlaceCombobox({ value, onChange, label, labelClass }: { value: Place; onChange: (p: Place) => void; label: string; labelClass: string }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ q: string; places: Place[] } | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/places?${new URLSearchParams({ q: query })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { places: [] }))
        .then((b) => setFound({ q: query, places: b.places }))
        .catch(() => {});
    }, 120);
    return () => (clearTimeout(t), ctl.abort());
  }, [query]);

  const typed = query.trim().length >= 2;
  const searching = typed && found?.q !== query;
  const places = typed && found ? found.places : [];

  return (
    <Field className="flex flex-col gap-1.5">
      <Label className={labelClass}>{label}</Label>
      <Combobox value={value} by="id" onChange={(p: Place | null) => p && onChange(p)} onClose={() => setQuery("")}>
        <ComboboxInput
          className="h-12 w-full min-w-0 rounded-control border border-rule bg-card px-3 text-copy text-body placeholder:text-subtle"
          displayValue={(p: Place | null) => (p ? `${p.name}, ${p.county} County` : "")}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="Type your town or village"
          autoComplete="off"
          spellCheck={false}
        />
        {typed && (
          <ComboboxOptions
            anchor="bottom start"
            className="z-50 w-(--input-width) rounded-board border border-rule bg-card py-1 text-copy text-body [--anchor-gap:6px] [--anchor-max-height:20rem] empty:invisible"
          >
            {places.map((p) => (
              <ComboboxOption
                key={p.id}
                value={p}
                className="flex min-h-11 cursor-pointer items-baseline justify-between gap-3 px-3 py-2 data-focus:bg-paper"
              >
                <span className="truncate">{p.name}</span>
                <span className="shrink-0 text-small text-subtle">{p.county}</span>
              </ComboboxOption>
            ))}
            {!places.length && (
              <div className="px-3 py-2 text-small text-pretty text-subtle" role="status">
                {searching ? "Looking…" : `No town or village called "${query.trim()}". Try the nearest bigger town.`}
              </div>
            )}
          </ComboboxOptions>
        )}
      </Combobox>
    </Field>
  );
}

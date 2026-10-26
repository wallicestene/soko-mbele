"use client";

import Link from "next/link";
import { useState } from "react";

export function Channels({ sms, ussd, web }: { sms: string; ussd: string[]; web: { headline: string; figure: string; caption: string } }) {
  const tabs = ["SMS", "USSD", "Web"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("SMS");
  return (
    <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
      <div className="flex w-full items-center justify-center rounded-board bg-ink px-6 py-10 text-chalk sm:px-10 lg:py-14" role="tabpanel" aria-label={`${tab} preview`}>
        {tab === "SMS" && (
          <div className="w-full max-w-[480px]">
            <p className="text-small text-muted">From SOKO MBELE</p>
            <p className="mt-3 rounded-board bg-paper px-6 py-5 font-display text-[24px] leading-snug text-pretty text-body">{sms}</p>
            <p className="num mt-3 text-small text-muted">{sms.length} of 160 characters</p>
          </div>
        )}
        {tab === "USSD" && (
          <div className="flex w-full max-w-[400px] flex-col gap-4">
            {ussd.map((screen, i) => (
              <pre key={i} className="whitespace-pre-wrap rounded-board bg-paper px-5 py-4 font-sans text-[16px] leading-relaxed text-body">
                {screen}
              </pre>
            ))}
          </div>
        )}
        {tab === "Web" && (
          <div className="w-full max-w-[400px] rounded-board bg-slate p-6">
            <p className="font-display text-h2 font-semibold">{web.headline}</p>
            <p className="expanded num mt-4 text-[48px] font-bold leading-none text-grain">{web.figure}</p>
            <p className="mt-2 text-small text-muted">{web.caption}</p>
          </div>
        )}
      </div>

      <div className="flex flex-col justify-center gap-10">
        <div role="tablist" aria-label="Channel" className="flex gap-6 text-[18px]">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`min-h-11 border-b-2 pb-1 font-medium transition-colors ${tab === t ? "border-brand text-body" : "border-transparent text-subtle hover:text-body"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <p className="max-w-[40ch] text-[18px] leading-relaxed text-pretty">
          Made for any phone: the same answer fits one SMS and a menu you dial, with no internet or data bundle needed. Or use this
          website.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link href="/sell#ussd" className="flex h-[72px] items-center justify-center rounded-control bg-brand px-4 text-[18px] font-medium text-card transition-colors hover:bg-brand-hover">
            Try the phone menu (USSD)
          </Link>
          <Link href="/sell" className="flex h-[72px] items-center justify-center rounded-control bg-mint px-4 text-[18px] font-medium text-body transition-colors hover:bg-rule">
            Open the web app
          </Link>
        </div>
      </div>
    </div>
  );
}

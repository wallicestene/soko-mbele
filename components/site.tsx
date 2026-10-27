import Link from "next/link";
import credits from "@/public/photos/credits.json";
import { prices } from "@/lib/data";
import { longDate } from "@/lib/format";
import { Wordmark } from "./wordmark";


const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/insights", label: "Results" },
];

export function SiteNav({ tone = "paper", current }: { tone?: "paper" | "ink"; current?: string }) {
  const ink = tone === "ink";
  return (
    <header className={`relative z-10 ${ink ? "text-chalk" : "text-body"}`}>
      <nav aria-label="Site" className="mx-auto flex max-w-340 items-center justify-between gap-3 px-4 py-6 sm:gap-6 sm:px-8 lg:px-10">
        <Link href="/" className="shrink-0 py-1">
          <Wordmark className="h-[13px] sm:h-4" />
        </Link>
        <div className="flex items-center gap-2 text-small min-[400px]:gap-2.5 sm:gap-8">
          {/* Under 400px Results moves to the footer so the bar fits. */}
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              aria-current={current === l.href ? "page" : undefined}
              className={`whitespace-nowrap underline-offset-4 hover:underline aria-[current=page]:underline ${ink ? "text-chalk" : "text-body"} ${l.href === "/insights" ? "hidden min-[400px]:inline" : ""}`}
            >
              {l.label}
            </Link>
          ))}
          <Link
            href="/sell"
            className={`whitespace-nowrap rounded-control px-2.5 py-2.5 font-medium transition-colors sm:px-4 ${
              ink ? "bg-chalk text-ink hover:bg-paper" : "bg-brand text-card hover:bg-brand-hover"
            }`}
          >
            <span className="sm:hidden">Open app</span>
            <span className="hidden sm:inline">Use the app</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}

type Credit = { file?: string; path?: string; title: string; creator?: string; author?: string; license?: string; licence?: string; licenseUrl?: string; page?: string; credit?: string };

export function SiteFooter() {
  const list = (Array.isArray(credits) ? credits : Object.values(credits)) as Credit[];
  const columns: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
    {
      title: "Product",
      links: [
        { href: "/sell", label: "The app" },
        { href: "/sell#ussd", label: "Phone menu" },
        { href: "/how-it-works", label: "How it works" },
        { href: "/insights", label: "Results" },
      ],
    },
    {
      title: "Data",
      links: [
        { href: "https://kamis.kilimo.go.ke/site/market", label: "KAMIS market prices", external: true },
        { href: "https://microdata.worldbank.org/index.php/catalog/6167", label: "World Bank food prices", external: true },
        { href: "https://power.larc.nasa.gov/", label: "NASA POWER rainfall", external: true },
        { href: "https://www.epra.go.ke/pump-prices", label: "EPRA fuel prices", external: true },
        { href: "https://www.openstreetmap.org/copyright", label: "OpenStreetMap", external: true },
      ],
    },
    {
      title: "Developers",
      links: [
        { href: "/api/recommend?crop=maize&town=meru-meru&quantity=10&storage=1", label: "Recommendation API" },
        { href: "/api/places?q=chuka", label: "Places API" },
        { href: "/api/markets", label: "Markets API" },
      ],
    },
  ];
  return (
    <footer className="bg-ink text-chalk">
      <div className="mx-auto max-w-340 px-4 pb-10 pt-16 sm:px-8 lg:px-10 lg:pt-20">
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <p>
              <Wordmark className="h-[22px]" />
            </p>
            <p className="mt-4 max-w-[30em] text-copy text-pretty text-muted">
              Where to sell your harvest, whether waiting pays, and what you take home after transport. On the web, by SMS and on any phone.
            </p>
            <Link href="/sell" className="mt-6 inline-flex h-11 items-center rounded-control bg-chalk px-4 text-small font-medium text-ink transition-colors hover:bg-paper">
              Use the app
            </Link>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 text-small sm:grid-cols-3 lg:col-span-7">
            {columns.map((c) => (
              <div key={c.title}>
                <h2 className="font-medium text-muted">{c.title}</h2>
                <ul className="mt-4 flex flex-col gap-3">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      {l.external || l.href.startsWith("/api/") ? (
                        <a href={l.href} className="underline-offset-4 hover:underline" rel="noopener">
                          {l.label}
                        </a>
                      ) : (
                        <Link href={l.href} className="underline-offset-4 hover:underline">
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-4 text-small text-muted lg:flex-row lg:items-start lg:justify-between lg:gap-10">
          <p className="max-w-[46em] text-pretty">
            Prices updated {longDate(prices.as_of)}. Advice is worked out from public market data and is an estimate: check the price with
            the market before you travel.
          </p>
          <details className="shrink-0 lg:text-right">
            <summary className="cursor-pointer underline-offset-4 hover:underline">Photo credits</summary>
            <ul className="mt-3 flex max-w-[34em] flex-col gap-1 text-left text-pretty">
              {list.map((c, i) => (
                <li key={c.page ?? i}>
                  <a href={c.page} className="underline underline-offset-2 hover:text-chalk">
                    {c.title}
                  </a>
                  {c.creator || c.author ? `, ${c.creator ?? c.author}` : ""}
                  {c.license || c.licence ? `, ${c.license ?? c.licence}` : ""}
                </li>
              ))}
              <li>Photographs show Kenyan markets, not Soko Mbele users.</li>
            </ul>
          </details>
        </div>
      </div>
    </footer>
  );
}

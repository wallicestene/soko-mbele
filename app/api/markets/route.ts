// ?town=<id> returns the markets within reach of that place.
import { cropChoices, mainTowns, markets, prices, roads, towns } from "@/lib/data";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("town");
  if (id) {
    const town = towns.find((t) => t.id === id);
    if (!town) return Response.json({ error: `Unknown town: ${id}. GET /api/markets lists them.` }, { status: 404 });
    const reporting = new Set(markets.filter((m) => m.reporting).map((m) => m.name));
    return Response.json({ town, roads: (roads.from[id] ?? []).map((r) => ({ ...r, reporting: reporting.has(r.market) })) });
  }
  return Response.json({
    as_of: prices.as_of,
    crops: cropChoices,
    towns: mainTowns,
    places: towns.length,
    markets: markets.map((m) => ({ ...m, prices: prices.current.filter((p) => p.market === m.name) })),
    distances_source: roads.source,
  });
}

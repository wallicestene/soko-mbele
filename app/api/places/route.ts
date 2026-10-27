import { towns } from "@/lib/data";

// "Murang'a", "Lunga-Lunga" and "lunga lunga" all match the same typing.
const fold = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const index = towns.map((t) => ({ t, name: fold(t.name), county: fold(t.county) }));

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const q = fold(params.get("q") ?? "");
  const county = params.get("county");
  if (q.length < 2) return Response.json({ error: "Type at least two letters in ?q=." }, { status: 400 });
  // Prefix, then word start, then anywhere; towns before villages, shorter names first.
  const rank = (name: string) => (name.startsWith(q) ? 0 : name.includes(` ${q}`) ? 1 : name.includes(q) ? 2 : -1);
  const hits = index
    .filter((x) => (!county || x.t.county === county) && rank(x.name) >= 0)
    .sort((a, b) => rank(a.name) - rank(b.name) || Number(b.t.main) - Number(a.t.main) || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map(({ t }) => ({ id: t.id, name: t.name, county: t.county, main: t.main }));
  // private: a shared CDN cache (Netlify's) keys on the path alone and would serve one search to everyone.
  return Response.json({ places: hits }, { headers: { "Cache-Control": "private, max-age=3600" } });
}

// Fetched on demand so /insights doesn't ship every series up front.
import { backtest } from "@/lib/data";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const s = backtest.series.find((x) => x.crop === q.get("crop") && x.market === q.get("market"));
  if (!s) return Response.json({ error: "No backtest for that crop and market. Pick one listed on /insights." }, { status: 404 });
  return Response.json(s);
}

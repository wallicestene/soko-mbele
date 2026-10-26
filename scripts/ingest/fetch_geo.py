"""Locates KAMIS markets (Nominatim) and fetches road distances from every place (OSRM) -> data/raw/geo.json.

    python3 scripts/ingest/fetch_geo.py [--add-new | --relocate | --refresh-approximate]
"""
import csv
import datetime as dt
import glob
import json
import re
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "soko-mbele-hackathon-prototype/0.1"}
RECENT_DAYS = 730

# KAMIS names that differ from OpenStreetMap's.
ALIASES = {
    "Gakoromone": "Meru, Meru County, Kenya",  # Meru town's main market
    "Ngurubani Market": "Wanguru, Kirinyaga, Kenya",  # Mwea
    "Makutano Kirinyaga": "Makutano, Mwea East, Kirinyaga, Kenya",
    "Mois Bridge": "Moi's Bridge, Uasin Gishu, Kenya",
    "Butere Livestock Market": "Butere, Kakamega, Kenya",
    "Lubao Livestock Market": "Lubao, Kakamega, Kenya",
    "Nairobi Wakulima": "Marikiti, Nairobi, Kenya",  # Wakulima market, central Nairobi
    "Nyamakima": "Nyamakima, Nairobi, Kenya",
    "Muthurwa": "Muthurwa Market, Nairobi, Kenya",
    "Bondeni": "Bondeni, Kitale, Kenya",
    "Bura market": "Bura, Tana River, Kenya",
    "Holo": "Holo, West Kisumu Ward, Kisumu, Kenya",  # two places called Holo in Kisumu County
}
# Markets KAMIS files under the wrong county.
COUNTY_FIX = {"Muthurwa": "Nairobi"}
# A KAMIS test entry and supermarket shelf prices.
EXCLUDE = {"test market", "Nairobi Supermarkets"}


def get(url: str):
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return json.load(r)
        except Exception as e:  # rate limit or busy server
            print(f"  retry {attempt + 1}: {e}", flush=True)
            time.sleep(2 ** attempt * 2)
    raise SystemExit(f"giving up on {url}")


def norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower().replace("county", ""))


def recent_markets() -> dict[str, str]:
    """Market -> county, for markets with a wholesale price in the last RECENT_DAYS."""
    latest = max(r["Date"] for f in glob.glob("data/raw/kamis_*.csv") for r in csv.DictReader(open(f)))
    cutoff = (dt.date.fromisoformat(latest) - dt.timedelta(days=RECENT_DAYS)).isoformat()
    out = {}
    for f in glob.glob("data/raw/kamis_*.csv"):
        for r in csv.DictReader(open(f)):
            if r["Date"] >= cutoff and r["Wholesale"].strip() not in ("", "-") and r["Market"].strip() not in EXCLUDE:
                name = r["Market"].strip()
                out[name] = COUNTY_FIX.get(name, r["County"].replace("-", " ").strip())
    return out


def county_centre(county: str):
    """The centre of the county's largest area, from the official boundaries."""
    for f in json.load(open("data/raw/counties.geojson"))["features"]:
        if norm(f["properties"]["shapeName"]).replace("nithi", "") != norm(county).replace("nithi", ""):
            continue
        polys = f["geometry"]["coordinates"] if f["geometry"]["type"] == "MultiPolygon" else [f["geometry"]["coordinates"]]
        best, area = None, 0.0
        for poly in polys:
            ring = poly[0]
            a = cx = cy = 0.0
            for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
                c = x0 * y1 - x1 * y0
                a, cx, cy = a + c, cx + (x0 + x1) * c, cy + (y0 + y1) * c
            if abs(a) > area:
                area, best = abs(a), (cy / (3 * a), cx / (3 * a))
        return best
    return None


def from_places(market: str, county: str):
    """A market named after its town ("Chuka", "Voi Wholesale") sits in that town:
    take the town's own OpenStreetMap point in the same county. Nominatim tends to
    return the surrounding sub-county's centre for these, up to 40 km off."""
    base = re.sub(r"\s+-\s+.*$", "", market)
    key = norm(re.sub(r"\b(Market|Municipality|Municipal|Retail|Wholesale|Town|Livestock|Mkt)\b", "", base))
    if not key:
        return None
    same = [p for p in all_places() if norm(p["name"]) == key and p.get("county") and norm(p["county"]) == norm(county)]
    if not same:
        return None
    # Prefer a city or town over a village of the same name.
    p = sorted(same, key=lambda p: p.get("place", "town") not in ("city", "town"))[0]
    return {"lat": p["lat"], "lon": p["lon"], "county": county, "approximate": False, "osm": f"place: {p['name']} (OpenStreetMap node {p['osm_id']})"}


def geocode(market: str, county: str):
    if market not in ALIASES:
        hit = from_places(market, county)
        if hit:
            return hit
    base = re.sub(r"\s+-\s+.*$", "", market)  # "Cheptiret - Uasin Gishu" -> "Cheptiret"
    bare = re.sub(r"\b(Market|Municipality|Municipal|Retail|Wholesale|Town|Mkt)\b", "", base).strip()
    queries = [ALIASES[market]] if market in ALIASES else []
    for q in dict.fromkeys(queries + [f"{market}, {county}, Kenya", f"{base}, {county}, Kenya", f"{bare}, {county}, Kenya"]):
        hits = get("https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 5, "countrycodes": "ke", "addressdetails": 1, "accept-language": "en"}))
        time.sleep(1.1)
        for h in hits:
            a = h.get("address", {})
            # Kenya's counties are OSM admin level 4, which Nominatim reports as "state".
            if norm(county) in (norm(a.get("state", "")), norm(a.get("county", ""))):
                return {"lat": float(h["lat"]), "lon": float(h["lon"]), "county": county, "approximate": False, "osm": h["display_name"]}
    centre = county_centre(county)
    if not centre:
        return None
    return {"lat": centre[0], "lon": centre[1], "county": county, "approximate": True, "osm": f"centre of {county} County (geoBoundaries)"}


def locate(name: str, county: str, markets: dict) -> None:
    g = geocode(name, county)
    if g:
        markets[name] = g
        print(f"{name:34s} {county:16s} {'APPROX ' if g['approximate'] else ''}{g['lat']:.4f},{g['lon']:.4f}", flush=True)
    else:
        print(f"{name:34s} {county:16s} NOT FOUND", flush=True)


def all_places() -> list:
    """The main towns and, once fetch_places.py has run, every village and suburb."""
    try:
        return json.load(open("data/raw/towns.json")) + json.load(open("data/raw/places.json"))
    except FileNotFoundError:
        return json.load(open("data/raw/towns.json"))


def fetch_roads(towns: list, markets: dict, mnames: list, roads: dict) -> None:
    # The router takes about 100 points a request.
    step = max(10, 95 - min(len(mnames), 80))
    for i in range(0, len(towns), step):
        src = towns[i:i + step]
        for j in range(0, len(mnames), 80):
            dst = mnames[j:j + 80]
            pts = [f"{t['lon']},{t['lat']}" for t in src] + [f"{markets[m]['lon']},{markets[m]['lat']}" for m in dst]
            q = urllib.parse.urlencode({
                "sources": ";".join(map(str, range(len(src)))),
                "destinations": ";".join(map(str, range(len(src), len(pts)))),
                "annotations": "distance,duration",
            })
            table = get(f"https://routing.openstreetmap.de/routed-car/table/v1/driving/{';'.join(pts)}?{q}")
            for a, t in enumerate(src):
                row = roads.setdefault(str(t["osm_id"]), {})
                for b, m in enumerate(dst):
                    d, s = table["distances"][a][b], table["durations"][a][b]
                    if d is not None:
                        row[m] = [round(d / 1000, 1), round(s / 3600, 2)]
            time.sleep(3)  # community server: 429 when asked faster
        print(f"roads: {min(i + step, len(towns))}/{len(towns)} places", flush=True)


def save(markets: dict, roads: dict) -> None:
    json.dump({"source": "OpenStreetMap Nominatim + OSRM", "markets": markets, "roads": roads},
              open("data/raw/geo.json", "w"), separators=(",", ":"))
    print(f"wrote {len(markets)} markets, roads for {len(roads)} towns")


def main() -> None:
    markets: dict = {}
    for name, county in sorted(recent_markets().items()):
        locate(name, county, markets)
    roads: dict[str, dict[str, list[float]]] = {}
    fetch_roads(json.load(open("data/raw/towns.json")), markets, list(markets), roads)
    save(markets, roads)


def refresh_approximate() -> None:
    """Re-locate only the markets placed at their county (after adding ALIASES),
    drop excluded ones, and refetch road distances for just those markets."""
    geo = json.load(open("data/raw/geo.json"))
    markets, roads = geo["markets"], geo["roads"]
    for name in EXCLUDE & set(markets):
        del markets[name]
        for row in roads.values():
            row.pop(name, None)
    redo = [m for m, g in markets.items() if g["approximate"]]
    for name in redo:
        locate(name, markets[name]["county"], markets)
    moved = [m for m in redo if m in markets]
    if moved:
        fetch_roads(all_places(), markets, moved, roads)
    save(markets, roads)


def relocate() -> None:
    """Locate every market again (town points first), and re-measure the roads to
    any market that moved more than 2 km."""
    import math
    geo = json.load(open("data/raw/geo.json"))
    markets, roads = geo["markets"], geo["roads"]
    moved = []
    for name, old in list(markets.items()):
        new = geocode(name, old["county"])
        if not new:
            continue
        dlat, dlon = math.radians(new["lat"] - old["lat"]), math.radians(new["lon"] - old["lon"])
        km = 6371 * 2 * math.asin(math.sqrt(math.sin(dlat / 2) ** 2 + math.cos(math.radians(old["lat"])) * math.cos(math.radians(new["lat"])) * math.sin(dlon / 2) ** 2))
        if km > 2:
            markets[name] = new
            moved.append(name)
            print(f"{name:34s} moved {km:5.1f} km -> {new['osm'][:60]}", flush=True)
    if moved:
        fetch_roads(all_places(), markets, moved, roads)
    save(markets, roads)


def add_new() -> None:
    """Locate only markets that started reporting since geo.json was written, and
    fetch road distances to just those. The weekly refresh runs this."""
    geo = json.load(open("data/raw/geo.json"))
    markets, roads = geo["markets"], geo["roads"]
    new = [(n, c) for n, c in sorted(recent_markets().items()) if n not in markets and n not in EXCLUDE]
    if not new:
        print("no new markets")
        return
    for name, county in new:
        locate(name, county, markets)
    found = [n for n, _ in new if n in markets]
    if found:
        fetch_roads(all_places(), markets, found, roads)
    save(markets, roads)


if __name__ == "__main__":
    import sys

    if "--refresh-approximate" in sys.argv:
        refresh_approximate()
    elif "--add-new" in sys.argv:
        add_new()
    elif "--relocate" in sys.argv:
        relocate()
    else:
        main()

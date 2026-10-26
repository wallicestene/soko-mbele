"""Every named place in Kenya with its county -> data/raw/places.json, plus road distances in data/raw/geo.json.

Input is the Overpass result of:
  [out:json][timeout:500];
  area["ISO3166-1"="KE"][admin_level=2]->.ke;
  rel(area.ke)["admin_level"="4"]["boundary"="administrative"];
  map_to_area->.counties;
  foreach.counties->.c(.c out tags; node(area.c)["place"~"^(city|town|suburb|village)$"]["name"]; out;);

    python3 scripts/ingest/fetch_places.py   # resumable
"""
import json
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "soko-mbele-hackathon-prototype/0.1"}
SOURCES_PER_REQUEST = 20  # with 75 markets, under the router's 100 points per request
NOT_KENYA = {"Eastern Equatoria"}  # South Sudan's area overlaps the Ilemi triangle


def county_name(osm: str) -> str:
    # "Murang`a" -> "Murang'a", "Tharaka-Nithi" -> "Tharaka Nithi"
    return osm.replace("`", "'").replace("-", " ").replace(" County", "").strip()


def get(url: str):
    for attempt in range(8):  # waits up to ~10 minutes in all
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if attempt == 7:
                raise
            print(f"  retry after {e}", flush=True)
            time.sleep(10 * 2 ** min(attempt, 5))


def places() -> list[dict]:
    out, seen, county = [], set(), None
    for e in json.load(open("data/raw/osm_places_by_county.json"))["elements"]:
        if e["type"] == "area":
            county = e["tags"].get("name")
            continue
        if county in NOT_KENYA or e["id"] in seen:
            continue  # border places are listed twice
        seen.add(e["id"])
        out.append({"name": e["tags"]["name"].strip(), "county": county_name(county), "lat": e["lat"], "lon": e["lon"],
                    "osm_id": e["id"], "place": e["tags"]["place"]})
    return out


def save(geo: dict) -> None:
    with open("data/raw/geo.json", "w") as f:
        json.dump(geo, f, separators=(",", ":"))


def main() -> None:
    ps = places()
    with open("data/raw/places.json", "w") as f:
        json.dump(ps, f, separators=(",", ":"))
    print(f"wrote {len(ps)} places in {len({p['county'] for p in ps})} counties")

    geo = json.load(open("data/raw/geo.json"))
    markets, roads = geo["markets"], geo["roads"]
    mnames = list(markets)
    todo = [p for p in ps if str(p["osm_id"]) not in roads]
    print(f"{len(todo)} places need road distances to {len(mnames)} markets")
    for n, i in enumerate(range(0, len(todo), SOURCES_PER_REQUEST)):
        src = todo[i:i + SOURCES_PER_REQUEST]
        pts = [f"{p['lon']},{p['lat']}" for p in src] + [f"{markets[m]['lon']},{markets[m]['lat']}" for m in mnames]
        q = urllib.parse.urlencode({
            "sources": ";".join(map(str, range(len(src)))),
            "destinations": ";".join(map(str, range(len(src), len(pts)))),
            "annotations": "distance,duration",
        })
        table = get(f"https://routing.openstreetmap.de/routed-car/table/v1/driving/{';'.join(pts)}?{q}")
        for a, p in enumerate(src):
            row = roads.setdefault(str(p["osm_id"]), {})
            for b, m in enumerate(mnames):
                d, s = table["distances"][a][b], table["durations"][a][b]
                if d is not None:
                    row[m] = [round(d / 1000, 1), round(s / 3600, 2)]
        if n % 25 == 24:
            save(geo)
            print(f"roads: {min(i + SOURCES_PER_REQUEST, len(todo))}/{len(todo)}", flush=True)
        time.sleep(3)  # community server: 429 when asked faster
    save(geo)
    print(f"done: roads for {len(roads)} places")


if __name__ == "__main__":
    main()

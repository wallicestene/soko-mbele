"""Daily rainfall since 2005 at each county's centre, from NASA POWER -> data/raw/rain.json.

    python3 scripts/ingest/fetch_rain.py
"""
import datetime
import json
import time
import urllib.request

START = "20050101"
URL = "https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG&longitude={lon}&latitude={lat}&start={start}&end={end}&format=JSON"


def centre(geometry: dict) -> tuple[float, float]:
    """Area-weighted centre of the county's largest ring."""
    polys = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    best, best_area = None, 0.0
    for poly in polys:
        ring = poly[0]
        a = cx = cy = 0.0
        for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
            cross = x0 * y1 - x1 * y0
            a += cross
            cx += (x0 + x1) * cross
            cy += (y0 + y1) * cross
        if abs(a) > best_area:
            best_area, best = abs(a), (cx / (3 * a), cy / (3 * a))
    return best


def fetch(lat: float, lon: float, end: str) -> dict:
    for attempt in range(4):
        try:
            with urllib.request.urlopen(URL.format(lat=round(lat, 3), lon=round(lon, 3), start=START, end=end), timeout=120) as r:
                return json.load(r)["properties"]["parameter"]["PRECTOTCORR"]
        except Exception as e:  # noqa: BLE001
            if attempt == 3:
                raise
            print(f"  retry after {e}")
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("unreachable")


def main() -> None:
    with open("data/raw/counties.geojson") as f:
        features = json.load(f)["features"]
    end = (datetime.date.today() - datetime.timedelta(days=1)).strftime("%Y%m%d")
    out = {}
    for i, feat in enumerate(sorted(features, key=lambda f: f["properties"]["shapeName"])):
        name = feat["properties"]["shapeName"]
        lon, lat = centre(feat["geometry"])
        daily = fetch(lat, lon, end)
        days = sorted(daily)
        out[name] = {"lat": round(lat, 4), "lon": round(lon, 4), "mm": [None if daily[d] < 0 else daily[d] for d in days]}
        print(f"{i + 1}/{len(features)} {name}: {len(days)} days")
        time.sleep(1)
    with open("data/raw/rain.json", "w") as f:
        json.dump({"source": "NASA POWER daily PRECTOTCORR (mm/day) at each county's centre", "start": "2005-01-01", "counties": out}, f)
    print("wrote data/raw/rain.json")


if __name__ == "__main__":
    main()

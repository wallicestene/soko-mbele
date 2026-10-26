"""Kenya's cities and towns with their county (Nominatim) -> data/raw/towns.json.

Input is the Overpass result of:
  [out:json];area["ISO3166-1"="KE"][admin_level=2]->.ke;(node["place"~"^(city|town)$"](area.ke););out body;
"""
import json
import time
import urllib.parse
import urllib.request

UA = {"User-Agent": "soko-mbele-hackathon-prototype/0.1"}


# Nominatim reports Kenya's counties as "state"; its "county" is the sub-county.
def county_of(lat: float, lon: float) -> tuple[str | None, str | None]:
    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(
        {"lat": lat, "lon": lon, "format": "json", "zoom": 8, "accept-language": "en"})
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        addr = json.load(r).get("address", {})
    clean = lambda v: v.replace(" County", "").strip() if v else None
    return clean(addr.get("state")), clean(addr.get("county"))


def main() -> None:
    nodes = json.load(open("data/raw/osm_towns_overpass.json"))["elements"]
    towns = []
    for n in nodes:
        name = n["tags"].get("name:en") or n["tags"].get("name")
        if not name:
            continue
        county, sub_county = county_of(n["lat"], n["lon"])
        towns.append({"name": name, "county": county, "sub_county": sub_county, "lat": n["lat"], "lon": n["lon"], "osm_id": n["id"]})
        print(f"{name:28s} {county} / {sub_county}", flush=True)
        time.sleep(1.1)
    json.dump(sorted(towns, key=lambda t: (t["county"] or "", t["name"])), open("data/raw/towns.json", "w"), indent=1)
    print(f"wrote {len(towns)} towns")


if __name__ == "__main__":
    main()

"""Nairobi diesel pump prices from EPRA -> data/raw/diesel.json.

    python3 scripts/ingest/fetch_diesel.py
"""
import html
import json
import re
import urllib.request

URL = "https://www.epra.go.ke/pump-prices"
PLACE = "Nairobi"


def iso(d: str) -> str:
    day, month, year = d.split("-")  # EPRA writes 15-10-2026
    return f"{year}-{month}-{day}"


def main() -> None:
    req = urllib.request.Request(URL, headers={"User-Agent": "soko-mbele-hackathon/0.1"})
    with urllib.request.urlopen(req, timeout=60) as r:
        page = r.read().decode("utf-8", "replace")
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.S):
        cells = [html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)]
        rows.append(cells)
    header = rows[0]
    col = {name: header.index(name) for name in ["From", "To", "Town", "Diesel (AGO)"]}
    prices = {
        iso(r[col["From"]]): {"from": iso(r[col["From"]]), "to": iso(r[col["To"]]), "ksh_per_litre": float(r[col["Diesel (AGO)"]])}
        for r in rows[1:]
        if len(r) == len(header) and r[col["Town"]] == PLACE
    }
    if not prices:
        raise SystemExit(f"No {PLACE} diesel price on {URL}: the page layout may have changed")
    out = {"source": URL, "place": PLACE, "prices": sorted(prices.values(), key=lambda p: p["from"], reverse=True)}
    with open("data/raw/diesel.json", "w") as f:
        json.dump(out, f, indent=1)
    latest = out["prices"][0]
    print(f"wrote data/raw/diesel.json: {len(prices)} months, latest {latest['from']} KSh {latest['ksh_per_litre']}")


if __name__ == "__main__":
    main()

"""KAMIS price history for one product -> a raw CSV, kept exactly as published.

    python3 scripts/ingest/fetch_kamis.py <product_id> <out.csv> [--update]
"""
import csv
import datetime
import html
import http.client
import re
import sys
import time
import urllib.request

BASE = "https://kamis.kilimo.go.ke/site/market"
PER_PAGE = 3000


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "soko-mbele-hackathon/0.1"})
    for attempt in range(4):  # KAMIS is slow on big pages
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read().decode("utf-8", "replace")
        except (TimeoutError, OSError, http.client.HTTPException) as e:  # incl. a page cut off mid-download
            print(f"  retry {attempt + 1} after {e}", flush=True)
            time.sleep(10 * 2 ** attempt)
    raise SystemExit(f"KAMIS did not answer: {url}")


def parse_rows(page: str) -> list[list[str]]:
    rows = []
    for tr in re.findall(r"<tr>(.*?)</tr>", page, re.S):
        cells = re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, re.S)
        rows.append([html.unescape(re.sub(r"<[^>]+>", "", c)).strip() for c in cells])
    return rows


def main(product: str, out: str, update: bool = False) -> None:
    header, data, offset = None, [], 0
    kept, cutoff = [], None
    if update:
        with open(out, newline="") as f:
            existing = list(csv.reader(f))
        header, old = existing[0], existing[1:]
        last = max(r[-1] for r in old)
        cutoff = (datetime.date.fromisoformat(last) - datetime.timedelta(days=14)).isoformat()
        kept = [r for r in old if r[-1] < cutoff]
    while True:
        path = f"{BASE}/{offset}" if offset else BASE
        rows = parse_rows(fetch(f"{path}?product={product}&per_page={PER_PAGE}"))
        if not rows or len(rows) < 2:
            break
        header = header or rows[0]
        body = [r for r in rows[1:] if len(r) == len(header)]
        data.extend(body)
        print(f"offset {offset}: {len(body)} rows (dates {body[-1][-1]}..{body[0][-1]})", flush=True)
        if len(body) < PER_PAGE or (cutoff and min(r[-1] for r in body) < cutoff):
            break
        offset += PER_PAGE
        time.sleep(1)
    if cutoff:
        fresh = [r for r in data if r[-1] >= cutoff]
        if not fresh:
            raise SystemExit(f"KAMIS returned nothing from {cutoff} on; keeping {out} as it was")
        data = sorted(fresh, key=lambda r: r[-1], reverse=True) + kept
        print(f"{len(fresh)} rows from {cutoff} on, {len(kept)} older rows kept")
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(data)
    print(f"wrote {len(data)} rows to {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], "--update" in sys.argv[3:])

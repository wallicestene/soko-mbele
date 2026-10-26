"""World Bank RTFP Kenya file -> national monthly maize and beans medians (modelled estimates, used for seasonality only).

    python3 scripts/ingest/extract_rtfp.py <KEN_RTFP_mkt_*.csv> data/raw/rtfp_national_monthly.csv
"""
import csv
import statistics
import sys
from collections import defaultdict


def main(src: str, out: str) -> None:
    acc = defaultdict(lambda: {"maize": [], "beans": []})
    for r in csv.DictReader(open(src)):
        for crop, col in (("maize", "c_maize_fao"), ("beans", "c_beans")):
            if r[col]:
                acc[r["price_date"]][crop].append(float(r[col]))
    with open(out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["month", "maize_median", "beans_median", "markets"])
        for month in sorted(acc):
            m, b = acc[month]["maize"], acc[month]["beans"]
            w.writerow([month[:7], round(statistics.median(m), 2) if m else "",
                        round(statistics.median(b), 2) if b else "", max(len(m), len(b))])
    print(f"wrote {len(acc)} months to {out}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])

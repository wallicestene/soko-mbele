"""Trains the LightGBM price model, runs the walk-forward test and writes forecasts, backtest and model.json.

    .venv/bin/python scripts/model/train.py             # backtest, then today's forecasts
    .venv/bin/python scripts/model/train.py --validate  # choose settings: train to 2023, score 2024
"""
import json
import sys
from datetime import date, timedelta

import lightgbm as lgb
import numpy as np
import pandas as pd

VALIDATE = "--validate" in sys.argv
ML = "data/ml/validate" if VALIDATE else "data/ml"

# Chosen on the 2024 validation year, then frozen for the test.
PARAMS = {
    "objective": "l1",
    "learning_rate": 0.03,
    "num_leaves": 15,
    "min_data_in_leaf": 300,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.7,
    "bagging_freq": 1,
    "lambda_l2": 10.0,
    "cat_smooth": 20,
    "verbose": -1,
    "seed": 7,
    "deterministic": True,
    "force_row_wise": True,
}
ROUNDS = 300
# --validate only: DROP=a,b leaves inputs out; LEAVES and ROUNDS change the size.
import os
if VALIDATE:
    ROUNDS = int(os.environ.get("ROUNDS", ROUNDS))
    PARAMS["num_leaves"] = int(os.environ.get("LEAVES", PARAMS["num_leaves"]))
REFIT_EVERY = 4  # weeks
CALIBRATION_WEEKS = 26  # weeks with data: KAMIS went quiet Nov 2024-Apr 2025
MIN_CROP_RESIDUALS = 40  # below this a crop borrows the pooled range
BACKTEST_H = 2  # shown on the Results page
BIG_MOVE = 0.10  # either direction

meta = json.load(open(f"{ML}/meta.json"))
FEATURES = [f for f in meta["features"] if not (VALIDATE and f in os.environ.get("DROP", "").split(","))]
CAT = meta["categorical"]
EPOCH = date.fromisoformat(meta["epoch"])
week_date = lambda w: (EPOCH + timedelta(weeks=int(w))).isoformat()


def load(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, dtype={"market": str, "county": str})
    df["target_week"] = df.origin_week + df.h
    for c in CAT:
        df[c] = df[c].astype(int)
    return df


def fit(rows: pd.DataFrame) -> lgb.Booster:
    data = lgb.Dataset(rows[FEATURES], rows.y, categorical_feature=CAT, free_raw_data=True)
    return lgb.train(PARAMS, data, ROUNDS)


def fit_at(rows: pd.DataFrame, refit: int):
    """A model trained on every target known by week `refit`, plus its 80% range per crop."""
    known = rows[rows.target_week <= refit]
    weeks = np.sort(known.target_week.unique())[::-1]
    cut = weeks[CALIBRATION_WEEKS] if len(weeks) > CALIBRATION_WEEKS else -1
    calib = known[known.target_week > cut]
    resid = calib.y.to_numpy() - fit(known[known.target_week <= cut]).predict(calib[FEATURES])
    pooled = (np.quantile(resid, 0.1), np.quantile(resid, 0.9))
    bands = {
        crop: (np.quantile(r, 0.1), np.quantile(r, 0.9))
        for crop, r in pd.Series(resid, index=calib.index).groupby(calib.crop)
        if len(r) >= MIN_CROP_RESIDUALS
    }
    return fit(known), bands, pooled, len(known)


def scores(s: pd.DataFrame) -> dict:
    err = lambda p: (p - s.actual).abs()
    big = s[(s.actual / s.base - 1).abs() >= BIG_MOVE]
    called = np.sign(big.pred - big.base) == np.sign(big.actual - big.base)
    return {
        "n": int(len(s)),
        "model_mae": round(float(err(s.pred).mean()), 2),
        "model_mape": round(float(100 * (err(s.pred) / s.actual).mean()), 2),
        "naive_mae": round(float(err(s.base).mean()), 2),
        "naive_mape": round(float(100 * (err(s.base) / s.actual).mean()), 2),
        "seasonal_mae": round(float(err(s.seasonal_naive).mean()), 2),
        "seasonal_mape": round(float(100 * (err(s.seasonal_naive) / s.actual).mean()), 2),
        "band_coverage": round(float(((s.actual >= s.lower) & (s.actual <= s.upper)).mean()), 3),
        "big_moves": int(len(big)),
        "direction_hit": round(float(called.mean()), 3) if len(big) else 0.0,
    }


# Is it real?

def gain_interval(s: pd.DataFrame, reps: int = 1000) -> dict:
    """Resample whole weeks (prices
    in one week move together, so rows are not independent) 1,000 times and recompute
    the average gain each time. The 2.5th-97.5th percentiles are a 95% interval."""
    d = (s.base - s.actual).abs() - (s.pred - s.actual).abs()  # > 0 where the model is closer
    g = pd.DataFrame({"d": d.to_numpy(), "w": s.target_week.to_numpy()}).groupby("w").d.agg(["sum", "count"])
    pick = np.random.default_rng(7).integers(0, len(g), size=(reps, len(g)))
    gains = g["sum"].to_numpy()[pick].sum(1) / g["count"].to_numpy()[pick].sum(1)
    return {
        "gain_ksh": round(float(d.mean()), 3),
        "gain_low": round(float(np.quantile(gains, 0.025)), 3),
        "gain_high": round(float(np.quantile(gains, 0.975)), 3),
        "beat_share": round(float((gains > 0).mean()), 3),
    }


def shuffled_check(ex: pd.DataFrame, test_end: int) -> dict:
    """The same model trained once on the same rows, with the prices that followed
    shuffled so there is nothing to learn. If it still beat "no change", the skill
    would be an artefact (a leak, or luck), not learning."""
    rows = ex[ex.h == BACKTEST_H]
    train = rows[rows.target_week <= meta["train_end_week"]].copy()
    test = rows[(rows.origin_week > meta["train_end_week"]) & (rows.target_week <= test_end) & rows.seasonal_naive.notna()]
    mae = lambda model: round(float((test.base * np.exp(model.predict(test[FEATURES])) - test.actual).abs().mean()), 3)
    real = mae(fit(train))
    train["y"] = np.random.default_rng(7).permutation(train.y.to_numpy())
    return {"rows": int(len(test)), "real_mae": real, "shuffled_mae": mae(fit(train)), "naive_mae": round(float((test.base - test.actual).abs().mean()), 3)}


def behaviour_check(s: pd.DataFrame) -> dict:
    """Does it behave like a market? A market priced well above its usual level should
    be expected to come down, and one well below to come up, as it really did."""
    out = {}
    for name, rows, way in [("above_usual", s[s.spread_vs_usual > 0.15], -1), ("below_usual", s[s.spread_vs_usual < -0.15], 1)]:
        change = rows.actual / rows.base - 1
        moved = change[change.abs() >= 0.02]  # many KAMIS prices repeat week to week
        out[name] = {
            "rows": int(len(rows)),
            "predicted_change": round(float((rows.pred / rows.base - 1).mean()), 3),
            "actual_change": round(float(change.mean()), 3),
            "moved_as_expected": round(float((np.sign(moved) == way).mean()), 3),
        }
    return out


def main() -> None:
    ex = load(f"{ML}/examples.csv")
    test_start, test_end = meta["train_end_week"] + 1, meta["test_end_week"]

    # Walk-forward test
    scored = []
    for h in meta["horizons"]:
        rows = ex[ex.h == h]
        for refit in range(test_start, test_end - h + 1, REFIT_EVERY):
            model, bands, pooled, _ = fit_at(rows, refit)
            batch = rows[(rows.origin_week >= refit) & (rows.origin_week < refit + REFIT_EVERY) & (rows.target_week <= test_end)].copy()
            if batch.empty:
                continue
            yhat = model.predict(batch[FEATURES])
            q10 = batch.crop.map(lambda c: bands.get(c, pooled)[0]).to_numpy()
            q90 = batch.crop.map(lambda c: bands.get(c, pooled)[1]).to_numpy()
            batch["pred"] = batch.base * np.exp(yhat)
            batch["lower"] = batch.base * np.exp(yhat + q10)
            batch["upper"] = batch.base * np.exp(yhat + q90)
            scored.append(batch)
        print(f"backtest h={h} done", flush=True)
    scored = pd.concat(scored)

    # All three methods on the same rows: those with a same-week-last-year price.
    comparable = scored[scored.seasonal_naive.notna()]
    metrics = [{"horizon_weeks": h, **scores(comparable[comparable.h == h]), **gain_interval(comparable[comparable.h == h])} for h in meta["horizons"]]
    two = comparable[comparable.h == BACKTEST_H]
    by_crop = []
    for crop in meta["crops"]:
        s = two[two.crop == crop]
        if len(s) < 20:
            continue
        m = scores(s)
        by_crop.append({"crop": crop, **{k: m[k] for k in ["n", "model_mae", "naive_mae", "seasonal_mae", "model_mape", "band_coverage"]}})
    print(pd.DataFrame(metrics).to_string(index=False))
    print(pd.DataFrame(by_crop).to_string(index=False))
    if VALIDATE:
        return

    checks = {
        "shuffled": shuffled_check(ex, test_end),
        "behaviour": behaviour_check(comparable[comparable.h == BACKTEST_H]),
    }
    print("checks:", json.dumps(checks))

    series = []
    for crop in meta["crops"]:
        s = scored[(scored.crop == crop) & (scored.h == BACKTEST_H)]
        groups = sorted(((m, g) for m, g in s.groupby("market") if len(g) >= 20), key=lambda x: -len(x[1]))[:8]
        for market, g in groups:
            g = g.sort_values("origin_week")
            series.append({
                "market": market, "crop": crop, "horizon_weeks": BACKTEST_H,
                "points": [
                    {"date": r.target_date, "actual": round(r.actual, 2), "predicted": round(r.pred, 2),
                     "lower": round(r.lower, 2), "upper": round(r.upper, 2), "naive": round(r.base, 2)}
                    for r in g.itertuples()
                ],
            })

    # Today's forecasts
    live = load(f"{ML}/live.csv")
    as_of = date.fromisoformat(meta["as_of"])
    forecasts, trained = [], {}
    for h in meta["horizons"]:
        model, bands, pooled, n_rows = fit_at(ex[ex.h == h], meta["origin_week"])
        trained[h] = (model, n_rows)
        rows = live[live.h == h]
        if rows.empty:
            continue
        yhat = model.predict(rows[FEATURES])
        for r, y in zip(rows.itertuples(), yhat):
            q10, q90 = bands.get(r.crop, pooled)
            pred, lower, upper = r.base * np.exp(y), r.base * np.exp(y + q10), r.base * np.exp(y + q90)
            half = (upper - lower) / 2 / pred
            level = 2 if half <= 0.05 else 1 if half <= 0.10 else 0
            if r.staleness_weeks >= 2:
                level = max(0, level - 1)
            forecasts.append({
                "market": r.market, "county": r.county, "crop": r.crop,
                "date": (as_of + timedelta(days=7 * h)).isoformat(), "horizon_days": 7 * h,
                "predicted_price": round(float(pred), 2), "confidence": ["low", "medium", "high"][level],
                "lower": round(float(min(lower, pred)), 2), "upper": round(float(max(upper, pred)), 2),
            })

    # Write
    model_text = f"LightGBM gradient-boosted trees on log price change ({len(FEATURES)} inputs), one model per horizon, retrained every {REFIT_EVERY} weeks"
    backtest = {
        "model": model_text,
        "train_end": week_date(meta["train_end_week"]),
        "test_start": week_date(test_start),
        "test_end": week_date(test_end),
        "band": f"80% split-conformal range per crop from the previous {CALIBRATION_WEEKS} weeks of out-of-sample errors",
        "metrics": metrics,
        "by_crop": by_crop,
        "series": series,
    }
    model2, n2 = trained[BACKTEST_H]
    gain = model2.feature_importance(importance_type="gain")
    info = {
        "algorithm": "LightGBM (gradient-boosted decision trees)",
        "library": f"lightgbm {lgb.__version__}",
        "objective": "absolute error on the change in log price (a median forecast)",
        "trees": ROUNDS,
        "params": {k: v for k, v in PARAMS.items() if k not in ("verbose", "deterministic", "force_row_wise")},
        "horizons_weeks": meta["horizons"],
        "training_rows": {str(h): int(n) for h, (_, n) in trained.items()},
        "examples": int(len(ex)),
        "trained_on": meta["as_of"],
        "importance": sorted(
            ({"feature": f, "share": round(float(g / gain.sum()), 4)} for f, g in zip(FEATURES, gain)),
            key=lambda x: -x["share"],
        ),
    }
    info["checks"] = checks

    # A model that fails any gate is not published; the last good files stay.
    two_m = next(m for m in metrics if m["horizon_weeks"] == BACKTEST_H)
    failures = [f"{m['horizon_weeks']}-week model ({m['model_mae']}) is worse than 'no change' ({m['naive_mae']})" for m in metrics if m["model_mae"] > m["naive_mae"]]
    if not 0.72 <= two_m["band_coverage"] <= 0.88:
        failures.append(f"the 80% range held {two_m['band_coverage']:.0%} of the time")
    if checks["shuffled"]["shuffled_mae"] <= checks["shuffled"]["real_mae"]:
        failures.append("a model trained on shuffled prices did as well as the real one: look for a leak")
    if checks["behaviour"]["above_usual"]["predicted_change"] >= 0 or checks["behaviour"]["below_usual"]["predicted_change"] <= 0:
        failures.append("the model no longer expects out-of-line prices to come back")
    bad = [f for f in forecasts if not (f["lower"] <= f["predicted_price"] <= f["upper"])]
    base_of = {(r.market, r.crop, r.h): r.base for r in live.itertuples()}
    wild = [f for f in forecasts if not 0.5 <= f["predicted_price"] / base_of[(f["market"], f["crop"], f["horizon_days"] // 7)] <= 2]
    if bad or wild:
        failures.append(f"{len(bad)} forecasts outside their own range, {len(wild)} more than doubling or halving the last price")
    if failures:
        print("NOT PUBLISHED:\n  " + "\n  ".join(failures))
        sys.exit(1)
    print("all safety gates passed")

    for path, value in [("data/forecasts.json", forecasts), ("data/backtest.json", backtest), ("data/model.json", info)]:
        with open(path, "w") as f:
            json.dump(value, f)
            f.write("\n")
        print(f"wrote {path}")
    print({"forecasts": len(forecasts), "series": len(series), "training_rows": info["training_rows"]})


if __name__ == "__main__":
    main()

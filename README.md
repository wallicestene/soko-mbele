# Soko Mbele

Soko Mbele helps a Kenyan farmer decide where to sell a harvest, whether waiting will pay, and how much they take home after transport. It compares every market within a day's trip of the farm, using the Ministry of Agriculture's market prices and a price forecast trained on them.

Built for the Safaricom Interns Hackathon 2026.

## What's in this repo

One Next.js app holds both the website and the backend. There is no database.

- **Website:** the homepage, the farmer app (`/sell`), How it works, and Results (`/insights`).
- **Backend:** API routes under `app/api/`, and the decision engine in `lib/engine.ts`.
- **Data:** the price, place and road data the app reads, in `data/`.
- **Pipeline:** the TypeScript and Python scripts that fetch the data and train the forecast, in `scripts/`. These run once a week, not when someone uses the app.

## Run it

You need Node 24 and pnpm.

```bash
pnpm install
pnpm dev     # http://localhost:3000
pnpm test    # engine and cost tests
```

To try it on a phone, open the Network address that `pnpm dev` prints, with the phone on the same Wi-Fi.

## API

```bash
curl "localhost:3000/api/recommend?crop=maize&town=meru-meru&quantity=10&storage=1"
curl "localhost:3000/api/recommend?crop=maize&town=meru-meru&quantity=10&offer=3800"   # weigh a broker's offer, KSh a bag
curl "localhost:3000/api/places?q=chuka"           # find a town or village id
curl "localhost:3000/api/markets?town=meru-meru"   # markets within reach of a place
curl "localhost:3000/api/backtest?crop=maize&market=Nkubu"
```

## Updating the data and the model

The forecast is a LightGBM model trained in Python. Set up the Python environment once (it needs Python 3.13; on a Mac, also run `brew install libomp`):

```bash
pnpm model:setup
```

Then:

```bash
pnpm weekly   # fetch new prices, rain and diesel, rebuild, retrain and check
pnpm data     # rebuild and retrain from the files already in data/raw/
```

A model that fails any of its checks is not published, and the previous files stay. `docs/model-card.md` explains the model and its results.

### Every Monday on GitLab

`.gitlab-ci.yml` runs the same steps and commits the new data. To switch it on:

1. Create a project access token with the `write_repository` scope.
2. Save it as a masked CI/CD variable named `DATA_PUSH_TOKEN`.
3. Add a pipeline schedule (Build > Pipeline schedules) for `0 3 * * 1`, which is Monday 06:00 Nairobi time.

The runner needs internet access to KAMIS, NASA POWER, EPRA and OpenStreetMap.

## Coverage

- **16 crops:**
  - Dry grains and pulses get "where" and "when": maize, beans, green grams, sorghum, finger millet and cowpeas.
  - Fresh produce gets "where to sell today": tomatoes, onions, cabbages, kales, Irish potatoes, carrots, cooking bananas, sweet potatoes, avocado and capsicums.
- **7,862 towns and villages** in all 47 counties.
- **75 markets.** 47 have reported in the last 90 days. Markets that have gone quiet show an estimate but are never recommended.

## How the advice works

- **Trip costs:** every option pays the full trip, using the cheapest way to move the load: freight, loading, the market fee, and the farmer's fare and time. The rates are in `data/costs.json` with their sources, and are explained on the How it works page.
- **When it says move or wait:** only if the cautious numbers still pay at least KSh 1,000, or 10% more than the nearest market. Otherwise it says "sell at your nearest market".
- **Prices it won't trust:** a market whose price is far out of line with its neighbours is never recommended.

## Sources

- **Prices:** KAMIS, Ministry of Agriculture (<https://kamis.kilimo.go.ke>). This is the source of truth for the model.
- **Seasonal pattern and cross-check:** World Bank Real-Time Food Prices, `KEN_2021_RTFP_v02_M`, under an open licence with attribution. These are modelled estimates, used only for maize and beans.
- **Rainfall:** NASA POWER daily rainfall at each county's centre.
- **County boundaries:** geoBoundaries KEN ADM1 (public domain).
- **Places, markets and road distances:** OpenStreetMap contributors (ODbL), via Overpass, Nominatim and OSRM.
- **Diesel price:** EPRA pump prices.
- **Photographs:** Kenyan markets from Wikimedia Commons, credited in `public/photos/credits.json` and the site footer. They are not Soko Mbele users.
- **The wordmark:** Montserrat Bold (SIL Open Font License).

## Limits

- **SMS and phone menu:** these are previews on the website; nothing is sent. `*944#` is a placeholder code, and no Safaricom API is used.
- **Selling units** still need confirming with farmers: 90 kg bags for grains, 50 kg for potatoes, kilograms for other fresh produce.
- **Language:** English only for now.

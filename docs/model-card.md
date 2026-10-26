# Model card: Soko Mbele price forecast

## What it does

It forecasts the wholesale price (KSh a kilo) of 16 crops at each KAMIS market, 1 to 4 weeks ahead, with an 80% range. The app acts on the low end of that range, not the middle.

## Data

- **Prices:** KAMIS market reports, 2005 to 2026. Of 412,596 reports, 336,972 are used after checking. They are grouped into one weekly price per market and crop.
- **Reports left out:** a whole-bag price typed in as a kilo price, a price too low to be real, a price more than double or under half the national price that week, and KAMIS's test entries. The Results page lists them.
- **Rain:** NASA POWER daily rainfall at each county's centre, compared with the 2005–2020 normal for the same weeks.
- **Seasonal pattern:** World Bank estimates for maize and beans, KAMIS for the other crops. Only data from before the test period is used.
- **Reporting gap:** KAMIS reporting almost stopped from November 2024 to April 2025. No forecast is made across that gap.

## Model

LightGBM gradient-boosted trees (`scripts/model/train.py`): one model per horizon, shared across all crops and markets. It predicts the change in log price, with absolute-error loss so one wild report doesn't drag it.

| Setting | Value |
| --- | --- |
| Trees | 300 |
| Learning rate | 0.03 |
| Leaves per tree | 15 |
| Minimum rows per leaf | 300 |
| Row / feature sampling | 70% / 80% |
| L2 penalty | 10 |

It learns from 427,303 past price moves; the two-week model uses 108,209 of them. There are 16 inputs, all known on the day of the forecast:

- where the market sits against the national price, beyond its usual premium;
- its county neighbours;
- its own recent moves and volatility;
- its price against its past year;
- the national trend;
- the time of year;
- rain against normal;
- how old the last report is;
- the crop.

**What it leans on most:**

| Input | Share |
| --- | --- |
| The market against the national price, beyond its usual premium | 16% |
| Which crop it is | 16% |
| Last week's change | 13% |
| The price against its own past year | 8% |
| The 4-week change | 8% |
| Rain, three inputs together | 8% |

**The 80% range:** each crop gets its own range, set from the model's errors over the last 26 weeks it did not train on.

## Results

The test: train on prices up to 30 December 2024, then forecast every week from 6 January 2025 to 19 October 2026, retraining every 4 weeks on what was known then. The "simple guess" is that the price stays where it was last reported. MAE is the average miss in KSh a kilo.

| Ahead | Model MAE | Simple guess MAE | Same week last year MAE | Range held | Big moves called right |
| --- | --- | --- | --- | --- | --- |
| 1 week | 4.83 | 4.97 | 12.41 | 82% | 71% |
| 2 weeks | 5.78 | 5.94 | 12.34 | 82% | 70% |
| 3 weeks | 6.54 | 6.80 | 12.28 | 81% | 70% |
| 4 weeks | 7.20 | 7.58 | 12.19 | 80% | 72% |

- **It beats the simple guess at every horizon,** by 3% at two weeks and 5% at four. That is a modest margin, which is normal for short-term market prices.
- **It calls big moves (10% or more) the right way about 70% of the time.** The simple guess can't call any.
- **It loses to the simple guess on 3 of 16 crops:** finger millet, cowpeas and onions.
- **The range holds 74% to 90% of the time per crop.** Irish potatoes are the least covered.

## Checks on every training run

A run that fails any check is not published, and the last good files stay.

| Check | Result (two weeks ahead) |
| --- | --- |
| Beats the simple guess, and not by luck | Ahead in 1,000 of 1,000 resampled tests; KSh 0.17 a kilo closer (95% interval 0.10–0.24) |
| Learns real patterns | Trained on shuffled prices it misses by 5.94, exactly like the simple guess; trained on real prices, 5.77 |
| Behaves like a market | Prices 15% above usual: it expects a fall, and 71% of those that moved fell. 15% below: 76% rose |
| Its range holds | 82%, against a target of 80% (72–88% allowed) |
| No impossible forecasts | Every forecast sits inside its own range and within half to double the last price |

The settings were chosen on 2024 prices (`pnpm data:validate`) before the 2025–26 test was looked at.

## Limits

- **One report can be off by 30%,** so the app also weighs each market's typical price over 4 weeks.
- **Some markets pay well above others all year.** That is usually a different grade or measure, so the app never sends a farmer there.
- **Six markets are placed at their county's centre,** because OpenStreetMap doesn't know them by their KAMIS name: Bondeni, Chebunyo, Kipkaren, Makutano Kirinyaga, Malimili Livestock Market and Nyamakima.
- **Rain is one reading per county,** so a big county such as Turkana gets a single figure.
- **Harvest volumes and cross-border trade are not used yet.**

import assert from "node:assert/strict";
import { test } from "node:test";
import { recommend, type EngineData } from "./engine.ts";
import type { CropId } from "./crops.ts";
import type { Costs, Forecast, PriceNow } from "./types.ts";

// Round costs so the sums check by hand: KSh 0.01/kg/km, KSh 1/kg handling, no fees, fare or time.
const costs: Costs = {
  transport_modes: [
    { id: "shared", label: "a lorry", charged: "per_bag", max_kg: 1e6, max_km: 1e4, base: 0, per_km: 0.9, fuel_share: 0, farmer_rides: false },
  ],
  diesel: { ksh_per_litre: 200, reference_ksh_per_litre: 200, from: "2026-10-15", place: "Nairobi" },
  handling_per_bag: 90,
  market_fee_per_bag: 0,
  market_fee_city_per_bag: 0,
  city_market_counties: [],
  fare_per_km: 0,
  farmer_day_ksh: 0,
  working_day_hours: 8,
  road_time_factor: 1,
  max_trip_hours: 4,
  max_trip_hours_fresh: 3,
  storage_per_kg_week: 0.2,
  min_gain_ksh: 300,
  min_gain_share: 0.02,
  max_usual_premium: 1.4,
  max_nearby_ratio: 1.4,
  sources: [],
};

const price = (market: string, wholesale: number, crop: CropId = "maize", observed = "2026-10-20", typical = wholesale): PriceNow => ({
  market, county: "X", crop, observed, wholesale, typical, usual_premium: 1, retail: null, supply_volume: null, nearby_median: null,
});

const forecast = (market: string, weeks: number, p: number, lower: number): Forecast => ({
  market, county: "X", crop: "maize" as const, date: "2026-11-01", horizon_days: weeks * 7,
  predicted_price: p, confidence: "medium", lower, upper: p + (p - lower),
});

const data = (current: PriceNow[], forecasts: Forecast[] = []): EngineData => ({
  asOf: "2026-10-23",
  towns: [{ id: "farm", name: "Farmville", county: "X", lat: 0, lon: 0, main: true }],
  current,
  forecasts,
  roads: {
    farm: [
      { market: "Near", km: 10, hours: 0.2 },
      { market: "Mid", km: 50, hours: 1 },
      { market: "Far", km: 400, hours: 6 },
    ],
  },
  costs,
});

const maize = (quantity = 10, storage = false) => ({ crop: "maize" as const, quantity, town: "farm", storage });

test("the nearest market with a price is the baseline, and it pays transport too", () => {
  const r = recommend(maize(), data([price("Near", 40), price("Mid", 40)]));
  // 10 bags = 900 kg; transport to Near = (1 + 0.01*10) * 900 = 990
  assert.equal(r.baseline.market, "Near");
  assert.equal(r.baseline.transport, 990);
  assert.equal(r.baseline.net, 40 * 900 - 990);
  assert.equal(r.action, "sell_nearest");
});

test("moves when a further market pays enough more to cover the extra transport", () => {
  const r = recommend(maize(), data([price("Near", 40), price("Mid", 50)]));
  // Mid: 45,000 - (1 + 0.5) * 900 = 43,650; Near: 36,000 - 990 = 35,010
  assert.equal(r.action, "move");
  assert.equal(r.best.market, "Mid");
  assert.equal(r.best.gainVsBaseline, 43650 - 35010);
  assert.match(r.reasoning, /^Sell today at Mid\. Mid paid KSh 50\.00 a kilo/);
  assert.match(r.ussd, /\+KSh 8,640 for 10 bags vs Near/);
  assert.match(r.sms, /^Soko Mbele: Sell maize at Mid today, not Near\. You get KSh 8,640 more for 10 bags after transport/);
  assert.ok(r.sms.length <= 160);
});

test("stays at the nearest market when the gap does not clear the margin", () => {
  // Mid pays 1.00 more: 900 gross gain - 360 extra transport = 540, below 720 (2% of 36,000)
  const r = recommend(maize(), data([price("Near", 40), price("Mid", 41)]));
  assert.equal(r.action, "sell_nearest");
  assert.equal(r.threshold, 720);
  assert.equal(r.runnerUp?.market, "Mid");
  assert.match(r.evidence, /make only KSh 540 more/);
});

test("ignores markets beyond the trip limit and lists stale prices as not compared", () => {
  const r = recommend(maize(), data([price("Near", 40), price("Far", 90), price("Mid", 60, "maize", "2026-09-01")]));
  assert.equal(r.action, "sell_nearest");
  assert.equal(r.options.length, 1);
  assert.deepEqual(r.notCompared.map((n) => n.market), ["Mid"]);
});

test("waits only when the low end of the forecast still pays for storage", () => {
  const confident = recommend(maize(10, true), data([price("Near", 40)], [forecast("Near", 2, 46, 44)]));
  assert.equal(confident.action, "hold");
  assert.equal(confident.best.weeks, 2);
  assert.equal(confident.best.storage, 2 * 0.2 * 900);

  const uncertain = recommend(maize(10, true), data([price("Near", 40)], [forecast("Near", 2, 46, 38)]));
  assert.equal(uncertain.action, "sell_nearest");
  assert.match(uncertain.evidence, /Waiting would not pay enough to be worth it/);
});

test("fresh produce is never held, whatever the forecast says", () => {
  const tomato = (m: string, p: number) => price(m, p, "tomatoes");
  const f = { ...forecast("Near", 2, 90, 88), crop: "tomatoes" as const };
  const r = recommend({ crop: "tomatoes", quantity: 300, town: "farm", storage: true }, data([tomato("Near", 40)], [f]));
  assert.equal(r.action, "sell_nearest");
  assert.ok(r.options.every((o) => o.weeks === 0));
  assert.equal(r.baseline.kg, 300); // tomatoes are counted in kg
  assert.match(r.evidence, /can.t wait/);
});

test("prefers a certain sale today over a riskier wait with a similar expected gain", () => {
  const r = recommend(maize(10, true), data([price("Near", 40), price("Mid", 50)], [forecast("Mid", 3, 50.5, 44)]));
  assert.equal(r.action, "move");
  assert.equal(r.best.weeks, 0);
  assert.equal(r.options[0].id, r.best.id); // the list is ranked the way the decision is made
});

test("rejects bad input loudly", () => {
  assert.throws(() => recommend(maize(0), data([price("Near", 40)])), /quantity/);
  assert.throws(() => recommend({ ...maize(), town: "nowhere" }, data([price("Near", 40)])), /Unknown town/);
  assert.throws(() => recommend({ ...maize(), crop: "beans" }, data([price("Near", 40)])), /No market near Farmville/);
});

test("one high report does not send the farmer on a long trip", () => {
  // Mid's latest report is 60, but it usually trades at 41: counted at 41, the move does not clear the margin.
  const r = recommend(maize(), data([price("Near", 40), price("Mid", 60, "maize", "2026-10-20", 41)]));
  assert.equal(r.action, "sell_nearest");
  assert.ok(r.runnerUp!.gainVsBaseline > 0); // the latest report still shows on screen, honestly
});

test("a forecast built on one high report does not justify waiting either", () => {
  // Mid reported 60 but usually trades at 40; its forecast inherits the 60.
  const r = recommend(maize(10, true), data([price("Near", 40), price("Mid", 60, "maize", "2026-10-20", 40)], [forecast("Mid", 1, 60, 58)]));
  assert.equal(r.action, "sell_nearest");
});

test("every trip pays the farmer's fare there and back", () => {
  const d = data([price("Near", 40)]);
  const r = recommend(maize(), { ...d, costs: { ...costs, fare_per_km: 3 } });
  // freight and handling 990, plus 2 * 3 * 10 km fare
  assert.equal(r.baseline.fare, 60);
  assert.equal(r.baseline.transport, 1050);
});

test("never sends a farmer on a trip they cannot make and come back from in a day", () => {
  // Far pays far more, but is 6 hours each way
  const r = recommend(maize(), data([price("Near", 40), price("Far", 90)]));
  assert.equal(r.action, "sell_nearest");
  assert.ok(!r.options.some((o) => o.market === "Far"));
});

test("says when a closer market has stopped reporting the crop", () => {
  const r = recommend(maize(), data([price("Near", 40, "maize", "2026-08-01"), price("Mid", 40)]));
  assert.equal(r.baseline.market, "Mid");
  assert.match(r.warnings[0], /^Near is closer \(10 km\) but has not reported a price for maize since 1 Aug/);
});

test("never sends a farmer to a market that always pays far above the rest of the country", () => {
  // Mid pays much more today, but it has paid 1.6x the national price all year: a different grade or measure
  const r = recommend(maize(), data([price("Near", 40), { ...price("Mid", 60), usual_premium: 1.6 }]));
  assert.equal(r.action, "sell_nearest");
  assert.deepEqual(r.outOfLine.map((o) => [o.market, o.why]), [["Mid", "usually_high"]]);
});

test("never sends a farmer to a market whose price is far above the markets around it", () => {
  const r = recommend(maize(), data([price("Near", 40), { ...price("Mid", 70), nearby_median: 40 }]));
  assert.equal(r.action, "sell_nearest");
  assert.equal(r.outOfLine[0].why, "above_neighbours");
});

test("a nearest market far below its neighbours is counted at their price, so one low typo does not send the farmer away", () => {
  // Near says 20 but its neighbours pay 40: Mid at 40.50 is worth the trip against 20, not against 40
  const r = recommend(maize(), data([{ ...price("Near", 20), nearby_median: 40 }, price("Mid", 40.5)]));
  assert.equal(r.baseline.price, 40);
  assert.equal(r.action, "sell_nearest");
  assert.match(r.warnings[0], /^Near reported KSh 20\.00 a kilo, far below the markets around it/);
});

test("gives a walk-away price: what selling yourself leaves per bag, on the cautious numbers", () => {
  const r = recommend(maize(), data([price("Near", 40), price("Mid", 50)]));
  // Mid leaves 43,650 for 900 kg: 48.50 a kilo, 4,365 a 90 kg bag
  assert.equal(r.walkAway.perUnit, 4365);
  assert.equal(r.broker, null);
});

test("a low broker offer: selling yourself pays more, and says by how much", () => {
  const r = recommend({ ...maize(), offer: 35 }, data([price("Near", 40), price("Mid", 50)]));
  assert.equal(r.broker!.verdict, "sell_yourself");
  assert.equal(r.broker!.gain, 43650 - 35 * 900);
  assert.match(r.broker!.headline, /^Selling at Mid gets you KSh 12,150 more than the broker's offer$/);
});

test("a broker offer within a normal week's price movement is called close, not a reason to travel", () => {
  // 48 a kilo is 43,200: Mid adds only 450, under the 2% margin of 864
  const r = recommend({ ...maize(), offer: 48 }, data([price("Near", 40), price("Mid", 50)]));
  assert.equal(r.broker!.verdict, "close");
});

test("a broker offer above every market after transport: take it", () => {
  const r = recommend({ ...maize(), offer: 49 }, data([price("Near", 40), price("Mid", 50)]));
  assert.equal(r.broker!.verdict, "take_offer");
  assert.match(r.broker!.evidence, /would leave you KSh 450 less than the broker's KSh 44,100/);
});

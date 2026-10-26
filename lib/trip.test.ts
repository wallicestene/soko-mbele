// Against the real rates in data/costs.json.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { atDiesel, tripCost } from "./trip.ts";
import { Costs } from "./types.ts";

const costs = Costs.parse(JSON.parse(readFileSync(new URL("../data/costs.json", import.meta.url), "utf8")));
const bags = (n: number) => n * 90;

test("one bag to a market down the road goes on a matatu, not a hired vehicle", () => {
  assert.equal(tripCost(bags(1), 5, 0.2, "Meru", costs).mode, "shared");
});

test("a pickup-sized load hires a pickup when that beats paying per bag", () => {
  assert.equal(tripCost(bags(18), 40, 1, "Meru", costs).mode, "pickup");
});

test("a few bags to a far market go on shared transport, and the farmer pays a fare", () => {
  const t = tripCost(bags(5), 80, 2, "Meru", costs);
  assert.equal(t.mode, "shared");
  assert.equal(t.fare, 2 * costs.fare_per_km * 80);
});

test("a big harvest hires a lorry, the farmer rides in the cab, and more bags cost less each", () => {
  const t = tripCost(bags(100), 80, 2, "Meru", costs);
  assert.equal(t.mode, "lorry");
  assert.equal(t.fare, 0);
  assert.ok(t.freight / 100 < tripCost(bags(10), 80, 2, "Meru", costs).freight / 10);
});

test("more than a lorry's load needs a second lorry", () => {
  assert.equal(tripCost(bags(150), 80, 2, "Meru", costs).trips, 2);
});

test("entering a Nairobi market costs more in fees", () => {
  assert.ok(tripCost(bags(10), 20, 1, "Nairobi", costs).marketFee > tripCost(bags(10), 20, 1, "Meru", costs).marketFee);
});

test("only the fuel share of a rate moves with diesel", () => {
  const c = { diesel: { ...costs.diesel, ksh_per_litre: costs.diesel.reference_ksh_per_litre * 2 } };
  assert.equal(atDiesel(100, 0.4, c), 140);
});

test("the farmer's time is counted at the farm minimum wage", () => {
  const t = tripCost(bags(10), 100, 2, "Meru", costs);
  assert.equal(t.time, Math.round(((4 * costs.farmer_day_ksh) / costs.working_day_hours) * 100) / 100);
});

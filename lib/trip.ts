// The cheapest way to move the load, plus loading, market fee, fare and time. Rates: data/costs.json.
import type { Costs, TransportMode } from "./types";

export const BAG_KG = 90;

export type Trip = {
  mode: TransportMode["id"];
  vehicle: string; // "in a hired pickup"
  trips: number;
  freight: number;
  handling: number;
  marketFee: number;
  fare: number; // when the farmer can't ride with the load
  time: number; // at the farm minimum wage
  total: number;
};

const cents = (x: number) => Math.round(x * 100) / 100;

// Only the fuel share of a rate moves with diesel.
export const atDiesel = (rate: number, fuelShare: number, c: Pick<Costs, "diesel">) =>
  rate * (1 - fuelShare + (fuelShare * c.diesel.ksh_per_litre) / c.diesel.reference_ksh_per_litre);

export function freightBy(mode: TransportMode, kg: number, km: number, c: Pick<Costs, "diesel">): { cost: number; trips: number } | null {
  if (km > mode.max_km) return null;
  const perKm = atDiesel(mode.per_km, mode.fuel_share, c);
  if (mode.charged === "per_bag") {
    if (kg > mode.max_kg) return null;
    const bags = kg / BAG_KG;
    return { cost: bags * (mode.base + perKm * km), trips: 1 };
  }
  const trips = Math.ceil(kg / mode.max_kg);
  return { cost: trips * (mode.base + perKm * km), trips };
}

export function tripCost(kg: number, km: number, hoursOneWay: number, marketCounty: string, c: Costs): Trip {
  const fare = 2 * c.fare_per_km * km;
  let best: { mode: TransportMode; cost: number; trips: number; fare: number } | null = null;
  for (const mode of c.transport_modes) {
    const f = freightBy(mode, kg, km, c);
    if (!f) continue;
    const rideFare = mode.farmer_rides ? 0 : fare;
    if (!best || f.cost + rideFare < best.cost + best.fare) best = { mode, cost: f.cost, trips: f.trips, fare: rideFare };
  }
  if (!best) throw new RangeError(`No way to move ${kg} kg over ${km} km`); // bad costs data
  const city = c.city_market_counties.includes(marketCounty);
  const handling = c.handling_per_bag * (kg / BAG_KG);
  const marketFee = (city ? c.market_fee_city_per_bag : c.market_fee_per_bag) * (kg / BAG_KG);
  const time = (2 * hoursOneWay * c.farmer_day_ksh) / c.working_day_hours;
  const parts = { freight: cents(best.cost), handling: cents(handling), marketFee: cents(marketFee), fare: cents(best.fare), time: cents(time) };
  return {
    mode: best.mode.id,
    vehicle: best.mode.label,
    trips: best.trips,
    ...parts,
    total: cents(parts.freight + parts.handling + parts.marketFee + parts.fare + parts.time),
  };
}

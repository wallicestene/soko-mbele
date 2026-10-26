// Only dried grains and pulses are storable; selling units still to confirm with farmers.

export type CropDef = {
  id: string;
  name: string;
  kamisProduct: number; // KAMIS product id
  file: string; // in data/raw/
  group: "Dry grains and pulses" | "Fresh produce";
  unit: { label: string; plural: string; kg: number };
  defaultQuantity: number;
  storable: boolean;
  lossRatePerWeek: number; // share of value lost a week in store
  rtfpColumn?: string; // World Bank RTFP column, for seasonality
};

const bag90 = { label: "90 kg bag", plural: "90 kg bags", kg: 90 };
const kg = { label: "kg", plural: "kg", kg: 1 };

export const CROPS = [
  { id: "maize", name: "Maize", kamisProduct: 1, file: "kamis_dry_maize.csv", group: "Dry grains and pulses", unit: bag90, defaultQuantity: 10, storable: true, lossRatePerWeek: 0.0025, rtfpColumn: "maize_median" },
  { id: "beans", name: "Beans (Rosecoco)", kamisProduct: 64, file: "kamis_beans_rosecoco.csv", group: "Dry grains and pulses", unit: bag90, defaultQuantity: 5, storable: true, lossRatePerWeek: 0.0025, rtfpColumn: "beans_median" },
  { id: "green_grams", name: "Green grams (ndengu)", kamisProduct: 10, file: "kamis_green_grams.csv", group: "Dry grains and pulses", unit: bag90, defaultQuantity: 5, storable: true, lossRatePerWeek: 0.0025 },
  { id: "sorghum", name: "Sorghum (red)", kamisProduct: 2, file: "kamis_red_sorghum.csv", group: "Dry grains and pulses", unit: bag90, defaultQuantity: 5, storable: true, lossRatePerWeek: 0.0025 },
  { id: "finger_millet", name: "Finger millet (wimbi)", kamisProduct: 54, file: "kamis_finger_millet.csv", group: "Dry grains and pulses", unit: bag90, defaultQuantity: 5, storable: true, lossRatePerWeek: 0.0025 },
  { id: "cowpeas", name: "Cowpeas", kamisProduct: 189, file: "kamis_cowpeas.csv", group: "Dry grains and pulses", unit: bag90, defaultQuantity: 5, storable: true, lossRatePerWeek: 0.0025 },
  { id: "tomatoes", name: "Tomatoes", kamisProduct: 61, file: "kamis_tomatoes.csv", group: "Fresh produce", unit: kg, defaultQuantity: 300, storable: false, lossRatePerWeek: 0 },
  { id: "onions", name: "Onions (dry)", kamisProduct: 158, file: "kamis_dry_onions.csv", group: "Fresh produce", unit: kg, defaultQuantity: 300, storable: false, lossRatePerWeek: 0 },
  { id: "cabbages", name: "Cabbages", kamisProduct: 58, file: "kamis_cabbages.csv", group: "Fresh produce", unit: kg, defaultQuantity: 500, storable: false, lossRatePerWeek: 0 },
  { id: "kales", name: "Kales (sukuma wiki)", kamisProduct: 154, file: "kamis_kales.csv", group: "Fresh produce", unit: kg, defaultQuantity: 200, storable: false, lossRatePerWeek: 0 },
  { id: "potatoes", name: "Irish potatoes (white)", kamisProduct: 163, file: "kamis_white_irish_potatoes.csv", group: "Fresh produce", unit: { label: "50 kg bag", plural: "50 kg bags", kg: 50 }, defaultQuantity: 10, storable: false, lossRatePerWeek: 0 },
  { id: "carrots", name: "Carrots", kamisProduct: 60, file: "kamis_carrots.csv", group: "Fresh produce", unit: kg, defaultQuantity: 300, storable: false, lossRatePerWeek: 0 },
  { id: "bananas", name: "Bananas (cooking)", kamisProduct: 255, file: "kamis_cooking_bananas.csv", group: "Fresh produce", unit: kg, defaultQuantity: 300, storable: false, lossRatePerWeek: 0 },
  { id: "sweet_potatoes", name: "Sweet potatoes", kamisProduct: 59, file: "kamis_sweet_potatoes.csv", group: "Fresh produce", unit: kg, defaultQuantity: 300, storable: false, lossRatePerWeek: 0 },
  { id: "avocado", name: "Avocado", kamisProduct: 142, file: "kamis_avocado.csv", group: "Fresh produce", unit: kg, defaultQuantity: 300, storable: false, lossRatePerWeek: 0 },
  { id: "capsicums", name: "Capsicums", kamisProduct: 172, file: "kamis_capsicums.csv", group: "Fresh produce", unit: kg, defaultQuantity: 100, storable: false, lossRatePerWeek: 0 },
] as const satisfies readonly CropDef[];

export type CropId = (typeof CROPS)[number]["id"];
export const CROP_IDS = CROPS.map((c) => c.id) as [CropId, ...CropId[]];

const byId = new Map<string, CropDef>(CROPS.map((c) => [c.id, c]));
export const crop = (id: string): CropDef => {
  const c = byId.get(id);
  if (!c) throw new RangeError(`Unknown crop: ${id}`);
  return c;
};

import { z } from "zod";
import { chartsFor, engineData } from "@/lib/data";
import { crop as cropDef } from "@/lib/crops";
import { recommend } from "@/lib/engine";
import { Crop } from "@/lib/types";

const Query = z
  .object({
    crop: Crop,
    town: z.string().min(1),
    quantity: z.coerce.number().positive().max(1_000_000).optional(),
    bags: z.coerce.number().positive().max(1_000_000).optional(), // old name for quantity
    storage: z
      .union([z.boolean(), z.enum(["1", "0", "true", "false", "yes", "no"])])
      .default(false)
      .transform((v) => v === true || v === "1" || v === "true" || v === "yes"),
    offer: z.coerce.number().positive().max(1_000_000).optional(),
    offer_unit: z.enum(["unit", "kg"]).default("unit"), // per selling unit or per kilo
  })
  .refine((q) => q.quantity !== undefined || q.bags !== undefined, { message: "quantity is required", path: ["quantity"] });

function answer(raw: unknown) {
  const parsed = Query.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Check the request: crop, town (an id from /api/markets), quantity (a number), storage (1|0) and, optionally, offer (a broker's price a bag, or a kilo with offer_unit=kg) are expected.",
        issues: z.flattenError(parsed.error).fieldErrors,
      },
      { status: 400 },
    );
  }
  const { crop, town, storage, offer, offer_unit } = parsed.data;
  const quantity = parsed.data.quantity ?? parsed.data.bags!;
  const offerPerKg = offer === undefined ? undefined : offer_unit === "kg" ? offer : offer / cropDef(crop).unit.kg;
  try {
    const rec = recommend({ crop, town, quantity, storage, offer: offerPerKg }, engineData);
    return Response.json({ ...rec, charts: chartsFor(rec) });
  } catch (e) {
    if (e instanceof RangeError) return Response.json({ error: e.message }, { status: 404 });
    throw e;
  }
}

export async function GET(request: Request) {
  return answer(Object.fromEntries(new URL(request.url).searchParams));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return answer(body);
}

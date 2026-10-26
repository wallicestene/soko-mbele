// Fetches the newest prices, new markets, rain and diesel into data/raw/; `pnpm data` then rebuilds and retrains.
import { execFileSync } from "node:child_process";
import { CROPS } from "../lib/crops.ts";

const run = (script: string, ...args: string[]) => execFileSync("python3", [`scripts/ingest/${script}`, ...args], { stdio: "inherit" });

// A crop KAMIS fails to serve keeps last week's file; failures are listed at the end.
const failed: string[] = [];
for (const c of CROPS) {
  console.log(`\n${c.name}`);
  try {
    run("fetch_kamis.py", String(c.kamisProduct), `data/raw/${c.file}`, "--update");
  } catch {
    failed.push(c.name);
    console.log(`  kept last week's ${c.file}`);
  }
}
if (failed.length === CROPS.length) throw new Error("KAMIS served no crop at all: nothing refreshed");
run("fetch_geo.py", "--add-new"); // locate markets that started reporting
run("fetch_rain.py");
run("fetch_diesel.py");
if (failed.length) console.log(`\nNot refreshed this time (KAMIS did not answer): ${failed.join(", ")}`);

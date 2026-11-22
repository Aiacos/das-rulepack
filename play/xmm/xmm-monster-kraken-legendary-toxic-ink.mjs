import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-kraken-legendary-toxic-ink.json", { with: { type: "json" } })).default);

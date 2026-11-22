import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-warrior-commander-bonus-tactical-charge.json", { with: { type: "json" } })).default);

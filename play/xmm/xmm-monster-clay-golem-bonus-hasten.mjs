import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-clay-golem-bonus-hasten.json", { with: { type: "json" } })).default);

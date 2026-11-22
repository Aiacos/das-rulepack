import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-balor-action-flame-whip.json", { with: { type: "json" } })).default);

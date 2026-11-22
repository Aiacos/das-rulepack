import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-marid-action-water-jet.json", { with: { type: "json" } })).default);

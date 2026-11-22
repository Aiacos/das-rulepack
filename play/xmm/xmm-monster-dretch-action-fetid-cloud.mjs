import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-dretch-action-fetid-cloud.json", { with: { type: "json" } })).default);

import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-shambling-mound-action-charged-tendril.json", { with: { type: "json" } })).default);

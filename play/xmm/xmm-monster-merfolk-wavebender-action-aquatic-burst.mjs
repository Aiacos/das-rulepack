import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-merfolk-wavebender-action-aquatic-burst.json", { with: { type: "json" } })).default);

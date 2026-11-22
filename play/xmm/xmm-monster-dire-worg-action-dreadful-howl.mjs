import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-dire-worg-action-dreadful-howl.json", { with: { type: "json" } })).default);

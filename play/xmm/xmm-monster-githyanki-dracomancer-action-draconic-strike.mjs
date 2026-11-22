import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-githyanki-dracomancer-action-draconic-strike.json", { with: { type: "json" } })).default);

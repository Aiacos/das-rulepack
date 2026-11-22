import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-banshee-action-horrify.json", { with: { type: "json" } })).default);

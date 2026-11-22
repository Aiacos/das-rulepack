import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-lich-action-paralyzing-touch.json", { with: { type: "json" } })).default);

import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-air-elemental-action-whirlwind.json", { with: { type: "json" } })).default);

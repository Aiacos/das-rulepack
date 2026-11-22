import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-elemental-cataclysm-legendary-rumbling-movement.json", { with: { type: "json" } })).default);

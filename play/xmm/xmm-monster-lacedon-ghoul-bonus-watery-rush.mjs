import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-lacedon-ghoul-bonus-watery-rush.json", { with: { type: "json" } })).default);

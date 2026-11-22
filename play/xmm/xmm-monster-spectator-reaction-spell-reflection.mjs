import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-spectator-reaction-spell-reflection.json", { with: { type: "json" } })).default);

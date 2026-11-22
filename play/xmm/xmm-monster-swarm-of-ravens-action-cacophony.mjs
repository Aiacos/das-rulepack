import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-swarm-of-ravens-action-cacophony.json", { with: { type: "json" } })).default);

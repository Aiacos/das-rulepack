import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-goristro-action-brutal-gore.json", { with: { type: "json" } })).default);

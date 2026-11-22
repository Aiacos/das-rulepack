import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-giant-ape-action-boulder-toss.json", { with: { type: "json" } })).default);

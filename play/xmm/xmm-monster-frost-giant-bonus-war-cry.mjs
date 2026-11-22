import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-frost-giant-bonus-war-cry.json", { with: { type: "json" } })).default);

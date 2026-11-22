import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-ghast-gravecaller-action-claw.json", { with: { type: "json" } })).default);

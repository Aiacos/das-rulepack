import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-gray-slaad-action-chaos-claw.json", { with: { type: "json" } })).default);

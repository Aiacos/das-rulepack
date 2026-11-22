import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-green-slaad-action-chaos-staff.json", { with: { type: "json" } })).default);

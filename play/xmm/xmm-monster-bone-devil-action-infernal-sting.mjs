import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-bone-devil-action-infernal-sting.json", { with: { type: "json" } })).default);

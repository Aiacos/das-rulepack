import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-bearded-devil-action-beard.json", { with: { type: "json" } })).default);

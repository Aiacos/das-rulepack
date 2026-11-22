import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-smoke-mephit-action-cinder-breath.json", { with: { type: "json" } })).default);

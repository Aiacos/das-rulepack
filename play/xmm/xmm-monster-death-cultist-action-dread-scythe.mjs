import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-death-cultist-action-dread-scythe.json", { with: { type: "json" } })).default);

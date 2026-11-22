import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-poltergeist-action-telekinetic-thrust.json", { with: { type: "json" } })).default);

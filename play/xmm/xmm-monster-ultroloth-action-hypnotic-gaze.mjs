import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-ultroloth-action-hypnotic-gaze.json", { with: { type: "json" } })).default);

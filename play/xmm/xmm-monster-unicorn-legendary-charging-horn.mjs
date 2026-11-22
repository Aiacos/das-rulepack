import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-unicorn-legendary-charging-horn.json", { with: { type: "json" } })).default);

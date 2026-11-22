import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-kuo-toa-action-sticky-net.json", { with: { type: "json" } })).default);

import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-ettin-action-morningstar.json", { with: { type: "json" } })).default);

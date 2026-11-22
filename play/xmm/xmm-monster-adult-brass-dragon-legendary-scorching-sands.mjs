import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-adult-brass-dragon-legendary-scorching-sands.json", { with: { type: "json" } })).default);

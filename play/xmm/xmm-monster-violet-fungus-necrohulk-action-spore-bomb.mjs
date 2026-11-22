import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-violet-fungus-necrohulk-action-spore-bomb.json", { with: { type: "json" } })).default);

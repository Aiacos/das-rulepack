import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-tree-blight-action-grasping-root.json", { with: { type: "json" } })).default);

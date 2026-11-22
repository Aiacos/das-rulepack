import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-lacedon-ghoul-action-icy-bite.json", { with: { type: "json" } })).default);

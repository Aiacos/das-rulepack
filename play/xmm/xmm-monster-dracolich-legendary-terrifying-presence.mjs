import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-dracolich-legendary-terrifying-presence.json", { with: { type: "json" } })).default);

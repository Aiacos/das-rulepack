import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-colossus-legendary-stomp.json", { with: { type: "json" } })).default);

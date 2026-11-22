import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-demilich-legendary-grave-dust-flight.json", { with: { type: "json" } })).default);

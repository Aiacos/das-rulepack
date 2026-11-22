import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./xmm-monster-manes-vaporspawn-trait-sickening-vapors.json", { with: { type: "json" } })).default);

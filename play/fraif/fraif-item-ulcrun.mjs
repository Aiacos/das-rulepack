import { scenario } from "../lib/steps.mjs";
export default scenario((await import("./fraif-item-ulcrun.json", { with: { type: "json" } })).default);

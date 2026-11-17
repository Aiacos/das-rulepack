/**
 * Declarative rules for spells that DAS · Core does not ship (books outside the official Foundry modules), keyed by dnd5e
 * identifier. The keys are DAS content keys, documented at the top of `module/scripts/core/content.mjs` in DAS · Core; each
 * entry is validated by the engine when it is registered.
 *
 * Every entry names its book and page, so the rule can be checked against the text.
 */
export const SPELLS = Object.freeze({
  // Shadow Blade (XGE p.164): "while the spell persists, you can use a bonus action to cause the sword to reappear in your
  // hand" — recasting while concentrating costs a bonus action and no slot. The blade itself: scripts/shadow-blade.mjs.
  "shadow-blade": { recast: true, recastCost: "bonus" }
});

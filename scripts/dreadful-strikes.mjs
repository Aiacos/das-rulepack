/**
 * Dreadful Strikes (Fey Wanderer 3, PHB 2024 p.124): the extra Psychic die on a weapon hit, once per turn for each target. The
 * rule is in scripts/core/dreadful-strikes.mjs; DAS · Core's own once-per-turn-per-ranger trigger is switched off by the entry in
 * scripts/rules/books/xphb.mjs.
 *
 * The target is the creature the attacker's client has targeted when the damage is rolled. With several creatures targeted
 * (a weapon attack has one target) nothing is added, since the die belongs to one of them.
 */

import { MODULE_ID } from "./constants.mjs";
import { DREADFUL_STRIKES, alreadyStruck, recordStrike, strikeDie } from "./core/dreadful-strikes.mjs";

const FLAG = "dreadfulStrikes";

/** The current turn's key, or null outside a started combat. */
function turnKey() {
  const combat = game.combat;
  return combat?.started ? `${combat.id}.${combat.round}.${combat.turn}` : null;
}

/** dnd5e.preRollDamageV2: the extra die on the damage roll of a weapon attack. */
function onPreRollDamage(config) {
  const activity = config?.subject;
  const item = activity?.item;
  const actor = item?.actor;
  if ( !actor || (activity.type !== "attack") || (item.type !== "weapon") ) return true;
  if ( !actor.items.some(i => i.system?.identifier === DREADFUL_STRIKES) ) return true;
  const targets = [...game.user.targets];
  if ( targets.length !== 1 ) return true;
  const target = targets[0].document.uuid;
  const turn = turnKey();
  const state = actor.getFlag(MODULE_ID, FLAG);
  if ( alreadyStruck(state, turn, target) ) return true;
  const die = strikeDie(actor.classes?.ranger?.system?.levels);
  config.rolls ??= [];
  config.rolls.push({ data: activity.getRollData?.() ?? {}, parts: [`1d${die}`],
    options: { type: "psychic", types: ["psychic"], properties: [] } });
  if ( turn ) {
    actor.setFlag(MODULE_ID, FLAG, recordStrike(state, turn, target))
      .catch(err => console.warn(`${MODULE_ID} | Dreadful Strikes:`, err));
  }
  return true;
}

export function registerDreadfulStrikes() {
  Hooks.on("dnd5e.preRollDamageV2", onPreRollDamage);
}

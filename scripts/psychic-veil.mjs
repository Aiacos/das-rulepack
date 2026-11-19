/**
 * Psychic Veil (Soulknife 13, PHB 2024 p.135): the veil falls when an attack of its bearer deals damage — the one case DAS · Core
 * cannot tell from a miss (scripts/core/psychic-veil.mjs). Runs on the client that rolls the damage, which owns the bearer.
 */

import { MODULE_ID } from "./constants.mjs";
import { PSYCHIC_VEIL, damageEndsVeil } from "./core/psychic-veil.mjs";

/** The item an effect comes from: its origin is the activity (or the item) that placed it. */
function originItemOf(effect) {
  try {
    const origin = effect.origin ? fromUuidSync(effect.origin, { strict: false }) : null;
    return origin?.item ?? ((origin?.documentName === "Item") ? origin : null);
  } catch { return null; }
}

/** dnd5e.rollDamageV2: after the damage roll of an attack, the bearer's veil ends. */
function onRollDamage(rolls, { subject }={}) {
  const actor = subject?.actor;
  if ( !actor?.isOwner || !rolls?.length ) return;
  const healing = rolls.every(roll => ["healing", "temphp"].includes(roll.options?.type));
  if ( !damageEndsVeil({ activityType: subject.type, healing }) ) return;
  const veils = actor.effects.filter(e => e.statuses?.has("invisible") && (originItemOf(e)?.system?.identifier === PSYCHIC_VEIL));
  if ( !veils.length ) return;
  actor.deleteEmbeddedDocuments("ActiveEffect", veils.map(e => e.id))
    .catch(err => console.warn(`${MODULE_ID} | Psychic Veil:`, err));
}

export function registerPsychicVeil() {
  Hooks.on("dnd5e.rollDamageV2", onRollDamage);
}

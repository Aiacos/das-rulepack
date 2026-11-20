/**
 * Psychic Veil (Soulknife 13, PHB 2024 p.135) — pure computations, no Foundry access.
 *
 * DAS · Core ends such effects on three moments — any attack roll, a damaging use that is not an attack, a use that forces a
 * save. The entry in scripts/rules/books/xphb.mjs keeps the last two; the missing case, an attack that HITS and deals damage,
 * is decided here.
 */

/** The feature, by dnd5e identifier. */
export const PSYCHIC_VEIL = "psychic-veil";

/**
 * Does this damage roll end the veil? Yes for the damage of an attack (the engine rolls it only after a hit); a healing roll, or
 * the damage of a use that is not an attack (the engine already ends the veil for those), no.
 * @param {{activityType?: string, healing?: boolean}} roll
 */
export function damageEndsVeil({ activityType, healing=false }={}) {
  return (activityType === "attack") && !healing;
}

/**
 * Dreadful Strikes (Fey Wanderer 3, PHB 2024 p.124) — pure rules, no Foundry access.
 *
 * A weapon hit deals an extra die of Psychic damage to the target, which can take it only once per turn: the limit is per target,
 * so a ranger who hits two creatures on one turn adds the die to each. The die grows at ranger level 11.
 */

/** The feature, by dnd5e identifier. */
export const DREADFUL_STRIKES = "dreadful-strikes";

/** The faces of the extra die: d4, d6 from ranger level 11. */
export function strikeDie(rangerLevel) {
  return ((Number(rangerLevel) || 0) >= 11) ? 6 : 4;
}

/**
 * Has this target already taken the extra damage this turn?
 * @param {{turn: string, targets: string[]}|null|undefined} state  What was recorded on the ranger.
 * @param {string|null} turn    The current turn's key; null outside combat, where there is no turn to count.
 * @param {string} target       The target's uuid.
 */
export function alreadyStruck(state, turn, target) {
  return !!turn && (state?.turn === turn) && (state.targets ?? []).includes(target);
}

/** The state after the extra damage went to this target on this turn: targets of an earlier turn are forgotten. */
export function recordStrike(state, turn, target) {
  const earlier = (state?.turn === turn) ? (state.targets ?? []) : [];
  return { turn, targets: [...new Set([...earlier, target])] };
}

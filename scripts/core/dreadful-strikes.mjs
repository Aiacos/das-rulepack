/**
 * Dreadful Strikes (Fey Wanderer 3, PHB 2024 p.124) — pure computations, no Foundry access.
 *
 * The extra die is counted once per turn for each target, not once per turn for the ranger: this file keeps that count and
 * gives the size of the die by ranger level.
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

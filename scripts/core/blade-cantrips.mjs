/**
 * Booming Blade and Green-Flame Blade (Tasha's Cauldron of Everything p.106–107; Sword Coast Adventurer's Guide) — pure
 * computations, no Foundry access.
 *
 * What the glue in scripts/blade-cantrips.mjs needs: the number of extra dice by caster level (on the hit, and on the secondary
 * damage), their formulas, distances on a square grid, and the hit targets of an attack the engine has settled.
 */

/** The two cantrips, by dnd5e identifier. */
export const BLADE_CANTRIPS = Object.freeze({
  "booming-blade": Object.freeze({ type: "thunder" }),
  "green-flame-blade": Object.freeze({ type: "fire" })
});

/** How far the fire leaps, and how far the sheathed target may move, in feet. */
export const LEAP_FEET = 5;
export const MOVE_FEET = 5;

/** d8s added to the weapon's damage on a hit: none before 5th level, then 1, 2 (11th), 3 (17th). */
export function hitDice(level) {
  const n = Math.floor(Number(level) || 0);
  return Math.max(0, Math.min(3, Math.floor((n + 1) / 6)));
}

/** d8s of thunder damage a sheathed target takes for moving: 1, then 2 (5th), 3 (11th), 4 (17th). */
export function moveDice(level) {
  return hitDice(level) + 1;
}

/** Formula of the extra damage on a hit, or null before 5th level. */
export function hitFormula(level) {
  const dice = hitDice(level);
  return dice ? `${dice}d8` : null;
}

/** Formula of the fire that leaps to the second creature: the spellcasting modifier, plus the dice from 5th level. */
export function leapFormula(level, modifier) {
  const dice = hitDice(level);
  const mod = Math.floor(Number(modifier) || 0);
  if ( !dice ) return String(Math.max(0, mod));
  if ( !mod ) return `${dice}d8`;
  return `${dice}d8 ${mod < 0 ? "-" : "+"} ${Math.abs(mod)}`;
}

/**
 * Distance in feet between two top-left positions on a square grid, as dnd5e counts it by default (a diagonal step costs one
 * square).
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {{size: number, distance: number}} grid  Pixels per square, feet per square.
 */
export function feetBetween(from, to, grid) {
  const size = Number(grid?.size) || 100;
  const distance = Number(grid?.distance) || 5;
  const dx = Math.abs((Number(to?.x) || 0) - (Number(from?.x) || 0)) / size;
  const dy = Math.abs((Number(to?.y) || 0) - (Number(from?.y) || 0)) / size;
  return Math.round(Math.max(dx, dy) * distance * 100) / 100;
}

/**
 * Gap in feet between two tokens, edge to edge, on a square grid: 0 when adjacent squares touch, 5 with one empty square
 * between them.
 * @param {{x: number, y: number, width: number, height: number}} a  Position in pixels, size in squares.
 * @param {{x: number, y: number, width: number, height: number}} b
 * @param {{size: number, distance: number}} grid
 */
export function gapFeet(a, b, grid) {
  const size = Number(grid?.size) || 100;
  const distance = Number(grid?.distance) || 5;
  const span = (p, q, pw, qw) => {
    const p0 = p / size, q0 = q / size;
    if ( p0 + pw <= q0 ) return q0 - (p0 + pw);
    if ( q0 + qw <= p0 ) return p0 - (q0 + qw);
    return 0;
  };
  const gx = span(Number(a.x) || 0, Number(b.x) || 0, Number(a.width) || 1, Number(b.width) || 1);
  const gy = span(Number(a.y) || 0, Number(b.y) || 0, Number(a.height) || 1, Number(b.height) || 1);
  return Math.round(Math.max(gx, gy) * distance * 100) / 100;
}

/** Is `b` within 5 feet of `a` (adjacent, diagonals included)? */
export function withinLeap(a, b, grid) {
  return gapFeet(a, b, grid) < LEAP_FEET;
}

/** Did the sheathed target move far enough to set off the booming energy? */
export function movedEnough(from, to, grid) {
  return feetBetween(from, to, grid) >= MOVE_FEET;
}

/**
 * The hit targets of a finished attack, from the engine's resolution (`flags["dnd5e-combat"].resolution` of the usage message).
 * @returns {string[]|null}  Token uuids; null while the attack is not settled.
 */
export function hitTargets(resolution) {
  if ( !resolution?.plan?.attack ) return null;
  if ( !["done", "missed"].includes(resolution.step) ) return null;
  return (resolution.targets ?? []).filter(t => t.hit && !t.unaffected).map(t => t.token).filter(Boolean);
}

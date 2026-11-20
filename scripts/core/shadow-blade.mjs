/**
 * Shadow Blade (Xanathar's Guide to Everything, p. 164) — pure computations, no Foundry access.
 *
 * What the glue in scripts/shadow-blade.mjs needs: the data of the weapon item it creates, its number of dice by slot level,
 * which light on a target gives advantage, which attack modes are throws, and whether a turn has ended.
 */

/** dnd5e identifier of the spell. */
export const SPELL_IDENTIFIER = "shadow-blade";

/** Identifier given to the blade this module creates. */
export const BLADE_IDENTIFIER = "shadow-blade-weapon";

/** Identifiers of blades created by other sources (DDB Importer: `shadow-blade-2d8` … `shadow-blade-5d8`). */
const FOREIGN_BLADE = /^shadow-blade-[2-5]d8$/;

/** Number of d8 the blade deals for a spell slot of this level. */
export function diceForLevel(level) {
  const n = Math.floor(Number(level) || 0);
  if ( n >= 7 ) return 5;
  if ( n >= 5 ) return 4;
  if ( n >= 3 ) return 3;
  return 2;
}

/** Is this identifier a Shadow Blade weapon, ours or one created by another source? */
export function isBladeIdentifier(identifier) {
  return (identifier === BLADE_IDENTIFIER) || FOREIGN_BLADE.test(String(identifier ?? ""));
}

/**
 * The light on the target gives advantage: dim light or darkness (magical darkness included).
 * @param {string|null|undefined} key  DAS light key: "bright" | "dim" | "dark" | "magical".
 */
export function inShadow(key) {
  return ["dim", "dark", "magical"].includes(key);
}

/** Thrown attack modes of dnd5e ("thrown", "thrown-offhand"). */
export function isThrown(attackMode) {
  return String(attackMode ?? "").startsWith("thrown");
}

/**
 * Did the combat move forward (a turn ended), as opposed to the GM stepping back?
 * @param {{round: number, turn: number}} prior
 * @param {{round: number, turn: number}} current
 */
export function turnAdvanced(prior, current) {
  const pr = Number(prior?.round) || 0;
  const cr = Number(current?.round) || 0;
  if ( cr !== pr ) return cr > pr;
  return (Number(current?.turn) || 0) > (Number(prior?.turn) || 0);
}

/**
 * Item data of the conjured blade.
 * @param {object} options
 * @param {number} options.level     Level of the slot the spell was cast with.
 * @param {string} options.name      Localised item name.
 * @param {string} options.img       Icon.
 * @param {string} options.moduleId  Id of this module, for the flag.
 * @param {string} options.spellUuid Uuid of the spell that conjured it.
 * @param {string} options.activityId 16-character id for the attack activity.
 */
export function bladeData({ level, name, img, moduleId, spellUuid, activityId }) {
  const dice = diceForLevel(level);
  return {
    name: `${name} (${dice}d8)`,
    type: "weapon",
    img,
    system: {
      identifier: BLADE_IDENTIFIER,
      quantity: 1,
      equipped: true,
      proficient: 1,
      identified: true,
      type: { value: "simpleM", baseItem: "" },
      properties: ["fin", "lgt", "thr", "mgc"],
      range: { value: 20, long: 60, units: "ft" },
      weight: { value: 0, units: "lb" },
      price: { value: 0, denomination: "gp" },
      damage: { base: { number: dice, denomination: 8, types: ["psychic"], bonus: "" } },
      activities: {
        [activityId]: {
          _id: activityId,
          type: "attack",
          activation: { type: "action", override: false },
          attack: { type: { value: "melee", classification: "weapon" } },
          damage: { includeBase: true, parts: [] }
        }
      }
    },
    flags: { [moduleId]: { shadowBlade: { spell: spellUuid, level: Math.floor(Number(level) || 2), thrown: false } } }
  };
}

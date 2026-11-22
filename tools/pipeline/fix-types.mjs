// The type of what a drafter's data fix may write at each allowed path (Ruling R6, draft-keys.mjs FIX_PATHS): its `value`
// and its `from` guard have that type, and nothing else is accepted. There is no free string type: a value is a number, a
// short formula, a word of a closed list, a boolean, or a list of typed objects whose keys are closed.
import { isFormula } from "./assert.mjs";

const freeze = (list) => Object.freeze([...list]);
// The closed lists. Those the engine has are copied from it and tests/pipeline/fix-types.test.mjs checks them against the
// DAS_CORE clone; the others are dnd5e's own configuration values (CONFIG.DND5E.<name>), written out here.
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"]; // engine core/content/enums.mjs ABILITIES
const DISTANCE_UNITS = ["ft", "mi", "m", "km"]; // dnd5e movementUnits
export const FIX_ENUMS = Object.freeze({
  // engine core/content/enums.mjs DAMAGE_TYPES
  damageTypes: freeze(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison",
    "psychic", "radiant", "slashing", "thunder"]),
  abilities: freeze(ABILITIES),
  // engine core/monster-text.mjs CONDITIONS (core.mjs loadCore statuses)
  statuses: freeze(["blinded", "charmed", "deafened", "frightened", "grappled", "incapacitated", "invisible", "paralyzed",
    "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"]),
  distanceUnits: freeze(DISTANCE_UNITS),
  rangeUnits: freeze(["self", "touch", "spec", "any", ...DISTANCE_UNITS]), // dnd5e rangeTypes + movementUnits
  templateTypes: freeze(["circle", "cone", "cube", "cylinder", "line", "radius", "sphere", "square", "wall"]), // areaTargetTypes
  affectsTypes: freeze(["self", "ally", "enemy", "creature", "object", "space", "creatureOrObject", "any", "willing"]),
  // dnd5e specialTimePeriods, scalarTimePeriods, permanentTimePeriods
  timeUnits: freeze(["inst", "spec", "turn", "round", "minute", "hour", "day", "month", "year", "disp", "dstr", "perm"]),
  activationTypes: freeze(["action", "bonus", "reaction", "minute", "hour", "day", "longRest", "shortRest", "encounter",
    "turnStart", "turnEnd", "legendary", "mythic", "lair", "crew", "special"]), // dnd5e activityActivationTypes
  dcCalculations: freeze(["spellcasting", ...ABILITIES]), // dnd5e save activity dc.calculation (custom "" excluded)
  onSave: freeze(["none", "half", "full"]), // dnd5e damage.onSave
  recoveryPeriods: freeze(["lr", "sr", "day", "dawn", "dusk", "initiative", "turnStart", "turnEnd", "turn", "recharge"]),
  recoveryTypes: freeze(["recoverAll", "loseAll", "formula"]), // dnd5e uses.recovery type
  healingTypes: freeze(["healing", "temphp"]), // dnd5e healingTypes
  scalingModes: freeze(["whole", "half"]), // dnd5e damage scaling modes (none "" excluded)
  consumptionTypes: freeze(["activityUses", "itemUses", "material", "hitDice", "spellSlots", "attribute"]),
  // dnd5e itemProperties (weapon, spell and armor properties)
  itemProperties: freeze(["ada", "amm", "fin", "fir", "foc", "hvy", "lgt", "lod", "mgc", "rch", "rel", "ret", "sil", "spc",
    "thr", "two", "ver", "vocal", "somatic", "material", "concentration", "ritual", "stealthDisadvantage"]),
  attunement: freeze(["required", "optional"]), // dnd5e attunementTypes ("" excluded)
  expiry: freeze(["turnStart", "turnEnd"]), // ActiveEffect duration.expiry, the events dnd5e uses
  changeTypes: freeze(["add", "multiply", "override", "upgrade", "downgrade", "custom"]) // Foundry v13 change types
});

export const FIX_MAX_ITEMS = 12;

// A type is a plain, serializable description (the vocabulary file gives it to drafters as it is, enums resolved) and ONE
// interpreter, `typeProblem`, checks a value against it: the check and the vocabulary cannot drift apart.
//   { type: "number" }                  a finite number or a short formula (assert.mjs isFormula)
//   { type: "numeric" }                 a finite number
//   { type: "boolean" }
//   { type: "id" }                      a 16-character id
//   { type: "path" }                    a short dotted attribute path
//   { type: "int", min, max }
//   { type: "enum", enum: "<FIX_ENUMS name>" }
//   { type: "either", of: [type, ...] }
//   { type: "object", keys: { <required key>: type }, optional: { <key>: type } }   closed keys
//   { type: "list", item: type }        at most FIX_MAX_ITEMS items; `[]` is a list (the guard "it was empty")
const NUMBER = Object.freeze({ type: "number" });
const BOOL = Object.freeze({ type: "boolean" });
const ID = Object.freeze({ type: "id" });
const enumOf = (name) => Object.freeze({ type: "enum", enum: name });
const listOf = (item) => Object.freeze({ type: "list", item });
const object = (keys, optional = {}) => Object.freeze({ type: "object", keys, optional });
const either = (...of) => Object.freeze({ type: "either", of });
const PATH = Object.freeze({ type: "path" });
const ID_RE = /^[A-Za-z0-9]{16}$/;
const ATTRIBUTE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*$/;
// Own properties only: a key named like an inherited one (`constructor`, `toString`...) is never taken for a known key.
const has = (o, k) => Object.hasOwn(o, k);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
// A dotted attribute path (a change key, a consumption target): at most PATH_SEGMENTS segments of at most PATH_SEGMENT
// characters each (Ruling R19: an identifier is too short to carry a sentence).
export const PATH_SEGMENTS = 6;
export const PATH_SEGMENT = 24;
export const isShortPath = (v) => typeof v === "string" && v.length <= 64 && ATTRIBUTE.test(v)
  && v.split(".").length <= PATH_SEGMENTS && v.split(".").every((p) => p.length <= PATH_SEGMENT);

/** Why `value` does not have the type `t` (a description above), or null. */
export function typeProblem(t, value) {
  switch (t.type) {
    case "number": return (typeof value === "number" && Number.isFinite(value)) || isFormula(value) ? null
      : "a number or a short formula";
    case "numeric": return Number.isFinite(value) ? null : "a number";
    case "boolean": return typeof value === "boolean" ? null : "a boolean";
    case "id": return typeof value === "string" && ID_RE.test(value) ? null : "a 16-character id";
    case "path": return isShortPath(value) ? null
      : `a dotted attribute path (at most ${PATH_SEGMENTS} segments of at most ${PATH_SEGMENT} characters)`;
    case "int": return Number.isInteger(value) && value >= t.min && value <= t.max ? null
      : `an integer from ${t.min} to ${t.max}`;
    case "enum": return FIX_ENUMS[t.enum].includes(value) ? null : `one of ${FIX_ENUMS[t.enum].join(", ")}`;
    case "either": return t.of.some((x) => typeProblem(x, value) === null) ? null
      : t.of.map((x) => typeProblem(x, value)).join(" or ");
    case "object": {
      if (!isObject(value)) return "an object";
      for (const k of Object.keys(value)) if (!has(t.keys, k) && !has(t.optional, k)) return `no key ${k}`;
      for (const k of Object.keys(t.keys)) if (!has(value, k)) return `a key ${k}`;
      for (const [k, x] of Object.entries({ ...t.keys, ...t.optional })) {
        if (has(value, k)) {
          const problem = typeProblem(x, value[k]);
          if (problem) return `${k}: ${problem}`;
        }
      }
      return null;
    }
    case "list": {
      if (!Array.isArray(value)) return "a list";
      if (value.length > FIX_MAX_ITEMS) return `a list of at most ${FIX_MAX_ITEMS} items`;
      for (const [i, x] of value.entries()) {
        const problem = typeProblem(t.item, x);
        if (problem) return `[${i}]: ${problem}`;
      }
      return null;
    }
    default: throw new Error(`unknown fix type ${JSON.stringify(t.type)}`);
  }
}

/** A type description with its enums resolved to their words: what the vocabulary file holds (JSON, no functions). */
export function describeType(t) {
  switch (t.type) {
    case "enum": return { type: "enum", values: [...FIX_ENUMS[t.enum]] };
    case "either": return { type: "either", of: t.of.map(describeType) };
    case "list": return { type: "list", max: FIX_MAX_ITEMS, item: describeType(t.item) };
    case "object": return {
      type: "object",
      keys: Object.fromEntries(Object.entries(t.keys).map(([k, x]) => [k, describeType(x)])),
      optional: Object.fromEntries(Object.entries(t.optional).map(([k, x]) => [k, describeType(x)]))
    };
    case "int": return { type: "int", min: t.min, max: t.max };
    default: return { type: t.type };
  }
}

const DAMAGE_PART = object({}, { number: NUMBER, denomination: NUMBER, bonus: NUMBER, types: listOf(enumOf("damageTypes")),
  scaling: object({}, { mode: enumOf("scalingModes"), number: NUMBER }) });
const CONSUMPTION = object({ type: enumOf("consumptionTypes"), value: NUMBER },
  { target: either(ID, PATH), scaling: object({}, { mode: enumOf("scalingModes"), formula: NUMBER }) });
const RECOVERY = object({ period: enumOf("recoveryPeriods"), type: enumOf("recoveryTypes") }, { formula: NUMBER });
const EFFECT_REF = object({ _id: ID }, { onSave: BOOL, level: object({}, { min: NUMBER, max: NUMBER }) });
const CHANGE = object({ key: PATH, value: NUMBER },
  { type: enumOf("changeTypes"), mode: Object.freeze({ type: "int", min: 0, max: 5 }),
    priority: Object.freeze({ type: "numeric" }) });

const TARGET = {
  "target.template.type": enumOf("templateTypes"), "target.template.size": NUMBER,
  "target.template.units": enumOf("distanceUnits"), "target.template.count": NUMBER,
  "target.affects.type": enumOf("affectsTypes"), "target.affects.count": NUMBER, "target.affects.choice": BOOL
};
/** The type description of each allowed leaf (draft-keys.mjs FIX_PATHS is their list). */
export const FIX_TYPES = Object.freeze({
  activity: Object.freeze({
    "range.value": NUMBER, "range.units": enumOf("rangeUnits"), "range.long": NUMBER, ...TARGET,
    "duration.value": NUMBER, "duration.units": enumOf("timeUnits"), "duration.concentration": BOOL,
    "activation.type": enumOf("activationTypes"), "activation.value": NUMBER,
    "save.ability": listOf(enumOf("abilities")), "save.dc.calculation": enumOf("dcCalculations"), "save.dc.formula": NUMBER,
    "damage.onSave": enumOf("onSave"), "damage.parts": listOf(DAMAGE_PART), "damage.includeBase": BOOL,
    "healing.number": NUMBER, "healing.denomination": NUMBER, "healing.bonus": NUMBER,
    "healing.types": listOf(enumOf("healingTypes")),
    "consumption.targets": listOf(CONSUMPTION), "consumption.spellSlot": BOOL,
    "uses.max": NUMBER, "uses.recovery": listOf(RECOVERY), "effects": listOf(EFFECT_REF), "attack.bonus": NUMBER,
    "spell.challenge": object({}, { attack: NUMBER, save: NUMBER, override: BOOL })
  }),
  item: Object.freeze(Object.fromEntries([
    ["uses.max", NUMBER], ["uses.recovery", listOf(RECOVERY)], ["uses.autoDestroy", BOOL], ["duration.value", NUMBER],
    ["duration.units", enumOf("timeUnits")], ["range.value", NUMBER], ["range.units", enumOf("rangeUnits")],
    ...Object.entries(TARGET), ["properties", listOf(enumOf("itemProperties"))], ["attunement", enumOf("attunement")],
    ["damage.base.denomination", NUMBER]
  ].map(([leaf, type]) => [`system.${leaf}`, type]))),
  effect: Object.freeze({
    "duration.seconds": NUMBER, "duration.rounds": NUMBER, "duration.turns": NUMBER, "duration.value": NUMBER,
    "duration.units": enumOf("timeUnits"), "duration.expiry": enumOf("expiry"), "statuses": listOf(enumOf("statuses")),
    "system.changes": listOf(CHANGE), "changes": listOf(CHANGE), "transfer": BOOL, "disabled": BOOL
  })
});

/** The vocabulary's description of every allowed leaf: `{ activity|item|effect: { <path>: description } }`. */
export const describeFixTypes = () => Object.fromEntries(Object.entries(FIX_TYPES)
  .map(([where, leaves]) => [where, Object.fromEntries(Object.entries(leaves).map(([k, t]) => [k, describeType(t)]))]));

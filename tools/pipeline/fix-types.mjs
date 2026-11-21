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
const ID = /^[A-Za-z0-9]{16}$/;
const ATTRIBUTE = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)*$/;
// Own properties only: a key named like an inherited one (`constructor`, `toString`...) is never taken for a known key.
const has = (o, k) => Object.hasOwn(o, k);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// A type is a function of a value: null when the value has the type, else what it should have been.
const num = (v) => ((typeof v === "number" && Number.isFinite(v)) || isFormula(v) ? null : "a number or a short formula");
const bool = (v) => (typeof v === "boolean" ? null : "a boolean");
const oneOf = (name) => (v) => (FIX_ENUMS[name].includes(v) ? null : `one of ${FIX_ENUMS[name].join(", ")}`);
const id = (v) => (typeof v === "string" && ID.test(v) ? null : "a 16-character id");
// A dotted attribute path (a change key, a consumption target): at most PATH_SEGMENTS segments of at most PATH_SEGMENT
// characters each (Ruling R19: an identifier is too short to carry a sentence).
export const PATH_SEGMENTS = 6;
export const PATH_SEGMENT = 24;
export const isShortPath = (v) => typeof v === "string" && v.length <= 64 && ATTRIBUTE.test(v)
  && v.split(".").length <= PATH_SEGMENTS && v.split(".").every((p) => p.length <= PATH_SEGMENT);
const attribute = (v) => (isShortPath(v) ? null
  : `a dotted attribute path (at most ${PATH_SEGMENTS} segments of at most ${PATH_SEGMENT} characters)`);
const either = (...types) => (v) => (types.some((t) => t(v) === null) ? null : types.map((t) => t(v)).join(" or "));
const intIn = (lo, hi) => (v) => (Number.isInteger(v) && v >= lo && v <= hi ? null : `an integer from ${lo} to ${hi}`);

// An object whose keys are closed: `required` and `optional` map each key to its type.
const object = (required, optional = {}) => {
  const type = (v) => {
    if (!isObject(v)) return "an object";
    for (const k of Object.keys(v)) if (!has(required, k) && !has(optional, k)) return `no key ${k}`;
    for (const k of Object.keys(required)) if (!has(v, k)) return `a key ${k}`;
    for (const [k, t] of Object.entries({ ...required, ...optional })) {
      if (has(v, k)) {
        const problem = t(v[k]);
        if (problem) return `${k}: ${problem}`;
      }
    }
    return null;
  };
  return type;
};
// A list of at most FIX_MAX_ITEMS values of one type; `[]` is a list (the guard "was empty").
const listOf = (item) => {
  const type = (v) => {
    if (!Array.isArray(v)) return "a list";
    if (v.length > FIX_MAX_ITEMS) return `a list of at most ${FIX_MAX_ITEMS} items`;
    for (const [i, x] of v.entries()) {
      const problem = item(x);
      if (problem) return `[${i}]: ${problem}`;
    }
    return null;
  };
  type.list = true;
  return type;
};

const DAMAGE_PART = object({}, { number: num, denomination: num, bonus: num, types: listOf(oneOf("damageTypes")),
  scaling: object({}, { mode: oneOf("scalingModes"), number: num }) });
const CONSUMPTION = object({ type: oneOf("consumptionTypes"), value: num },
  { target: either(id, attribute), scaling: object({}, { mode: oneOf("scalingModes"), formula: num }) });
const RECOVERY = object({ period: oneOf("recoveryPeriods"), type: oneOf("recoveryTypes") }, { formula: num });
const EFFECT_REF = object({ _id: id }, { onSave: bool, level: object({}, { min: num, max: num }) });
const CHANGE = object({ key: attribute, value: num },
  { type: oneOf("changeTypes"), mode: intIn(0, 5), priority: (v) => (Number.isFinite(v) ? null : "a number") });

const TARGET = {
  "target.template.type": oneOf("templateTypes"), "target.template.size": num, "target.template.units": oneOf("distanceUnits"),
  "target.template.count": num, "target.affects.type": oneOf("affectsTypes"), "target.affects.count": num,
  "target.affects.choice": bool
};
/** The type of each allowed leaf (draft-keys.mjs FIX_PATHS is their list). */
export const FIX_TYPES = Object.freeze({
  activity: Object.freeze({
    "range.value": num, "range.units": oneOf("rangeUnits"), "range.long": num, ...TARGET,
    "duration.value": num, "duration.units": oneOf("timeUnits"), "duration.concentration": bool,
    "activation.type": oneOf("activationTypes"), "activation.value": num,
    "save.ability": listOf(oneOf("abilities")), "save.dc.calculation": oneOf("dcCalculations"), "save.dc.formula": num,
    "damage.onSave": oneOf("onSave"), "damage.parts": listOf(DAMAGE_PART), "damage.includeBase": bool,
    "healing.number": num, "healing.denomination": num, "healing.bonus": num, "healing.types": listOf(oneOf("healingTypes")),
    "consumption.targets": listOf(CONSUMPTION), "consumption.spellSlot": bool,
    "uses.max": num, "uses.recovery": listOf(RECOVERY), "effects": listOf(EFFECT_REF), "attack.bonus": num,
    "spell.challenge": object({}, { attack: num, save: num, override: bool })
  }),
  item: Object.freeze(Object.fromEntries([
    ["uses.max", num], ["uses.recovery", listOf(RECOVERY)], ["uses.autoDestroy", bool], ["duration.value", num],
    ["duration.units", oneOf("timeUnits")], ["range.value", num], ["range.units", oneOf("rangeUnits")],
    ...Object.entries(TARGET), ["properties", listOf(oneOf("itemProperties"))], ["attunement", oneOf("attunement")],
    ["damage.base.denomination", num]
  ].map(([leaf, type]) => [`system.${leaf}`, type]))),
  effect: Object.freeze({
    "duration.seconds": num, "duration.rounds": num, "duration.turns": num, "duration.value": num,
    "duration.units": oneOf("timeUnits"), "duration.expiry": oneOf("expiry"), "statuses": listOf(oneOf("statuses")),
    "system.changes": listOf(CHANGE), "changes": listOf(CHANGE), "transfer": bool, "disabled": bool
  })
});

/** Why `value` does not have the type of the leaf, or null. `type` is one of FIX_TYPES' values. */
export const typeProblem = (type, value) => type(value);

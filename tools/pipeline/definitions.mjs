// What each word of the closed lists an agent chooses from means, in our own words: written into draft-vocabulary.json and
// review-vocabulary.json (`definitions`), so that a drafter and a reviewer read a word the same way (pilot 3: two drafters and a
// reviewer read the turn-end words differently). Every definition says where its meaning was taken from (`from`, one of
// DEFINITION_SOURCES); a word whose meaning neither the engine nor this pack establishes is "unverified", never guessed.
// tests/pipeline/definitions.test.mjs fails when a word of these lists has no definition: the engine's lists through loadCore,
// and a committed copy of them.
import { AFFECTS, FRACTIONS, ROLLS, ROLL_FOR, ROLL_MODES, ROLL_ON } from "./assert.mjs";
import { LEAVE_REASONS } from "./leaves.mjs";

/** Where a meaning comes from: a file of the DAS · Core clone (`module/scripts/...`), or this pack's own vocabulary. */
export const DEFINITION_SOURCES = Object.freeze([
  "engine core/effect-ends.mjs", "engine core/triggers.mjs", "engine core/content.mjs", "engine core/content/enums.mjs",
  "engine runtime/engine-commands.mjs", "pack tools/pipeline/assert.mjs", "pack tools/pipeline/leaves.mjs"
]);

const def = (means, from) => Object.freeze({ means, from });
const ENDS_FROM = "engine core/effect-ends.mjs";
const MOMENT_FROM = "engine core/triggers.mjs";
const PACK_FROM = "pack tools/pipeline/assert.mjs";
const LEAVES_FROM = "pack tools/pipeline/leaves.mjs";

// "The user": the creature that used the item (the engine's caster or origin). "The bearer": the creature that carries the
// effect. "The creature" in a moment: the creature the declaration belongs to (the item's user, or the bearer when an effect
// carries the declaration).
const DEFINED = {
  // EFFECT_ENDS, `expect.ends` (core/effect-ends.mjs effectEndsNow: a turn-end word never fires on the turn of placement).
  ends: {
    casterTurnStart: def("The effect ends when the turn of the user (the creature that used the item) begins.", ENDS_FROM),
    bearerTurnStart: def("The effect ends when the turn of the bearer (the creature that carries the effect) begins.",
      ENDS_FROM),
    casterTurnEnd: def("The effect ends at the end of a turn of the user, never the turn it was placed in: placed during the"
      + " user's own turn, it lasts until the end of the user's next turn.", ENDS_FROM),
    bearerTurnEnd: def("The effect ends at the end of a turn of the bearer, never the turn it was placed in: placed during the"
      + " bearer's own turn, it lasts until the end of the bearer's next turn.", ENDS_FROM),
    currentTurnEnd: def("The effect ends at the end of the turn during which it was placed, whoever's turn that is.", ENDS_FROM)
  },
  // `given.roll` (assert.mjs ROLLS): hit, failedSave and savedSave are the engine's outcome moments (core/triggers.mjs).
  roll: {
    hit: def("The item's attack roll hits the target (a critical hit is a hit too).", MOMENT_FROM),
    crit: def("The item's attack roll is a critical hit: only for what happens on a critical hit alone; what holds on every"
      + " hit is said with hit.", PACK_FROM),
    miss: def("The item's attack roll misses the target.", "engine core/content.mjs"),
    failedSave: def("The target fails the saving throw the item's activity calls for.", MOMENT_FROM),
    savedSave: def("The target succeeds on the saving throw the item's activity calls for.", MOMENT_FROM)
  },
  // `given.moment`, and `expect.ends` when it names a moment (the effect then ends when the moment happens):
  // core/triggers.mjs MOMENTS, each described there.
  moment: {
    isHit: def("An attack has just hit the creature.", MOMENT_FROM),
    isDamaged: def("The creature has just taken damage.", MOMENT_FROM),
    leavesReach: def("A hostile creature moves out of the creature's reach.", MOMENT_FROM),
    enemyDisengages: def("A hostile creature has just taken the Disengage action.", MOMENT_FROM),
    enter: def("A creature enters the area, or the area moves onto it.", MOMENT_FROM),
    turnStart: def("A creature starts its turn inside the area.", MOMENT_FROM),
    turnEnd: def("A creature ends its turn inside the area.", MOMENT_FROM),
    moves: def("A creature moves inside the area, once per square travelled (not when the area is placed).", MOMENT_FROM),
    preDamageRoll: def("The creature is about to roll the damage of an activity.", MOMENT_FROM),
    hit: def("An attack of the item has just hit the target.", MOMENT_FROM),
    failedSave: def("The target has just failed the item's saving throw.", MOMENT_FROM),
    savedSave: def("The target has just succeeded on the item's saving throw.", MOMENT_FROM),
    startOfTurn: def("The creature starts its turn (no area involved).", MOMENT_FROM),
    endOfTurn: def("The creature ends its turn (no area involved).", MOMENT_FROM),
    originTurnStart: def("The creature that placed the effect starts its turn.", MOMENT_FROM),
    preAttackRoll: def("The creature is about to make an attack roll against the target.", MOMENT_FROM),
    castsSpell: def("A hostile creature within range and in sight casts a spell.", MOMENT_FROM),
    isMissed: def("An attack has just missed the creature.", MOMENT_FROM),
    enemyTurnEnd: def("A hostile creature ends its turn.", MOMENT_FROM),
    isTargeted: def("A hostile creature is about to use an activity without attack roll that targets the creature.",
      MOMENT_FROM),
    isAttacked: def("A creature is about to make an attack roll against the creature.", MOMENT_FROM),
    enemyAttacks: def("A hostile creature is about to make an attack roll.", MOMENT_FROM),
    allyAttacks: def("An allied creature is about to make an attack roll against an enemy.", MOMENT_FROM),
    gainsCondition: def("The creature has just gained a condition.", MOMENT_FROM),
    allyIsHit: def("Another creature has just been hit by an attack.", MOMENT_FROM),
    allyIsDamaged: def("Another creature is about to take damage.", MOMENT_FROM),
    enemyAttacked: def("A hostile creature has just made an attack roll against anyone, hit or miss.", MOMENT_FROM),
    falls: def("The creature is about to take falling damage.", MOMENT_FROM),
    allyFalls: def("Another creature is about to take falling damage.", MOMENT_FROM),
    savesAgainst: def("The creature has just succeeded on a saving throw against a hostile creature's activity.",
      MOMENT_FROM),
    inArea: def("The creature, caught in another creature's area activity, is about to take its damage.", MOMENT_FROM)
  },
  // `expect.move.mode` (core/content/enums.mjs MOVE_MODES; runtime/engine-commands.mjs: push moves away from the source, pull
  // toward it, random in a direction rolled on a die, as a displacement that provokes no opportunity attack).
  moveMode: {
    push: def("The target is moved straight away from the creature that used the item.", "engine runtime/engine-commands.mjs"),
    pull: def("The target is moved straight toward the creature that used the item (or toward the area or the summoned"
      + " creature the step names).", "engine runtime/engine-commands.mjs"),
    random: def("The target moves in a direction rolled on a die among the allowed directions, without provoking"
      + " opportunity attacks.", "engine runtime/engine-commands.mjs")
  },
  // `expect.affects` (assert.mjs AFFECTS: who the assertion is about). Allies and enemies as the engine relates creatures to
  // the source of an aura (core/content/enums.mjs AURA_AFFECTS: ally, enemy of the creature whose item it is).
  affects: {
    target: def("The creature or creatures the item's activity targets.", PACK_FROM),
    allies: def("The allies of the creature that used the item.", "engine core/content/enums.mjs"),
    enemies: def("The enemies (hostile creatures) of the creature that used the item.", "engine core/content/enums.mjs"),
    self: def("The creature that used the item itself.", PACK_FROM)
  },
  // `expect.excludes` (assert.mjs: who an assertion leaves out, the words of `affects`). What "left out" covers beside a
  // moment is defined nowhere: the pilot's drafter and reviewer each used it for something else (no opportunity attack by
  // enemies, none against the user), so its words stay unverified until the vocabulary has a word for that meaning.
  excludes: { target: "unverified", allies: "unverified", enemies: "unverified", self: "unverified" },
  // `expect.roll` (assert.mjs ROLL_MODES, ROLL_ON, ROLL_FOR).
  rollMode: {
    advantage: def("The roll is made with advantage.", PACK_FROM),
    disadvantage: def("The roll is made with disadvantage.", PACK_FROM)
  },
  rollOn: {
    attack: def("An attack roll.", PACK_FROM),
    save: def("A saving throw.", PACK_FROM),
    check: def("An ability check (skills and initiative included).", "engine core/content/enums.mjs")
  },
  rollFor: {
    self: def("The roll the creature that used the item makes.", PACK_FROM),
    target: def("The roll the item's target makes.", PACK_FROM),
    ally: def("A roll an ally of the creature that used the item makes.", PACK_FROM),
    enemy: def("A roll an enemy of the creature that used the item makes.", PACK_FROM)
  },
  // `expect.damage.fraction` (assert.mjs FRACTIONS), of the damage the activity rolls.
  fraction: {
    0: def("No damage: the activity's damage is not dealt in that situation.", PACK_FROM),
    0.5: def("Half the rolled damage.", PACK_FROM),
    1: def("The rolled damage in full.", PACK_FROM),
    2: def("Twice the rolled damage.", PACK_FROM)
  },
  // `rule.leaves[].because` and `.unexpressed` (Ruling R25, leaves.mjs LEAVE_REASONS): why a partial rule leaves an
  // expectation of its entry to the table. The drafter's only: a reviewer never sees what a draft leaves out.
  leavesBecause: {
    "no-key": def("No key a drafter may write expresses it (nor anything the entry implies).", LEAVES_FROM),
    "target-size": def("It holds only for targets of some sizes, and no allowed key limits targets by size.", LEAVES_FROM),
    "target-state": def("It holds only for targets in some state (grappled, cursed, engulfed by the user), which no allowed key"
      + " tests.", LEAVES_FROM),
    "immunity-after-save": def("A temporary immunity to the effect once the target saves or the effect ends.", LEAVES_FROM),
    "healing-block": def("The target cannot regain hit points while the effect lasts.", LEAVES_FROM),
    "out-of-combat": def("It acts outside combat: long durations, travel, exploration or social play.", LEAVES_FROM),
    "table-ruling": def("The table decides when it happens or what it covers (a trigger no moment names, a choice).",
      LEAVES_FROM)
  }
};

const deepFreeze = (o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.freeze({ ...v })])));
/** The definitions, by list (`ends`, `roll`, `moment`, `moveMode`, `affects`, `excludes`, `rollMode`, `rollOn`, `rollFor`,
 * `fraction`), each word to `{ means, from }` or "unverified". */
export const DEFINITIONS = deepFreeze(DEFINED);

/**
 * For each EFFECT_ENDS word, an invented sentence pattern and the word it takes when the effect is placed during the user's
 * own turn (`ownTurn`) and when it is placed as a reaction during another creature's turn (`reaction`; for the bearer
 * words, the bearer's own turn). Read with core/effect-ends.mjs: a turn-end word never ends the turn it was placed in.
 */
export const ENDS_EXAMPLES = Object.freeze([
  { word: "casterTurnStart", pattern: "until the start of the user's next turn", ownTurn: "casterTurnStart",
    reaction: "casterTurnStart" },
  { word: "casterTurnEnd", pattern: "until the end of the user's next turn", ownTurn: "casterTurnEnd",
    reaction: "casterTurnEnd" },
  { word: "bearerTurnStart", pattern: "until the start of the target's next turn", ownTurn: "bearerTurnStart",
    reaction: "bearerTurnStart" },
  { word: "bearerTurnEnd", pattern: "until the end of the target's next turn", ownTurn: "bearerTurnEnd",
    reaction: "bearerTurnEnd" },
  // "Until the end of your turn" said on the user's own turn, or "until the end of its turn" said of a target whose turn it
  // is (a reaction to its turn starting): the turn in progress, never casterTurnEnd or bearerTurnEnd, which would wait for the
  // next one.
  { word: "currentTurnEnd", pattern: "until the end of the turn in progress", ownTurn: "currentTurnEnd",
    reaction: "currentTurnEnd" }
].map((e) => Object.freeze(e)));

/**
 * The definitions as the vocabulary files hold them (plain JSON). `review`: the reviewer's file, without `leavesBecause`
 * (Ruling R25: a reviewer is blind to what a draft leaves out, and never writes `leaves`).
 */
export function definitionsFor({ review = false } = {}) {
  const out = JSON.parse(JSON.stringify(DEFINITIONS));
  if (review) delete out.leavesBecause;
  return out;
}

// The engine's list each map covers (loadCore names), and the pack's own.
const ENGINE_LISTS = Object.freeze({ ends: "effectEnds", moment: "moments", moveMode: "moveModes" });
const PACK_LISTS = Object.freeze({ roll: ROLLS, affects: AFFECTS, excludes: AFFECTS, rollMode: ROLL_MODES, rollOn: ROLL_ON,
  rollFor: ROLL_FOR, fraction: FRACTIONS, leavesBecause: LEAVE_REASONS });

/**
 * The words with no definition, as `<list>.<word>` (own properties only): of the engine's lists given in `core` (loadCore:
 * effectEnds, moments, moveModes) and of the pack's own lists. [] when every word is defined.
 */
export function undefinedWords(core = {}) {
  const out = [];
  for (const [list, name] of Object.entries(ENGINE_LISTS)) {
    for (const w of core?.[name] ?? []) if (!Object.hasOwn(DEFINITIONS[list], String(w))) out.push(`${list}.${w}`);
  }
  for (const [list, words] of Object.entries(PACK_LISTS)) {
    for (const w of words) if (!Object.hasOwn(DEFINITIONS[list], String(w))) out.push(`${list}.${w}`);
  }
  return out;
}

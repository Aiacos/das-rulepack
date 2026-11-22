// What each word of the closed lists an agent chooses from means, in our own words: written into draft-vocabulary.json and
// review-vocabulary.json (`definitions`), so that a drafter and a reviewer read a word the same way (pilot 3: two drafters and a
// reviewer read the turn-end words differently). Every definition says where its meaning was taken from (`from`, one of
// DEFINITION_SOURCES); a word whose meaning neither the engine nor this pack establishes is "unverified", never guessed.
// tests/pipeline/definitions.test.mjs fails when a word of these lists has no definition: the engine's lists through loadCore,
// and a committed copy of them.
import {
  ACTIVITY_GIVENS, AFFECTS, BARS, CHOOSES, DENIES, FRACTIONS, GIVEN_FIELDS, ROLLS, ROLL_FOR, ROLL_MODES, ROLL_ON, SUBJECTED,
  TARGET_HP
} from "./assert.mjs";
import { AURA_MOMENTS } from "./zones.mjs";
import { LEAVE_REASONS } from "./leaves.mjs";
import { DRAFT_FACTS } from "./conditions.mjs";

/** Where a meaning comes from: a file of the DAS · Core clone (`module/scripts/...`), or this pack's own vocabulary. */
export const DEFINITION_SOURCES = Object.freeze([
  "engine core/effect-ends.mjs", "engine core/triggers.mjs", "engine core/content.mjs", "engine core/content/enums.mjs",
  "engine runtime/engine-commands.mjs", "pack tools/pipeline/assert.mjs", "pack tools/pipeline/leaves.mjs",
  "engine adapter/facts.mjs", "pack tools/pipeline/conditions.mjs",
  // Ruling R33: zones and auras.
  "engine core/emanation.mjs", "engine core/area.mjs", "engine core/action.mjs",
  // Ruling R34: choices, barriers and wards.
  "engine adapter/usage.mjs", "engine adapter/barriers.mjs", "engine adapter/eligibility.mjs", "engine runtime/cantrips.mjs"
]);

const def = (means, from) => Object.freeze({ means, from });
const ENDS_FROM = "engine core/effect-ends.mjs";
const MOMENT_FROM = "engine core/triggers.mjs";
const PACK_FROM = "pack tools/pipeline/assert.mjs";
const LEAVES_FROM = "pack tools/pipeline/leaves.mjs";
const FACTS_FROM = "engine adapter/facts.mjs";
const CONDITIONS_FROM = "pack tools/pipeline/conditions.mjs";

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
    turnStart: def("A creature starts its own turn inside the area (or inside an aura: each creature, on its own turn).",
      MOMENT_FROM),
    turnEnd: def("A creature ends its own turn inside the area (each creature, on its own turn; not the aura's bearer's turn).",
      MOMENT_FROM),
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
  // `given.moment` beside the engine's MOMENTS (Ruling R33, zones.mjs AURA_MOMENTS): the moments of an aura that acts
  // (core/emanation.mjs EMANATION_MOMENTS; runtime/emanations.mjs: one use on every creature reached, at the bearer's turn).
  auraMoment: {
    ownTurnStart: def("The aura's bearer (the creature that carries the item) starts its turn: every creature within the aura"
      + " at that moment is subjected, once, on the bearer's turn.", "engine core/emanation.mjs"),
    ownTurnEnd: def("The aura's bearer (the creature that carries the item) ends its turn: every creature within the aura at"
      + " that moment is subjected, once, on the bearer's turn (not each on its own turn: that is turnEnd).",
    "engine core/emanation.mjs")
  },
  // `expect.subjected` (Ruling R33, assert.mjs SUBJECTED), with a zone or aura moment in `given.moment`.
  subjected: {
    activity: def("The item's activity is used on the creature at that moment: its saving throw, damage and effects as the"
      + " item's data gives them (core/area.mjs: a zone replays it, at most once per creature and turn).",
    "engine core/area.mjs")
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
  // `expect.denies` (fix round 1 of Ruling R25; assert.mjs DENIES): what a creature is denied, each word the meaning of the
  // engine key that does it (core/content.mjs noOpportunity, noReactions, actionOrBonus). How long: the `ends` of the effect.
  // (`expect.excludes` is no longer an agent's word: no engine notion maps to it, and pilot 3 used it two ways.)
  denies: {
    opportunityAttacks: def("The movement of the creature that used the item provokes no opportunity attacks.",
      "engine core/content.mjs"),
    reactions: def("The creature that bears the item's effect cannot take reactions while the effect lasts.",
      "engine core/content.mjs"),
    actionAndBonus: def("The creature that bears the item's effect takes an action or a bonus action on its turn, not both.",
      "engine core/content.mjs"),
    // Ruling R34: runtime/cantrips.mjs onPreApplyDamage (blocksHealing, blocksTempHp).
    healing: def("The creature that bears the item's effect regains no hit points while the effect lasts.",
      "engine runtime/cantrips.mjs"),
    tempHp: def("The creature that bears the item's effect gains no temporary hit points while the effect lasts.",
      "engine runtime/cantrips.mjs")
  },
  // `expect.chooses` (Ruling R34, assert.mjs CHOOSES; the engine's `choice`): said once for the use, with no roll or moment.
  chooses: {
    oneEffect: def("At the use, its user picks one of the activity's effects; only that one is applied, to every target.",
      "engine adapter/usage.mjs"),
    oneEffectPerTarget: def("Once the saves are made, the user picks one of the activity's effects for each target that"
      + " failed its save (each affected target when there is no save); only that one is applied to it.",
    "engine core/action.mjs"),
    effectByRoll: def("A die picks one of the activity's effects, one face per effect; only that one is applied.",
      "engine adapter/usage.mjs")
  },
  // `expect.bars` (Ruling R34, assert.mjs BARS; the engine's `barrier` and `globe`): an emanation around the creature that
  // bears the item's effect, moving with it. Said once for the use, with no roll or moment.
  bars: {
    entry: def("A creature outside the emanation cannot walk into it (a teleport or a forced move is not stopped).",
      "engine adapter/barriers.mjs"),
    melee: def("A creature outside the emanation cannot hit a creature inside with a melee attack, unless its weapon has"
      + " reach.", "engine adapter/barriers.mjs"),
    actions: def("Nothing a creature outside the emanation does affects a creature inside it.", "engine adapter/barriers.mjs"),
    spells: def("A spell cast from outside the emanation affects no creature inside it (of the level given.spellLevelAtMost"
      + " or lower).", "engine adapter/eligibility.mjs")
  },
  // `expect.roll` (assert.mjs ROLL_MODES, ROLL_ON, ROLL_FOR).
  rollMode: {
    advantage: def("The roll is made with advantage.", PACK_FROM),
    disadvantage: def("The roll is made with disadvantage.", PACK_FROM),
    // Ruling R33: core/action.mjs creatureAutoSuccess, runtime/engine.mjs openingFor (saveAutoSuccess).
    autoSuccess: def("The roll is not made: it succeeds automatically (the item's saving throw, for the creatures named).",
      "engine core/action.mjs")
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
  // The fields of an assertion's `given` (assert.mjs GIVEN_FIELDS): the situation in which the expectation holds. Ruling R30:
  // the fields from targetSizeAtMost on say a trigger's condition, each the meaning of the engine fact it mirrors
  // (adapter/facts.mjs factsFor; conditions.mjs DRAFT_FACTS names which).
  given: {
    roll: def("The outcome of the item's own roll on which the expectation holds (see the roll words).", PACK_FROM),
    moment: def("The moment of the engine at which the expectation holds (see the moment words, and the aura moment words).",
      MOMENT_FROM),
    origin: def("The origin of the item the expectation is about, one of the rule's origins.", PACK_FROM),
    targetType: def("Only when the target is of this creature type (fact target.creatureType).", FACTS_FROM),
    free: def("One line for a person: it never counts as agreement and nothing checks it.", PACK_FROM),
    targetSizeAtMost: def("Only when the target is this size or smaller, sizes ranked tiny, sm, med, lg, huge, grg (fact"
      + " target.sizeAtMost).", FACTS_FROM),
    targetStatus: def("Only when the target already has this condition as the trigger fires (fact target.hasStatus).",
      FACTS_FROM),
    selfStatus: def("Only when the creature that used the item has this condition as the trigger fires (fact"
      + " source.hasStatus).", FACTS_FROM),
    targetWithin: def("Only when the target is within this many feet of the creature that used the item (fact"
      + " target.within).", FACTS_FROM),
    targetHp: def("Only when the target is bloodied or wounded, as the word says (facts target.bloodied, target.wounded).",
      FACTS_FROM),
    targetHpAtMost: def("Only when the target has this many hit points or fewer (fact target.hpAtMost).", FACTS_FROM),
    onOwnTurn: def("Only during a turn of the creature that used the item, in a started combat (fact source.onOwnTurn).",
      FACTS_FROM),
    damageType: def("Only when the damage just taken includes this type (fact damage.hasType; a list of types in the"
      + " condition is one assertion per type).", FACTS_FROM),
    activity: def("Only when the activity that sets off the trigger is of this kind (see the activity words).", FACTS_FROM),
    // Ruling R34: only with `expect.bars: spells` (a globe's maxLevel).
    spellLevelAtMost: def("Only for a spell of this level or lower, 0 (a cantrip) to 9: what a globe keeps out.",
      "engine adapter/eligibility.mjs")
  },
  // `given.targetSizeAtMost` (core/recipes.mjs FACT_ARG_OPTIONS.size; adapter/facts.mjs compares the rank of dnd5e's size).
  size: {
    tiny: def("A Tiny creature: the smallest size.", FACTS_FROM),
    sm: def("A Small creature, or a Tiny one when the size is a limit.", FACTS_FROM),
    med: def("A Medium creature, or a smaller one when the size is a limit.", FACTS_FROM),
    lg: def("A Large creature, or a smaller one when the size is a limit.", FACTS_FROM),
    huge: def("A Huge creature, or a smaller one when the size is a limit.", FACTS_FROM),
    grg: def("A Gargantuan creature: the largest size, so as a limit it holds for every creature.", FACTS_FROM)
  },
  // `given.targetHp` (assert.mjs TARGET_HP; adapter/facts.mjs isBloodied, isWounded against the effective maximum).
  targetHp: {
    bloodied: def("The target has more than 0 and at most half its hit point maximum (fact target.bloodied).", FACTS_FROM),
    wounded: def("The target has fewer hit points than its maximum (fact target.wounded).", FACTS_FROM)
  },
  // `given.activity` (assert.mjs ACTIVITY_GIVENS): the facts activity.isAttack, isMelee, isWeapon, isSpell.
  activity: {
    attack: def("The activity makes an attack roll (fact activity.isAttack), melee or ranged.", FACTS_FROM),
    melee: def("A melee attack: an attack activity of melee type, not made in a thrown or ranged mode (fact"
      + " activity.isMelee).", FACTS_FROM),
    weapon: def("The activity belongs to a weapon item (fact activity.isWeapon), whatever kind of activity.", FACTS_FROM),
    spell: def("The activity casts a spell, from a spell or a scroll (fact activity.isSpell).", FACTS_FROM)
  },
  // The facts a drafter may put in a trigger's `if` (Ruling R30, conditions.mjs DRAFT_FACTS): what each holds for, and its
  // argument. The drafter's only: a reviewer writes no entry.
  fact: {
    "target.sizeAtMost": def("The target is this size or smaller; argument: a size word (not the user's own size).",
      CONDITIONS_FROM),
    "target.creatureType": def("The target is of this creature type; argument: a creature type word.", CONDITIONS_FROM),
    "target.hasStatus": def("The target has this condition; argument: a status word.", CONDITIONS_FROM),
    "source.hasStatus": def("The creature that used the item has this condition; argument: a status word.",
      CONDITIONS_FROM),
    "target.within": def("The target is within a distance of the user; argument: { distance: feet 5 to 300, units: ft }.",
      CONDITIONS_FROM),
    "target.bloodied": def("The target is bloodied; argument: true.", CONDITIONS_FROM),
    "target.wounded": def("The target is below its hit point maximum; argument: true.", CONDITIONS_FROM),
    "target.hpAtMost": def("The target has at most this many hit points; argument: an integer from 1 to 999.",
      CONDITIONS_FROM),
    "source.onOwnTurn": def("It is a turn of the creature that used the item; argument: true.", CONDITIONS_FROM),
    "damage.hasType": def("The damage just taken includes one of these types; argument: a list of 1 to 5 damage types.",
      CONDITIONS_FROM),
    "activity.isAttack": def("The triggering activity makes an attack roll; argument: true.", CONDITIONS_FROM),
    "activity.isMelee": def("The triggering activity is a melee attack; argument: true.", CONDITIONS_FROM),
    "activity.isWeapon": def("The triggering activity belongs to a weapon; argument: true.", CONDITIONS_FROM),
    "activity.isSpell": def("The triggering activity casts a spell; argument: true.", CONDITIONS_FROM)
  },
  // `rule.leaves[].because` and `.unexpressed` (Ruling R25, leaves.mjs LEAVE_REASONS): why a partial rule leaves an
  // expectation of its entry to the table; and a reread's `unexpressed` (reread.mjs): what is missing from both the item's
  // data and the engine's reading that no assertion can state. The drafter's and the rereader's: a reviewer never sees what a
  // draft leaves out.
  leavesBecause: {
    "no-key": def("No key a drafter may write, and no assertion, expresses it (nor anything the entry implies).", LEAVES_FROM),
    "target-size": def("A size limit the vocabulary still cannot say: relative to the user's size, or not on a trigger"
      + " (a size limit on a trigger is the condition target.sizeAtMost, given targetSizeAtMost).", LEAVES_FROM),
    "target-state": def("A target state still not sayable: engulfed or grappled by the user, cursed, marked (a condition or"
      + " bloodied is a trigger's condition: targetStatus, targetHp).", LEAVES_FROM),
    "immunity-after-save": def("A temporary immunity to the effect once the target saves or the effect ends.", LEAVES_FROM),
    "healing-block": def("The target cannot regain hit points while the effect lasts.", LEAVES_FROM),
    "out-of-combat": def("It acts outside combat: long durations, travel, exploration or social play.", LEAVES_FROM),
    "table-ruling": def("The table decides when it happens or what it covers (a trigger no moment names).", LEAVES_FROM),
    "max-hp-reduction": def("The target's hit point maximum goes down by an amount, until a rest or a cure restores it.",
      LEAVES_FROM),
    "ongoing-effect": def("A state kept from turn to turn (damage each turn, a tally, a growing effect) that no ending or"
      + " moment states.", LEAVES_FROM),
    "use-time-choice": def("The user chooses at use time between options (which effect, which target, where it lands).",
      LEAVES_FROM),
    "death-trigger": def("It happens when a creature dies or drops to 0 hit points, which no moment names.", LEAVES_FROM),
    "form-change": def("The creature changes form or shape (a polymorph, a split, a transformation into another creature).",
      LEAVES_FROM),
    "use-limit": def("A limit on how often it is used (once per round, not again before the user's next turn) no uses says.",
      LEAVES_FROM),
    "trigger-filter": def("A trigger filter no fact of the condition says still (while a weapon is held, a ranged attack only,"
      + " a weapon property); melee, attack, weapon, spell or a damage type is the condition.", LEAVES_FROM),
    "save-margin": def("The result depends on how much the saving throw fails by (fails by 5 or more, for instance).",
      LEAVES_FROM),
    "follow-up-action": def("It lets or makes the creature take a further attack or action right after (a chained strike).",
      LEAVES_FROM),
    "self-healing": def("The user regains hit points from what it deals or drains, which no assertion states.", LEAVES_FROM)
  }
};

const deepFreeze = (o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.freeze({ ...v })])));
/** The definitions, by list (`ends`, `roll`, `moment`, `auraMoment`, `subjected`, `chooses`, `bars`, `moveMode`, `affects`,
 * `denies`, `rollMode`, `rollOn`, `rollFor`, `fraction`, `given`, `size`, `targetHp`, `activity`, `fact`, `leavesBecause`),
 * each word to `{ means, from }` or "unverified". */
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
 * (Ruling R25: a reviewer is blind to what a draft leaves out, and never writes `leaves`) and without `fact` (Ruling R30:
 * the facts of a trigger's condition are an entry's; a reviewer says the condition in `given`).
 */
export function definitionsFor({ review = false } = {}) {
  const out = JSON.parse(JSON.stringify(DEFINITIONS));
  if (review) { delete out.leavesBecause; delete out.fact; }
  return out;
}

// The engine's list each map covers (loadCore names), and the pack's own.
const ENGINE_LISTS = Object.freeze({ ends: "effectEnds", moment: "moments", moveMode: "moveModes", size: "sizes" });
const PACK_LISTS = Object.freeze({ roll: ROLLS, affects: AFFECTS, denies: DENIES, rollMode: ROLL_MODES, rollOn: ROLL_ON,
  rollFor: ROLL_FOR, fraction: FRACTIONS, leavesBecause: LEAVE_REASONS, given: GIVEN_FIELDS, targetHp: TARGET_HP,
  activity: ACTIVITY_GIVENS, fact: Object.keys(DRAFT_FACTS), auraMoment: AURA_MOMENTS, subjected: SUBJECTED, chooses: CHOOSES,
  bars: BARS });

/**
 * The words with no definition, as `<list>.<word>` (own properties only): of the engine's lists given in `core` (loadCore:
 * effectEnds, moments, moveModes, sizes) and of the pack's own lists. [] when every word is defined.
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

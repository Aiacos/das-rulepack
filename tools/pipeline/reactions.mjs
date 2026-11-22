// Ruling R38: the reactions, teleports and light a drafter may write, and what the engine also takes and a drafter may not.
//
// Read in the DAS_CORE clone for this ruling (validators: core/content/steps.mjs validateStep and validateTrigger,
// core/content/entry.mjs, core/content/annex.mjs validateTeleport and validateLight; meaning: the runtime and adapter code
// named in each `from`, and the engine's shipped entries: content/triggers.mjs `parry`, content/monsters.mjs `reactive`):
//   - a REACTION is a `triggers` declaration at the moment an attack hits (`isHit`) or misses (`isMissed`) the creature that
//     carries the item. A `use` step offers the item's reaction activity (or the one it names) to that creature; taken, it
//     costs its reaction (adapter/reactions.mjs reactionOptions, runtime/reactions.mjs). With it, `penalty` raises the
//     creature's AC by the formula against that attack alone and the hit is judged again (it may become a miss); `miss`
//     makes that attack miss. At `isMissed`, `use` with `target: "source"` and `weapon: true` is an attack with one of the
//     creature's melee weapons against the attacker (Riposte, §88). Without `use`, a `damage` step `to: "source"` naming an
//     activity of the item deals that activity's damage to the attacker that hit (no reaction: Corrosive Form);
//   - `reactions.perRound`: the creature has that many reactions a round, never more than one in a single turn
//     (core/turn.mjs freshBudget `perTurnReaction`; adapter/turn.mjs reactionsPerRound). The engine writes "a reaction on
//     every turn" as 20 (content/monsters.mjs `reactive`);
//   - `teleport`: the use of the item (of `activity` when named) teleports its user to a space it picks within `distance`
//     (else the activity's range), one it can see (runtime/teleport.mjs); `after: "attack"`, once the activity's attack is
//     judged, hit or miss; `then`, an activity of the item used on arrival. `swapPlaces`: the activity's user and its target,
//     within 5 ft, swap places, the target by a teleport (runtime/maneuver-dice.mjs);
//   - `light` with `on: "effect"`: each effect of the item makes the creature that bears it shed light, `bright` and `dim`
//     radii in feet as Foundry counts them (`dim` is the outer radius of the dim light), removed with the effect
//     (adapter/lights.mjs addEffectLight).
//
// Everything here is a closed word, a bounded number or an id of the item's own activities and effects: no identifier of
// another document, no label, no free string, no free formula (an AC bonus is the proficiency bonus or an integer). A field
// of an admitted key or step left out is in EXCLUDED_REACTION with why, and a test fails on an engine field in neither the
// drafter's shape nor that table; a key or step type of the territory not admitted is named with why. Nothing here imports
// another module: assert.mjs, draft-keys.mjs, batch.mjs and core.mjs read it.

/** The moments of a reaction a drafter may write (core/triggers.mjs MOMENTS; a test pins them to the clone). */
export const REACTION_MOMENTS = Object.freeze(["isHit", "isMissed"]);
/** The formulas of a `penalty` step a drafter may write: the proficiency bonus, or a number from 1 to 10. */
export const PENALTY_FORMULAS = Object.freeze(["@prof", ...Array.from({ length: 10 }, (_, i) => String(i + 1))]);
/** What `expect.acBonus` says: the word for the proficiency bonus, or an integer of that range. */
export const AC_BONUS = Object.freeze({ min: 1, max: 10, word: "proficiency" });
/** How many reactions a round `reactions.perRound` may give (1 is every creature's already; 20 is "on every turn"). */
export const PER_ROUND = Object.freeze({ min: 2, max: 20 });
/**
 * The facts a reaction's `if` may name. At `isHit` and `isMissed` the engine's `target` is the creature that reacts and its
 * `source` the attacker (core/triggers.mjs MOMENTS), the reverse of an outcome moment: only the facts of the attack itself
 * read the same, so only they are offered (a `targetType` would say the reactor's type).
 */
export const REACTION_FACTS = Object.freeze(["activity.isAttack", "activity.isMelee", "activity.isWeapon", "activity.isSpell"]);
/** The fields of each step type a drafter may write in a reaction (the others are EXCLUDED_REACTION `step.<type>.<field>`). */
export const REACTION_STEP_FIELDS = Object.freeze({
  use: Object.freeze(["activity", "target", "weapon"]),
  penalty: Object.freeze(["formula"]),
  miss: Object.freeze([]),
  damage: Object.freeze(["activity", "to"])
});

const key = (means, from) => Object.freeze({ means, from });
/**
 * The reaction declarations Ruling R38 admits, each with what it does at the table and the engine file that says so. Their
 * shapes are draft-keys.mjs REACTION_DECLARATION; what each implies is assert.mjs IMPLIED (triggers).
 */
export const REACTION_DECLARATIONS = Object.freeze({
  acBonus: key("When an attack hits the creature that carries the item, it may use its reaction (the item's reaction"
    + " activity, or the one named): its AC is raised by the proficiency bonus or the number given against that attack"
    + " alone, and the hit is judged again, so it may miss.", "engine runtime/reactions.mjs"),
  hitBecomesMiss: key("When an attack hits the creature that carries the item, it may use its reaction (the item's reaction"
    + " activity, or the one named): that attack misses instead.", "engine runtime/reactions.mjs"),
  counterattack: key("When an attack misses the creature that carries the item, it may use its reaction to attack the"
    + " attacker with one of its own melee weapons (the activity named, if any, pays for it).", "engine adapter/reactions.mjs"),
  retaliation: key("When an attack hits the creature that carries the item, the attacker takes the damage of the item's"
    + " activity named (no reaction is used).", "engine core/content.mjs")
});

/**
 * The keys Ruling R38 admits, each with what it does at the table and the engine file that says so. The value shapes are
 * draft-keys.mjs DRAFT_SHAPES; what each implies is assert.mjs IMPLIED.
 */
export const REACTION_KEYS = Object.freeze({
  reactions: key("The creature that carries the item has this many reactions each round (`perRound`, 2 to 20), never more"
    + " than one in a single turn; 20 is a reaction on every turn.", "engine core/turn.mjs"),
  teleport: key("Using the item (the activity named, when it names one) teleports its user to an unoccupied space it can see"
    + " that it picks, within `distance` feet (without a distance: the activity's range); `after: attack`, once the"
    + " activity's attack is judged, hit or miss, instead of at the use; `then`, an activity of the item used on arrival.",
  "engine runtime/teleport.mjs"),
  swapPlaces: key("Using the activity, its user and the creature it targets (within 5 feet) swap places, the target by a"
    + " teleport, the user spending 5 feet of its movement; neither provokes opportunity attacks.",
  "engine runtime/maneuver-dice.mjs"),
  light: key("With `on: effect`, each effect of the item makes the creature that bears it shed light while the effect lasts:"
    + " bright light out to `bright` feet and dim light out to `dim` feet (the outer radius, as Foundry counts it).",
  "engine adapter/lights.mjs")
});

/**
 * What the engine accepts in those keys, steps and declarations and a drafter may not write, each with why: `<key>.<field>`,
 * `<key>.<field>.<value>`, `triggers.reaction.<field>` (a reaction declaration) and `step.<type>.<field>` (a step of one).
 * A test reads the engine's field lists (core.mjs loadCore `reactionFields`, `stepFields`, `declarationFields`) and fails on
 * a field in neither the drafter's shape nor this table.
 */
export const EXCLUDED_REACTION = Object.freeze({
  "reactions.loseOne": "only one reaction lost to what would take them all: no sampled entry needs it and no word says it",
  "teleport.passengers": "willing creatures carried along, picked at the table: a count of others no word says",
  "teleport.unseen": "a destination the user cannot see: the sight limit is the rule's default, its lifting has no word",
  "teleport.maxLight": "only from and to dim light or darkness: a light level no given word says",
  "teleport.area": "the activity's area laid on the space left or on arrival: a zone at a teleport, no word for it",
  "teleport.destination": "an arrival near a creature or a plant (the GM's to judge): a destination no word says",
  "light.on.area": "light or darkness of a laid area: zone geometry and darkness, not a creature's light",
  "light.on.summon": "the light of a summoned object: a summon, which a drafter does not write",
  "light.on.wall": "a row of lights along a wall laid by points: wall geometry, a person's",
  "light.on.caster": "the user glows while its concentration lasts: tied to concentration, which no word says",
  "light.darkness": "magical darkness: only for an area",
  "light.dispels": "dispels spell light or darkness of a level: only for an area",
  "light.carried": "a summoned light carried by the caster: only for a summon",
  "light.single": "a new casting puts out the previous light: only for a summon",
  "light.color": "a colour code: no word, and nothing a rule asserts",
  "light.animation": "an animation type, a free string of Foundry's",
  "light.activity": "the activity of a caster light: only with on caster",
  "triggers.reaction.via": "a declaration carried by the item's effects on another creature: who reacts changes, no word",
  "triggers.reaction.fromEffect": "only one effect of the item carries it: needs via, which is refused",
  "triggers.reaction.by": "only damage from some creatures: for an effect's isDamaged, not a reaction",
  "triggers.reaction.oncePerTurn": "bonus damage once a turn: for preDamageRoll only",
  "triggers.reaction.ask": "bonus damage the user may add: for preDamageRoll only",
  "triggers.reaction.free": "a reaction that costs no reaction (a riposte inside a parry): which reaction it belongs to has no"
    + " word, and alone it would fire on every miss",
  "triggers.reaction.defends": "a preAttackRoll declaration of the target's item: not a hit or a miss",
  "step.use.advantage": "the reaction's attack is rolled with advantage: no word for it",
  "step.use.consume": "the reaction uses nothing of itself (a pool pays): no word for what pays",
  "step.use.free": "the use costs no reaction: which reaction it belongs to has no word",
  "step.use.approach": "the reactor first moves toward the attacker: a move no word says",
  "step.use.margin": "a margin of a failed save: for outcome steps, not a reaction",
  "step.penalty.margin": "a margin of a failed save: for outcome steps, not a reaction",
  "step.miss.margin": "a margin of a failed save: for outcome steps, not a reaction",
  "step.damage.formula": "a free damage formula: the damage dealt back is an activity of the item, whose data says it",
  "step.damage.damageType": "the type of a free formula: refused with it",
  "step.damage.same": "the same amount just taken, sent back (isDamaged, via an effect): no word for an amount taken",
  "step.damage.spends": "bonus damage that spends an effect: for preDamageRoll only",
  "step.damage.onSave": "half damage on a save: for failedSave only",
  "step.damage.margin": "a margin of a failed save: for outcome steps, not a reaction"
});

/**
 * The engine keys of the same territory a drafter may not write, each with why: a test checks each is an entry key of the
 * engine and none is a drafter key.
 */
export const NOT_ADMITTED_REACTION = Object.freeze({
  counter: "a 2014-style counterspell (a spell of the level or lower fails): not a counterattack, and no sampled need",
  damageShield: "damage dealt back by a free formula (and a damage type per effect): a formula, a person's to write",
  carriedLight: "a light object lit by hand at the sheet (a torch), with a fuel item named by identifier: not a creature's"
    + " own light, and an identifier of another document",
  transpose: "swaps places with a summoned creature named by the identifier of its summoning item: another document",
  afterTeleport: "spells named by identifier that offer activities after a teleport: identifiers of other documents",
  forOneAttack: "the item's own effects last for the one attack that opened the reaction: tied to an effect that raises AC"
    + " and the engine's hit.stoppableBy fact, which is not offered; a penalty says the same for one attack"
});

/**
 * The step types the engine allows with a reaction at a hit (core/content/steps.mjs validateTrigger, the HIT_WINDOWS list)
 * that a drafter may not write, each with why. A test fails on such a step type in neither this table nor the admitted ones
 * (REACTION_STEP_FIELDS); an older engine may lack one (`resist` is newer than its latest release).
 */
export const NOT_ADMITTED_STEPS = Object.freeze({
  halve: "half the attack's damage: no word for a damage reduction taken by a reaction",
  uncrit: "a critical hit becomes a normal hit: no word for it",
  reduce: "the attack's damage reduced by the reaction activity's roll: no word for a reduction",
  reroll: "the attacker rerolls its attack: no word for a reroll",
  resist: "resistance to the hit's damage types for the turn: no word for resistance",
  save: "the attacker makes a save of an activity of the item: on a hit, carried by an effect in the engine's uses"
});

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const has = (o, k) => Object.hasOwn(o, k);
const asList = (v) => (Array.isArray(v) ? v : [v]);
const stepsOf = (d) => (has(d, "do") ? asList(d.do) : []);
const typeOf = (s) => (isObject(s) && has(s, "type") ? s.type : undefined);

/**
 * True when a `triggers` declaration belongs to the territory of Ruling R38 (own properties only): a reaction moment, a step
 * that only a reaction has (`use`, `penalty`, `miss`), or damage dealt to the attacker (`to: "source"`). Such a declaration
 * is checked against REACTION_DECLARATION (draft-keys.mjs reactionProblemsOf).
 */
export function isReactionDeclaration(d) {
  if (!isObject(d)) return false;
  const on = has(d, "on") ? asList(d.on) : [];
  if (on.some((m) => REACTION_MOMENTS.includes(m))) return true;
  return stepsOf(d).some((s) => ["use", "penalty", "miss"].includes(typeOf(s))
    || (typeOf(s) === "damage" && has(s, "to") && s.to === "source"));
}

/**
 * Which admitted reaction a declaration is by its moment and step types (`acBonus`, `hitBecomesMiss`, `counterattack`,
 * `retaliation`), or null. Its fields are not checked here: draft-keys.mjs reactionProblemsOf does.
 */
export function reactionKind(d) {
  if (!isObject(d) || !has(d, "on") || !has(d, "do")) return null;
  const on = asList(d.on);
  if (on.length !== 1) return null;
  const types = stepsOf(d).map(typeOf).join(",");
  if (on[0] === "isHit" && types === "use,penalty") return "acBonus";
  if (on[0] === "isHit" && types === "use,miss") return "hitBecomesMiss";
  if (on[0] === "isMissed" && types === "use") return "counterattack";
  if (on[0] === "isHit" && types === "damage") return "retaliation";
  return null;
}

/** The AC bonus a penalty formula of PENALTY_FORMULAS says: the proficiency word, or the integer; null for another. */
export const acBonusOf = (formula) => (formula === "@prof" ? AC_BONUS.word
  : PENALTY_FORMULAS.includes(formula) ? Number(formula) : null);

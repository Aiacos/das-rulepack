// Ruling R34: the choices, barriers and wards a drafter may write, and the keys of that territory left out.
//
// Read in the DAS_CORE clone for this ruling (validators: core/content/annex.mjs validateChoice, core/content/extras.mjs,
// core/content/entry.mjs; meaning: the runtime and adapter code named in each `from`, and the engine's shipped entries):
//   - `choice`: at the use of an activity, its user picks ONE of the activity's own effects (each option labelled by the
//     effect's own name: the engine asks its own question when no `prompt` is given) and only that one is applied
//     (adapter/usage.mjs withChoice, core/action.mjs applicationPlan); `perTarget`, one pick per affected target, asked once
//     the saves are made, of the targets that failed; `roll`, a die picks it, one face per effect in the order of `order`;
//     `pool`, effects of the item an activity offers without its data linking them. Fewer than two effects: no question;
//   - `barrier` and `globe`: an emanation of `radius` around a creature that carries an effect of the item, moving with it
//     (adapter/barriers.mjs zonesOf). A barrier stops a creature outside (not the bearer; not of `exceptTypes`; with
//     `onlyTypes`, only those) from walking in (runtime/move-gate.mjs; a teleport or a forced move is not stopped) and from
//     hitting a creature inside with a melee attack without reach (runtime/turn.mjs); `shields`: nothing it does from outside
//     affects a creature inside; `endsOnContact`: the item's effects on the bearer end when it moves so that a creature the
//     barrier stops, alive, is inside (runtime/protection.mjs). A globe: a spell of level `maxLevel` or lower cast from
//     outside it affects no creature inside (adapter/eligibility.mjs globeAgainst, "unaffected");
//   - `wardsConditions`, `wardsAtZero`, `blocksHealing`, `blocksTempHp`: what the bearer of the item's effects is spared or
//     denied (adapter/facts.mjs conditionImmunitiesAgainst, adapter/ward.mjs, runtime/cantrips.mjs onPreApplyDamage).
//
// Everything here is a closed word, a bounded number or an id of the item's own activities and effects: no identifier of
// another document, no label, no free string, no formula. A field of an admitted key left out is in EXCLUDED_WARD with why,
// and a test fails on an engine field in neither the drafter's shape nor that table; a key of the territory not admitted is
// in NOT_ADMITTED with why. Nothing here imports another module: assert.mjs, draft-keys.mjs and batch.mjs read it.

/** The words `choice.effects` takes (core/content/enums.mjs CHOICE_EFFECTS; a test pins it to the clone). */
export const CHOICE_EFFECTS = Object.freeze(["one"]);
/** The spell levels a globe's `maxLevel` may name (and `given.spellLevelAtMost`): cantrips to 9th level. */
export const SPELL_LEVELS = Object.freeze({ min: 0, max: 9 });

const key = (means, from) => Object.freeze({ means, from });
/**
 * The keys Ruling R34 admits, each with what it does at the table in our words and the engine file that says so. The value
 * shapes are draft-keys.mjs DRAFT_SHAPES; what each implies is assert.mjs IMPLIED / IMPLIES_NOTHING.
 */
export const WARD_KEYS = Object.freeze({
  choice: key("At the use of the activity, its user picks one of the activity's own effects and only that one is applied:"
    + " once for every target, or (`perTarget`) once per target that failed its save, or (`roll`) by a die, one face per"
    + " effect in the order of `order`. `pool` names effects of the item an activity offers without its data linking them."
    + " An activity with fewer than two effects asks nothing.", "engine adapter/usage.mjs"),
  barrier: key("While a creature carries an effect of the item, an emanation of `radius` feet around it (moving with it):"
    + " a creature outside that is not the bearer, not of `exceptTypes` (or, with `onlyTypes`, only of those) cannot walk"
    + " into it and cannot hit a creature inside with a melee attack unless its weapon has reach; `shields`: nothing it does"
    + " from outside affects a creature inside; `endsOnContact`: the item's effects on the bearer end when it moves so that"
    + " such a creature is inside.", "engine adapter/barriers.mjs"),
  globe: key("While a creature carries an effect of the item, a spell of level `maxLevel` or lower cast from outside an"
    + " emanation of `radius` feet around it affects no creature inside it (each is unaffected).",
  "engine adapter/eligibility.mjs"),
  wardsConditions: key("The bearer of an effect of the item cannot be given those conditions (`statuses`) by a creature of"
    + " those types (`types`).", "engine adapter/facts.mjs"),
  wardsAtZero: key("The first time damage would drop the bearer of an effect of the item to 0 hit points, it drops to 1"
    + " instead and that effect is removed.", "engine adapter/ward.mjs"),
  blocksHealing: key("The bearer of an effect of the item (`true`: any of its effects; a list: those effects) regains no"
    + " hit points while it lasts.", "engine runtime/cantrips.mjs"),
  blocksTempHp: key("The bearer of an effect of the item (`true`: any of its effects, and also the creature that carries"
    + " the item itself; a list: those effects only) gains no temporary hit points.", "engine runtime/cantrips.mjs")
});

/**
 * What the engine accepts in those keys and a drafter may not write, as `<key>.<field>`, each with why. A test reads the
 * engine's field lists (core.mjs loadCore `wardFields`) and fails on a field in neither the drafter's shape nor this table.
 */
export const EXCLUDED_WARD = Object.freeze({
  "choice.prompt": "the question shown to the user: free text. Without it the engine asks its own and labels each option"
    + " by the effect's own name",
  "choice.outcome": "a choice between a hit's damage and a grapple in its place: no word says an outcome taken instead of"
    + " the damage, a person's to write",
  "choice.grapple": "the escape DC of that grapple: only with choice.outcome, which is a person's",
  "globe.everywhere": "the antimagic field (spells from anywhere, none cast inside), which the system's own antimagic"
    + " status also does: two sources of one rule, a person's"
});

/**
 * The engine keys of the same territory (a change of form, walls, an enclosure, a detection ward) a drafter may not write,
 * each with why: a test checks each is an entry key of the engine and none is a drafter key.
 */
export const NOT_ADMITTED = Object.freeze({
  changesForm: "the token becomes the actor of the FIRST profile of the item's transform activity, with that form's maximum"
    + " hit points or the current ones (adapter/coven.mjs): no temporary hit points, no pick among forms. The texts sampled"
    + " (a form picked at casting, temporary hit points from it, ended at will) would ship another rule",
  formLock: "`true` refuses a transform activity inside the item's lasting zone (adapter/areas.mjs); the worn form names"
    + " other items by identifier and takes steps with formulas. No sampled entry needed the zone form: left for one",
  walls: "the walls follow the item's template as it is laid (by points or on its outline), which geometry keys a drafter"
    + " may not write decide (pointWall, thinWall, cellWall): what a wall stops depends on the scene, a person's",
  wallSide: "a burning face chosen on a laid wall and turned from the caster's menu (runtime/wall-side.mjs), beside walls"
    + " and thinWall: geometry, a person's",
  encloses: "nothing reaches the enclosed bearer of the item's effect from outside and it reaches nothing outside"
    + " (adapter/facts.mjs): precise, but no sampled entry needed it and no word says it: left for a sample that does",
  wardsDetection: "the engine takes any string ('magic' or a school), not a list it owns, so no closed list can be pinned"
    + " to it; and only the senses the engine itself marks magic are stopped"
});

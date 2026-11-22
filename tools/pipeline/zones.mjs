// Ruling R33: the zones and auras a drafter may write, and how what they do is said in an assertion.
//
// The engine has two ways to act on creatures around a point or a creature over time (DAS_CORE, read for this ruling):
//   - a ZONE: the area an activity of the item lays (its template) lasts while the activity's duration does, and a
//     `triggers` declaration with a `replay` step makes the area use the item's activity again on a creature at the zone
//     moments it names (core/area.mjs "Zones qui durent", runtime/areas.mjs `tick`, adapter/areas.mjs `areaRulesOf`): `enter`
//     (it enters the area, or the area moves onto it), `turnStart` / `turnEnd` (it starts / ends its own turn inside), at most
//     once per creature and turn. `zoneAffects`, `zoneMax`, `zoneLasts`, `selfZone` and `zoneEffects` shape that area;
//   - an AURA around the creature that carries the item: `emanation` uses the item's activity (the one it names, else its
//     first save, damage or attack activity) on every creature within its radius at the end or the start of the bearer's turn,
//     or on a creature that starts its own turn within it (core/emanation.mjs, runtime/emanations.mjs); `aura` copies an
//     effect of the item onto the creatures within its radius while they stay there (core/aura.mjs, adapter/auras.mjs).
// `saveAutoSuccess` and `willingFails` decide the save of some creatures before any roll (runtime/engine.mjs `openingFor`,
// core/action.mjs `creatureAutoSuccess`).
//
// Everything here is a closed word, a bounded number or an id of the item's own activities and effects: no identifier of
// another document, no free string (no `changes` key/value text, no radius formula). A field or value of the engine left out
// is in EXCLUDED_ZONE with why, and a test fails on an engine field in neither the drafter's shape nor that table. Nothing
// here imports another module: assert.mjs and draft-keys.mjs read it.

/** The zone moments a `replay` declaration may name (core/triggers.mjs MOMENTS; a test pins them to the clone). */
export const ZONE_MOMENTS = Object.freeze(["enter", "turnStart", "turnEnd"]);
/** The moments of an `emanation` a drafter may write (core/emanation.mjs EMANATION_MOMENTS, but `death`). */
export const EMANATION_ON = Object.freeze(["ownTurnEnd", "ownTurnStart", "turnStart"]);
/**
 * The words `given.moment` takes beside the engine's MOMENTS: the emanation moments that are not trigger moments (the bearer
 * of the aura ends / starts its turn). `turnStart` is a word of both lists with one meaning: a creature starts its own turn
 * inside the area or the aura.
 */
export const AURA_MOMENTS = Object.freeze(["ownTurnStart", "ownTurnEnd"]);
/** Who an emanation acts on (core/content/annex.mjs validateEmanation): any creature, or only the bearer's enemies. */
export const EMANATION_AFFECTS = Object.freeze(["any", "enemy"]);
/** Who an aura's copy goes to (core/content/enums.mjs AURA_AFFECTS, but `summoner`). */
export const AURA_AFFECTS = Object.freeze(["ally", "enemy", "any"]);
/** Who the item's zone affects when its data does not say (core/content/entry.mjs: `zoneAffects`). */
export const ZONE_AFFECTS = Object.freeze(["enemy", "ally"]);
/** The template types `selfZone` may give (core/content/entry.mjs: its validator's list; a test pins it to the clone). */
export const TEMPLATE_TYPES = Object.freeze(["radius", "sphere", "circle", "cube", "square"]);
/** A radius or a template size, in feet; how long a zone may be made to last, in seconds; how many creatures at most. */
export const RADIUS_FT = Object.freeze({ min: 5, max: 300 });
export const ZONE_SECONDS = Object.freeze({ min: 6, max: 86400 });
export const ZONE_MAX = Object.freeze({ min: 1, max: 20 });

const key = (means, from) => Object.freeze({ means, from });
/**
 * The keys Ruling R33 admits, each with what it does at the table in our words and the engine file that says so. The value
 * shapes are draft-keys.mjs DRAFT_SHAPES; what each implies is assert.mjs IMPLIED / IMPLIES_NOTHING.
 */
export const ZONE_KEYS = Object.freeze({
  emanation: key("An aura that acts: at the moment `on` names, the item's activity (`activity`, else its first save, damage or"
    + " attack) is used on each creature within the radius (`radius` in feet, else the activity's template or range), the"
    + " bearer left out; `affects: enemy` only its enemies; `sees` only creatures that see the bearer; `whileActive` only while"
    + " an effect of the item is on the bearer.", "engine runtime/emanations.mjs"),
  aura: key("A passive aura: an effect of the item (`effect`, else its transferred or first effect) is copied onto each creature"
    + " within the radius of the bearer while it stays there, and removed when it leaves; `affects` (default ally), `types`"
    + " (only those creature types), `includeSelf` (the bearer too), `whileActive` (only while the bearer carries an effect of"
    + " the item). The item's own template, when it has one, gives the radius and who it affects instead.",
  "engine adapter/auras.mjs"),
  zoneAffects: key("Who the item's area affects when its data does not say: `enemy` spares the user's allies, `ally` spares its"
    + " enemies; the user is asked to confirm the creatures chosen.", "engine adapter/saves.mjs"),
  zoneEffects: key("The effects of the activity are carried while a creature is inside its area and removed when it leaves,"
    + " instead of being applied once by the resolution.", "engine adapter/zone-effects.mjs"),
  selfZone: key("The template an activity lacks in its data (`type`, `size` in feet), laid on the user for a self-range"
    + " activity, else placed by hand; the data's own template wins when it has one.", "engine adapter/template.mjs"),
  zoneLasts: key("The area of the activity stays this many seconds of world time, even for an instantaneous activity, and"
    + " replays what its `replay` triggers say (not for a utility activity).", "engine runtime/engine-areas.mjs"),
  zoneMax: key("At most this many creatures in the item's area are affected, the nearest to its centre first.",
    "engine core/area.mjs"),
  saveAutoSuccess: key("A creature of one of `types`, of at least size `sizeAtLeast`, or (`fighting`) an enemy in a started"
    + " combat with the user succeeds on the item's saving throw without rolling.", "engine runtime/engine.mjs"),
  willingFails: key("Before the save, the user is asked for each target that is not its enemy whether it is willing; a willing"
    + " one fails the item's saving throw without rolling.", "engine runtime/engine.mjs")
});

/**
 * What the engine accepts in those keys and a drafter may not write, as `<key>.<field>` or `<key>.<field>.<value>`, each with
 * why. A test reads the engine's field lists (core.mjs loadCore `zoneFields`) and fails on a field in neither the drafter's
 * shape nor this table.
 */
export const EXCLUDED_ZONE = Object.freeze({
  "aura.changes": "free key and value strings written in place of the item's effect: free text, a person's to write",
  "aura.radiusFormula": "a formula read on the bearer's roll data (a class scale): a free formula, a person's to write",
  "aura.affects.summoner": "only the creature that summoned the bearer: no summoned creature is staged, and no word says it",
  "emanation.radiusFormula": "a formula read on the bearer's roll data (a class scale): a free formula, a person's to write",
  "emanation.atStart": "it also acts the moment the item's effect reaches the bearer (a transformation): no moment word",
  "emanation.on.death": "it acts when the bearer dies or drops to 0 hit points: a death trigger, which no moment names",
  "triggers.replay.on.moves": "once per square travelled inside: the number of times has no word, and it never acts when laid",
  "triggers.replay.if": "a condition that picks which activity a zone replays per creature: a person's to write"
});

/** True when a triggers declaration replays the item's activity: a step of type `replay` (own properties only). */
export const replays = (declaration) => {
  const steps = declaration !== null && typeof declaration === "object" && !Array.isArray(declaration)
    ? declaration.do : undefined;
  return (Array.isArray(steps) ? steps : [steps])
    .some((s) => s !== null && typeof s === "object" && Object.hasOwn(s, "type") && s.type === "replay");
};

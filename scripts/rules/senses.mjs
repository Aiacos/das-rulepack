/**
 * Senses from books that have no official Foundry module, declared with the engine's generic `sense` block (DAS · Core,
 * `module/scripts/core/senses.mjs`), keyed by the dnd5e identifier the imported items carry.
 *
 * Every entry names its book and page; the rule text is not copied. These entries were first proposed to DAS · Core
 * (dnd5e-combat pull request 128) and belong here: the engine's public repositories carry nothing from non-SRD books.
 *
 * They need a DAS · Core that knows the `sense` key (pull requests 119 and 122 of dnd5e-combat, not in a release at the time
 * of writing). On an older engine these entries are rejected one by one when the pack registers (the engine logs them); the
 * spell rules are registered all the same.
 */
export const SENSES = Object.freeze({
  // Life Sense (Vampiric Mist, MPMM p.250; MTF p.246): the location of every creature within 60 ft, except Constructs and
  // Undead. The rule says nothing of cover: walls do not stop it. A natural sense: nothing wards against it.
  "life-sense": { sense: { kind: "locate", range: 60, units: "ft", walls: false,
    detects: { not: { "target.creatureType": ["construct", "undead"] } } } },
  // Ghostly Gaze (eldritch invocation, XGE p.56): seeing through solid objects within 30 ft for 1 minute — a sight that walls
  // do not stop, carried by the effect the invocation places on its user. It is a sight of the eyes: off while the user is
  // Blinded, and an Invisible creature stays unseen. The Darkvision it grants is left to the effect.
  "ghostly-gaze": { sense: { kind: "sight", range: 30, units: "ft", via: "effect", walls: false, needs: "sight" } }
});

/**
 * Shadow Blade — Foundry glue. The rules are in core/shadow-blade.mjs.
 *
 *  - Casting (or recasting while concentrating) makes sure the caster holds exactly one blade. A source that conjures its
 *    own (DDB Importer's enchantment rider) is adopted; otherwise the blade is created here, on the spot, and tied to the
 *    concentration so it leaves with the spell.
 *  - An attack with the blade against a target in dim light or darkness is rolled with advantage.
 *  - A thrown blade dissipates when the turn ends (20 s later outside combat).
 */

import { MODULE_ID, DAS_ID } from "./constants.mjs";
import { SPELL_IDENTIFIER, bladeData, inShadow, isBladeIdentifier, isThrown, turnAdvanced } from "./core/shadow-blade.mjs";

const FLAG = "shadowBlade";
const loc = key => game.i18n.localize(`DASRULEPACK.${key}`);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const isSpell = item => (item?.type === "spell") && (item.system?.identifier === SPELL_IDENTIFIER);
const isBlade = item => (item?.type === "weapon") && (!!item.getFlag(MODULE_ID, FLAG) || isBladeIdentifier(item.system?.identifier));
const bladesOf = actor => actor.items.filter(isBlade);

/** The concentration effect the actor keeps for this spell, if any. */
function concentrationOf(actor, spell) {
  return [...(actor.concentration?.effects ?? [])].find(e => e.getFlag("dnd5e", "item")?.id === spell.id) ?? null;
}

/** Does this activity conjure the blade by itself (an enchantment that brings an item along)? */
function conjuresItsOwn(activity) {
  return (activity?.type === "enchant") && (activity.effects ?? []).some(e => (e.riders?.item?.length ?? 0) > 0);
}

/**
 * After a use of the spell: one blade, of the right size, in the caster's hand.
 * @param {Activity} activity  The activity just used.
 * @param {number} level       Level of the slot.
 */
async function ensureBlade(activity, level) {
  const spell = activity.item;
  const actor = spell.actor;
  if ( !actor ) return null;

  // A source that conjures its own blade does it after the use: give it a moment before creating ours.
  if ( conjuresItsOwn(activity) ) {
    for ( let i = 0; (i < 10) && !bladesOf(actor).length; i++ ) await wait(400);
  }

  let blades = bladesOf(actor);
  if ( !blades.length ) {
    // The blade lasts as long as the spell: dnd5e removes a document when the effect named by `dependentOn` goes.
    const concentration = concentrationOf(actor, spell);
    if ( !concentration && spell.system.properties?.has?.("concentration") ) return null;   // the spell already ended
    const data = bladeData({ level, name: loc("ShadowBlade.Name"), img: spell.img, moduleId: MODULE_ID, spellUuid: spell.uuid,
      activityId: foundry.utils.randomID() });
    if ( concentration ) foundry.utils.setProperty(data, "flags.dnd5e.dependentOn", concentration.uuid);
    const [created] = await actor.createEmbeddedDocuments("Item", [data]);
    blades = created ? [created] : [];
  }

  // Never two blades: the newest stays.
  const [keep, ...extra] = blades.slice().reverse();
  if ( extra.length ) await actor.deleteEmbeddedDocuments("Item", extra.map(i => i.id));
  if ( keep && !keep.getFlag(MODULE_ID, FLAG) ) {
    await keep.setFlag(MODULE_ID, FLAG, { spell: spell.uuid, level, thrown: false });
  }
  return keep ?? null;
}

/** dnd5e.postUseActivity: the spell was cast, or recast to call the blade back. */
function onPostUseActivity(activity, usageConfig, results) {
  if ( !isSpell(activity?.item) ) return;
  const level = Number(results?.message?.system?.level) || ((Number(activity.item.system.level) || 2) + (Number(usageConfig?.scaling) || 0));
  ensureBlade(activity, level).catch(err => console.error(`${MODULE_ID} | Shadow Blade:`, err));
}

/** dnd5e.preRollAttackV2: advantage against a target in dim light or darkness. */
function onPreRollAttack(config) {
  const item = config?.subject?.item;
  if ( !item || !isBlade(item) ) return;
  const targets = [...(game.user?.targets ?? [])];
  if ( !targets.length ) return;
  const light = game.modules.get(DAS_ID)?.api?.light;
  if ( typeof light !== "function" ) return;
  if ( !targets.every(token => inShadow(light(token)?.key)) ) return;
  for ( const roll of config.rolls ?? [] ) {
    roll.options ??= {};
    roll.options.advantage = true;
  }
  ui.notifications.info(loc("ShadowBlade.Advantage"));
}

/** dnd5e.rollAttackV2: a thrown blade is marked, and dissipates when the turn ends. */
function onRollAttack(rolls, { subject }={}) {
  const item = subject?.item;
  if ( !item || !isBlade(item) || !isThrown(rolls?.[0]?.options?.attackMode) ) return;
  const state = item.getFlag(MODULE_ID, FLAG) ?? {};
  item.setFlag(MODULE_ID, FLAG, { ...state, thrown: true }).catch(() => null);
  if ( !game.combat?.started ) setTimeout(() => dissipate(item.actor), 20000);
}

/** Removes the thrown blades of this actor. */
async function dissipate(actor) {
  const thrown = actor ? bladesOf(actor).filter(i => i.getFlag(MODULE_ID, FLAG)?.thrown) : [];
  if ( !thrown.length || !actor.isOwner ) return;
  await actor.deleteEmbeddedDocuments("Item", thrown.map(i => i.id));
  ui.notifications.info(game.i18n.format("DASRULEPACK.ShadowBlade.Dissipated", { name: actor.name }));
}

/** combatTurnChange, on the active GM: the turn ended, thrown blades are gone. */
function onTurnChange(combat, prior, current) {
  if ( !game.users.activeGM?.isSelf || !turnAdvanced(prior, current) ) return;
  for ( const combatant of combat.combatants ) {
    if ( combatant.actor ) dissipate(combatant.actor).catch(err => console.error(`${MODULE_ID} | Shadow Blade:`, err));
  }
}

/**
 * createItem, on the client that created it: a blade that arrives when the caster already holds one replaces it (a source
 * that conjures its own blade may deliver it after ours).
 */
function onCreateItem(item, options, userId) {
  if ( (userId !== game.user.id) || !isBlade(item) || !item.actor ) return;
  const older = bladesOf(item.actor).filter(i => i.id !== item.id).map(i => i.id);
  if ( older.length ) item.actor.deleteEmbeddedDocuments("Item", older).catch(() => null);
}

export function registerShadowBlade() {
  Hooks.on("createItem", onCreateItem);
  Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
  Hooks.on("dnd5e.preRollAttackV2", onPreRollAttack);
  Hooks.on("dnd5e.rollAttackV2", onRollAttack);
  Hooks.on("combatTurnChange", onTurnChange);
}

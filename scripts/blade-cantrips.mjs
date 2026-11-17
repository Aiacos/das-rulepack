/**
 * Booming Blade and Green-Flame Blade — Foundry glue. The rules are in core/blade-cantrips.mjs.
 *
 * The imported items carry "damage" activities meant to be clicked by hand after an attack. Here the spell is cast the way the
 * book writes it: using it makes one melee attack with a weapon the caster holds.
 *
 *  - Caster's client: the use of the spell is replaced by the weapon's attack, whose chat card is marked; from 5th level the
 *    extra dice are added to the weapon's damage roll.
 *  - Active GM's client: when the engine has settled that attack and it hit, the booming energy is placed on the target
 *    (Booming Blade), or the caster is asked which creature the fire leaps to (Green-Flame Blade). Everything that touches
 *    another creature is done here, from what the engine recorded on the card — never from numbers sent by a player.
 *  - Active GM's client: a sheathed target that moves 5 feet or more of its own will takes the thunder damage; the energy
 *    leaves at the start of the caster's next turn.
 */

import { MODULE_ID, DAS_ID } from "./constants.mjs";
import { BLADE_CANTRIPS, hitFormula, leapFormula, moveDice, hitTargets, withinLeap, movedEnough } from "./core/blade-cantrips.mjs";

const LEAP_QUERY = `${MODULE_ID}.greenFlameLeap`;
const loc = (key, data) => data ? game.i18n.format(`DASRULEPACK.${key}`, data) : game.i18n.localize(`DASRULEPACK.${key}`);
const isActiveGM = () => !!game.users.activeGM?.isSelf;
const kindOf = item => (item?.type === "spell") ? (BLADE_CANTRIPS[item.system?.identifier] ? item.system.identifier : null) : null;
const gridOf = scene => ({ size: scene?.grid?.size, distance: scene?.grid?.distance });
const box = token => ({ x: token.x, y: token.y, width: token.width, height: token.height });

/** Blade attacks announced on this client and not rolled yet: actor uuid → { kind, weapon, level }. */
const pending = new Map();
/** Usage messages whose leap is being asked on this client. */
const asking = new Set();
/** Usage messages already settled on this client (the engine updates the card several times once it is done). */
const settledHere = new Set();

/** Caster level for the cantrip's scaling: character level, or a creature's spellcasting level (its CR failing that). */
function casterLevel(actor) {
  const s = actor?.system ?? {};
  if ( actor?.type === "character" ) return Number(s.details?.level) || 1;
  return Number(s.attributes?.spell?.level) || Number(s.details?.spellLevel) || Math.floor(Number(s.details?.cr) || 1) || 1;
}

/** The caster's spellcasting ability modifier for this spell. */
function spellModifier(spell) {
  const actor = spell.actor;
  const ability = spell.abilityMod ?? actor?.system?.attributes?.spellcasting;
  return Number(actor?.system?.abilities?.[ability]?.mod) || 0;
}

/** The melee attack of a weapon, or null. */
function meleeAttackOf(weapon) {
  if ( (weapon?.type !== "weapon") || !weapon.system?.equipped ) return null;
  const attacks = [...(weapon.system.activities ?? [])].filter(a => a.type === "attack");
  return attacks.find(a => (a.attack?.type?.value ?? a.actionType) !== "ranged" && !/R$/.test(weapon.system.type?.value ?? "")) ?? null;
}

/** Asks which weapon makes the attack when the caster holds several. */
async function chooseWeapon(spell, weapons) {
  if ( weapons.length === 1 ) return weapons[0];
  const buttons = weapons.map((w, i) => ({ action: `w${i}`, label: w.name, default: i === 0, callback: () => w }));
  return foundry.applications.api.DialogV2.wait({ window: { title: spell.name }, content: `<p>${loc("Blade.WhichWeapon")}</p>`, buttons,
    rejectClose: false });
}

/** The spell is cast: one melee attack with a held weapon, its card marked for the GM's client. */
async function castBlade(activity, usageConfig) {
  const spell = activity.item;
  const actor = spell.actor;
  const kind = kindOf(spell);
  const weapons = actor.items.filter(i => meleeAttackOf(i));
  if ( !weapons.length ) return ui.notifications.warn(loc("Blade.NoWeapon", { spell: spell.name }));
  const weapon = await chooseWeapon(spell, weapons);
  if ( !weapon ) return null;
  const level = casterLevel(actor);
  pending.set(actor.uuid, { kind, weapon: weapon.id, level });
  const mark = { kind, spell: spell.uuid, level };
  // What the engine was told about this use (a use it has already confirmed, for instance) goes on to the attack.
  const usage = usageConfig?.[DAS_ID] ? { [DAS_ID]: usageConfig[DAS_ID] } : {};
  try {
    return await meleeAttackOf(weapon).use(usage, {}, { data: { flags: { [MODULE_ID]: { blade: mark } } } });
  } finally {
    // The damage roll follows the attack: the mark stays for it, but not for a later, ordinary attack.
    setTimeout(() => { if ( pending.get(actor.uuid)?.weapon === weapon.id ) pending.delete(actor.uuid); }, 120000);
  }
}

/** dnd5e.preUseActivity: using the cantrip is replaced by the weapon attack it is cast with. */
function onPreUseActivity(activity, usageConfig) {
  const spell = activity?.item;
  if ( !kindOf(spell) || !spell.actor || usageConfig?.[MODULE_ID]?.asWritten ) return true;
  // The first activity is the cast; the others (the imported "damage when it moves") stay usable by hand.
  const first = [...spell.system.activities].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))[0];
  if ( first && (activity.id !== first.id) ) return true;
  castBlade(activity, usageConfig).catch(err => console.error(`${MODULE_ID} | ${spell.name}:`, err));
  return false;
}

/** dnd5e.preRollDamageV2: from 5th level, the extra dice on the weapon's damage roll. */
function onPreRollDamage(config) {
  const item = config?.subject?.item;
  const mark = item?.actor ? pending.get(item.actor.uuid) : null;
  if ( !mark || (mark.weapon !== item.id) ) return true;
  pending.delete(item.actor.uuid);
  const formula = hitFormula(mark.level);
  if ( !formula ) return true;
  const type = BLADE_CANTRIPS[mark.kind].type;
  config.rolls ??= [];
  config.rolls.push({ data: config.subject.getRollData?.() ?? {}, parts: [formula], options: { type, types: [type], properties: [] } });
  return true;
}

/* -------------------------------------------- */
/*  After the attack                            */
/* -------------------------------------------- */

/** The mark and the settled hits of a blade attack's usage message, or null. */
function settledBlade(message) {
  const mark = message?.flags?.[MODULE_ID]?.blade;
  if ( !mark || mark.done ) return null;
  const hits = hitTargets(message.flags?.[DAS_ID]?.resolution);
  return hits ? { mark, hits } : null;
}

/**
 * Active GM: what a card's mark is worth. A chat message and its flags can be written by its author, so nothing in the mark is
 * taken as given: the author must own the caster, the caster must really have that cantrip, and the level is read again from
 * the caster. Null when the mark does not hold.
 */
async function trusted(message, mark) {
  const spell = await fromUuid(mark?.spell ?? "");
  const actor = spell?.actor;
  if ( !actor || (kindOf(spell) !== mark.kind) ) return null;
  if ( !message.author || !actor.testUserPermission(message.author, "OWNER") ) return null;
  if ( message.speaker?.actor && (message.speaker.actor !== actor.id) ) return null;
  return { kind: mark.kind, spell: spell.uuid, level: casterLevel(actor) };
}

/** Active GM: the booming energy on the target that was hit. */
async function sheathe(message, mark, tokenUuid) {
  const token = await fromUuid(tokenUuid);
  const spell = await fromUuid(mark.spell);
  if ( !token?.actor || !spell?.actor ) return;
  const old = token.actor.effects.filter(e => e.flags?.[MODULE_ID]?.booming).map(e => e.id);
  if ( old.length ) await token.actor.deleteEmbeddedDocuments("ActiveEffect", old);
  await token.actor.createEmbeddedDocuments("ActiveEffect", [{
    name: loc("Blade.Sheathed"), img: spell.img, origin: spell.uuid, duration: { rounds: 1 },
    description: loc("Blade.SheathedHint", { dice: moveDice(mark.level) }),
    flags: { [MODULE_ID]: { booming: { caster: spell.actor.uuid, dice: moveDice(mark.level), token: token.uuid, from: { x: token.x, y: token.y },
      time: game.time.worldTime } } }
  }]);
}

/** Active GM: an attack marked as a blade cantrip has just been settled by the engine. */
async function onSettledForGM(message) {
  const settled = settledBlade(message);
  if ( !settled || settledHere.has(message.id) ) return;
  settledHere.add(message.id);
  const { hits } = settled;
  const mark = await trusted(message, settled.mark);
  if ( !mark ) return message.setFlag(MODULE_ID, "blade", { ...settled.mark, done: true });
  // Booming Blade ends here; Green-Flame Blade stays open until the leap is chosen (or there is nothing to leap to).
  if ( (mark.kind === "booming-blade") || !hits.length ) await message.setFlag(MODULE_ID, "blade", { ...mark, done: true });
  if ( (mark.kind === "booming-blade") && hits.length ) await sheathe(message, mark, hits[0]);
}

/** The creatures the fire can leap to: within 5 feet of the target, not the target, not the caster's own token. */
function leapCandidates(targetToken, casterActor) {
  const scene = targetToken.parent;
  const grid = gridOf(scene);
  return scene.tokens.filter(t => (t.id !== targetToken.id) && t.actor && !t.hidden && (t.actor.uuid !== casterActor?.uuid)
    && ((t.actor.system?.attributes?.hp?.value ?? 1) > 0) && withinLeap(box(targetToken), box(t), grid));
}

/** Caster's client: the attack hit — which creature does the fire leap to? */
async function askLeap(message) {
  const settled = settledBlade(message);
  if ( !settled || (settled.mark.kind !== "green-flame-blade") || !settled.hits.length || asking.has(message.id) ) return;
  asking.add(message.id);
  const target = await fromUuid(settled.hits[0]);
  const spell = await fromUuid(settled.mark.spell);
  const candidates = target ? leapCandidates(target, spell?.actor) : [];
  let chosen = null;
  if ( candidates.length ) {
    const buttons = candidates.map((t, i) => ({ action: `t${i}`, label: t.name, callback: () => t.uuid }));
    buttons.push({ action: "none", label: loc("Blade.NoLeap"), callback: () => null });
    chosen = await foundry.applications.api.DialogV2.wait({ window: { title: spell?.name ?? "Green-Flame Blade" },
      content: `<p>${loc("Blade.LeapTo", { target: target.name })}</p>`, buttons, rejectClose: false });
  }
  const payload = { message: message.id, token: chosen ?? null };
  if ( isActiveGM() ) await handleLeap(payload);
  else await game.users.activeGM?.query(LEAP_QUERY, payload, { timeout: 30000 }).catch(() => null);
}

/**
 * Active GM: the fire leaps. Everything is read again here — the card must be a settled Green-Flame Blade hit that has not
 * leapt yet, and the chosen creature must stand within 5 feet of the creature that was hit. The damage is rolled here.
 */
async function handleLeap({ message: messageId, token: tokenUuid }={}) {
  if ( !isActiveGM() ) return false;
  const message = game.messages.get(messageId);
  const settled = settledBlade(message);
  if ( !settled || (settled.mark.kind !== "green-flame-blade") || !settled.hits.length ) return false;
  const { hits } = settled;
  await message.setFlag(MODULE_ID, "blade", { ...settled.mark, done: true });
  const mark = await trusted(message, settled.mark);
  if ( !mark ) return false;
  if ( !tokenUuid ) return true;
  const target = await fromUuid(hits[0]);
  const spell = await fromUuid(mark.spell);
  const second = await fromUuid(tokenUuid);
  if ( !target || !spell?.actor || !second?.actor || (second.parent !== target.parent) ) return false;
  if ( !leapCandidates(target, spell.actor).some(t => t.id === second.id) ) return false;
  const roll = await new Roll(leapFormula(mark.level, spellModifier(spell))).evaluate();
  await roll.toMessage({ speaker: message.speaker, flavor: loc("Blade.LeapFlavor", { spell: spell.name, target: second.name }) });
  await second.actor.applyDamage([{ value: Math.max(0, roll.total), type: "fire" }]);
  return true;
}

/** updateChatMessage: the engine writes its resolution on the usage message as the attack goes on. */
function onUpdateMessage(message) {
  if ( !message.flags?.[MODULE_ID]?.blade ) return;
  if ( isActiveGM() ) onSettledForGM(message).catch(err => console.error(`${MODULE_ID} | blade cantrip:`, err));
  if ( message.isAuthor ) askLeap(message).catch(err => console.error(`${MODULE_ID} | Green-Flame Blade:`, err));
}

/* -------------------------------------------- */
/*  Booming energy                              */
/* -------------------------------------------- */

const boomingOf = actor => actor?.effects.find(e => e.flags?.[MODULE_ID]?.booming) ?? null;

/** updateToken, active GM: a sheathed creature moves of its own will. */
function onUpdateToken(token, changes, options) {
  if ( !isActiveGM() || !(("x" in changes) || ("y" in changes)) ) return;
  if ( options?.[DAS_ID]?.forced || options?.[DAS_ID]?.forcedMove || options?.teleport ) return;   // pushed, pulled, carried
  const effect = boomingOf(token.actor);
  const state = effect?.flags?.[MODULE_ID]?.booming;
  if ( !state || (state.token !== token.uuid) || state.spent ) return;
  if ( !movedEnough(state.from, { x: changes.x ?? token.x, y: changes.y ?? token.y }, gridOf(token.parent)) ) return;
  boom(token, effect, state).catch(err => console.error(`${MODULE_ID} | Booming Blade:`, err));
}

/** The thunder damage, once, and the spell ends. */
async function boom(token, effect, state) {
  await effect.setFlag(MODULE_ID, "booming", { ...state, spent: true });
  const roll = await new Roll(`${state.dice}d8`).evaluate();
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ token }), flavor: loc("Blade.BoomFlavor", { target: token.name }) });
  await token.actor.applyDamage([{ value: roll.total, type: "thunder" }]);
  if ( token.actor.effects.has(effect.id) ) await effect.delete();
}

/** combatTurnChange, active GM: the energy leaves at the start of the caster's next turn. */
function onTurnChange(combat, prior, current) {
  if ( !isActiveGM() ) return;
  const forward = (current.round > prior.round) || ((current.round === prior.round) && (current.turn > prior.turn));
  const caster = combat.combatants.get(current.combatantId)?.actor?.uuid;
  if ( !forward || !caster ) return;
  for ( const combatant of combat.combatants ) {
    const effect = boomingOf(combatant.actor);
    if ( effect?.flags[MODULE_ID].booming.caster === caster ) effect.delete().catch(() => null);
  }
}

/** updateWorldTime, active GM: outside combat the energy lasts a round. */
function onWorldTime(worldTime) {
  if ( !isActiveGM() || game.combat?.started ) return;
  for ( const token of canvas?.scene?.tokens ?? [] ) {
    const effect = boomingOf(token.actor);
    if ( effect && ((worldTime - (effect.flags[MODULE_ID].booming.time ?? worldTime)) >= 6) ) effect.delete().catch(() => null);
  }
}

export function registerBladeCantripsInit() {
  CONFIG.queries[LEAP_QUERY] = handleLeap;
}

export function registerBladeCantrips() {
  Hooks.on("dnd5e.preUseActivity", onPreUseActivity);
  Hooks.on("dnd5e.preRollDamageV2", onPreRollDamage);
  Hooks.on("updateChatMessage", onUpdateMessage);
  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("combatTurnChange", onTurnChange);
  Hooks.on("updateWorldTime", onWorldTime);
}

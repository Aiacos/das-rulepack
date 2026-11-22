// The structure of one Foundry item, for reader agents: which activities, saves, damage, templates and effects the item's own
// data carries. It is derived from premium data, so it is written only to a private folder, and it is built from a whitelist:
// no description, chat text, flags or change values ever pass through. Every value that is copied is a number, a boolean, an
// identifier-like string or a short formula; anything else is dropped.
const LABEL_MAX = 40;
const VALUE_MAX = 40;
const KEY_MAX = 80;
// What a copied string may look like: an enumeration value, an id, a key, a dice or ability formula. No sentence passes.
const PLAIN = /^[\w@.+\-*/()\[\]$ ,:|]*$/;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : v instanceof Set ? [...v] : []);
const sortedUnique = (values) => [...new Set(values)].sort();

// A short plain value, or undefined: numbers, booleans and strings that look like data, never prose.
function plain(v, max = VALUE_MAX) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v;
  if (typeof v === "string" && v.length <= max && PLAIN.test(v) && v.trim().split(/\s+/).length <= 3) return v;
  return undefined;
}
const plainList = (v) => sortedUnique(list(v).map((x) => plain(x)).filter((x) => typeof x === "string"));
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
const nonEmpty = (o) => (Object.keys(o).length ? o : undefined);
const pick = (src, fields) => {
  if (!isObject(src)) return undefined;
  return nonEmpty(clean(Object.fromEntries(fields.map((f) => [f, plain(src[f])]))));
};

// A short label: the name without markup, cut at LABEL_MAX characters.
const labelOf = (name) => {
  if (typeof name !== "string") return "";
  return name.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX);
};

const part = (p) => clean({ number: plain(p?.number), denomination: plain(p?.denomination), types: plainList(p?.types) });

// `base` is the item's own damage (`system.damage.base`): an attack that includes it rolls it before its own parts.
function activityOf(id, a, base) {
  const out = { id: plain(a?._id) ?? id, type: plain(a?.type) ?? "" };
  const label = labelOf(a?.name);
  if (label) out.label = label;
  out.activation = plain(a?.activation?.type) ?? "";
  if (isObject(a?.save)) {
    const dc = isObject(a.save.dc) ? pick(a.save.dc, ["calculation", "formula"]) : plain(a.save.dc);
    out.save = clean({ ability: plainList(a.save.ability), dc });
  }
  const onSave = plain(a?.damage?.onSave);
  if (onSave) out.onSave = onSave;
  const own = list(a?.damage?.parts).map(part);
  const fromItem = plain(a?.type) === "attack" && a?.damage?.includeBase === true && isObject(base) ? [part(base)] : [];
  out.damage = [...fromItem.filter((p) => Object.keys(p).length), ...own];
  if (isObject(a?.healing)) {
    const healing = part(a.healing);
    if (Object.keys(healing).length) out.healing = [healing];
  }
  const template = pick(a?.target?.template, ["type", "size"]);
  if (template) out.template = template;
  const affects = pick(a?.target?.affects, ["type", "count"]);
  if (affects) out.affects = affects;
  out.effects = list(a?.effects).map((e) => plain(e?._id)).filter((x) => typeof x === "string");
  const consumes = list(a?.consumption?.targets).map((t) => clean({
    type: plain(t?.type), target: plain(t?.target), value: plain(t?.value)
  }));
  if (consumes.length) out.consumes = consumes;
  return out;
}

function effectOf(e) {
  const out = {
    id: plain(e?._id) ?? "", name: labelOf(e?.name), statuses: plainList(e?.statuses),
    changes: list(e?.changes ?? e?.system?.changes).map((c) => plain(c?.key, KEY_MAX)).filter((k) => typeof k === "string"),
    transfer: e?.transfer === true
  };
  const duration = pick(e?.duration, ["seconds", "rounds", "turns"]);
  if (duration) out.duration = duration;
  return out;
}

/** The structure of a Foundry document (an item, or one embedded in an actor): `{ level?, school?, …, activities, effects }`. */
export function structureOf(doc) {
  const system = isObject(doc?.system) ? doc.system : {};
  const out = {};
  for (const f of ["level", "school", "rarity"]) if (plain(system[f]) !== undefined) out[f] = plain(system[f]);
  const duration = pick(system.duration, ["value", "units"]);
  if (duration) out.duration = duration;
  if (list(system.properties).includes("concentration")) out.concentration = true;
  if (isObject(system.uses)) {
    const recovery = sortedUnique(list(system.uses.recovery).map((r) => plain(r?.period)).filter(Boolean));
    const uses = clean({ max: plain(system.uses.max), recovery });
    if (uses.max !== undefined && uses.max !== "" || uses.recovery.length) out.uses = uses;
  }
  out.activities = Object.entries(isObject(system.activities) ? system.activities : {})
    .map(([id, a]) => activityOf(id, a, system.damage?.base));
  out.effects = list(doc?.effects).map(effectOf);
  return out;
}

// A length in feet: a positive number, or a string of digits; anything else (a formula, "self", an empty value) is unknown.
const feet = (v) => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * How far each activity of a document reaches, in feet, by activity id (null when unknown): the activity's own range when it
 * is given in feet, else for an activity that takes the item's range (units `self` or none: a monster's weapon attack) what
 * the engine judges it on when no attack mode is given: the item's normal range for a ranged attack, else its reach, else its
 * normal range. Numbers only: what play/lib/steps.mjs needs to start a pull in reach.
 */
export function reachesOf(doc) {
  const system = isObject(doc?.system) ? doc.system : {};
  const item = isObject(system.range) && system.range.units === "ft" ? system.range : null;
  const itemReach = (a) => {
    if (!item) return null;
    const ranged = a?.attack?.type?.value === "ranged";
    return (ranged ? null : feet(item.reach)) ?? feet(item.value) ?? null;
  };
  const out = {};
  for (const [id, a] of Object.entries(isObject(system.activities) ? system.activities : {})) {
    const range = isObject(a?.range) ? a.range : {};
    const own = range.units === "ft" ? feet(range.value) : null;
    out[plain(a?._id) ?? id] = own ?? (!range.units || range.units === "self" ? itemReach(a) : null);
  }
  return out;
}

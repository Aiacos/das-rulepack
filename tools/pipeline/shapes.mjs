// Declarative value shapes for drafters (the vocabulary file gives them as they are, engine words resolved). One tiny
// vocabulary of shapes, shared by assert.mjs (ASSERT_SHAPES) and draft-keys.mjs (DRAFT_SHAPES); tests build values from every
// shape and have the real validators (assertProblems, the engine's validateEntry) accept them, so a shape cannot drift.
//   { type: "enum", values | engine: "<engine list>", pick? }    one word (`pick`: the typical one)
//   { type: "object", keys: {…required}, optional: {…}, atLeastOne? }   closed keys
//   { type: "list", item }               a non-empty list
//   { type: "idMap", ids: "activity"|"effect", value }   an object keyed by document ids: origins side by side
//   { type: "idList", ids }  { type: "id", ids }   ids of a document kind (taken from the structure file, 16 characters)
//   { type: "oneOf", of: [shape, …] }    any one of the alternatives
//   { type: "tagged", tag, variants: { <word>: object shape } }   an object whose `tag` field picks its other fields
//   { type: "true" }  { type: "number", min? }  { type: "formula" }  { type: "line", max }  { type: "distance" }
//   { type: "facts", facts: { "<fact>": shape }, max }   a trigger's condition (Ruling R30): 1 to `max` of the facts as keys
const freeze = (o) => Object.freeze(o);
export const word = (engine, pick) => freeze({ type: "enum", engine, ...(pick === undefined ? {} : { pick }) });
export const values = (list, pick) => freeze({ type: "enum", values: freeze([...list]), ...(pick === undefined ? {} : { pick }) });
export const object = (keys, optional = {}, extra = {}) => freeze({ type: "object", keys, optional, ...extra });
export const list = (item) => freeze({ type: "list", item });
export const idMap = (ids, value) => freeze({ type: "idMap", ids, value });
export const idList = (ids) => freeze({ type: "idList", ids });
export const id = (ids) => freeze({ type: "id", ids });
export const oneOf = (...of) => freeze({ type: "oneOf", of });
export const tagged = (tag, variants) => freeze({ type: "tagged", tag, variants });
export const facts = (byName, max) => freeze({ type: "facts", facts: byName, max });
export const TRUE = freeze({ type: "true" });
export const NUMBER = freeze({ type: "number" });
export const FORMULA = freeze({ type: "formula" });

/**
 * The shape with every `engine` list replaced by its words (`lists`: name → array or Set); a plain JSON value. An engine list
 * that is not given stays unresolved: it is an error, so a drifting name is seen at once.
 */
export function resolveShape(shape, lists) {
  const go = (s) => {
    if (s.type === "enum" && s.engine !== undefined) {
      if (!lists[s.engine]) throw new Error(`shape: no engine list named ${s.engine}`);
      const { engine, ...rest } = s;
      return { ...rest, values: [...lists[engine]] };
    }
    const out = { ...s };
    for (const f of ["keys", "optional", "variants", "facts"]) {
      if (s[f]) out[f] = Object.fromEntries(Object.entries(s[f]).map(([k, v]) => [k, go(v)]));
    }
    if (s.item) out.item = go(s.item);
    if (s.value) out.value = go(s.value);
    if (s.of) out.of = s.of.map(go);
    return out;
  };
  return go(shape);
}

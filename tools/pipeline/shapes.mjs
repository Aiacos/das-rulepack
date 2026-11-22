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

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const ID16 = /^[A-Za-z0-9]{16}$/;
const WORD = /^[a-z][A-Za-z]{0,23}$/;
// A short formula (assert.mjs isFormula, without its `@` references: a zone key never needs one) and a line.
const FORMULA_CHARS = /^[0-9d +\-*/().]{1,24}$/;
const LINE = /^[\x20-\x7e]+$/;
const asList = (v) => (Array.isArray(v) ? v : v instanceof Set ? [...v] : null);

/**
 * Why `value` does not fit the declarative `shape` (Ruling R33: the drafter's zone keys are checked against their shapes), as
 * problems prefixed with `at`, or []. Own properties only (an inherited name is never a field); an object's keys are closed;
 * an `enum` with `values` is that list; one with `engine` is the engine's list when `vocabulary` gives it, else any word; a
 * number is finite, within `min` and `max`, an integer when `int`; ids are 16 letters and digits; a list is not empty.
 * A `facts` shape is a trigger's condition: an object here, its facts checked by conditions.mjs.
 */
export function shapeProblems(value, shape, { at = "value", vocabulary = {} } = {}) {
  const out = [];
  const go = (v, s, here) => {
    switch (s.type) {
      case "enum": {
        const known = s.values ?? asList(vocabulary[s.engine]);
        if (known ? !known.includes(v) : !(typeof v === "string" && WORD.test(v))) {
          out.push(`${here}: must be ${known ? `one of ${known.join(", ")}` : "a word"}`);
        }
        return;
      }
      case "true": if (v !== true) out.push(`${here}: must be true`); return;
      case "id": if (!(typeof v === "string" && ID16.test(v))) out.push(`${here}: must be an id (16 letters and digits)`); return;
      case "number": {
        const formula = s.formula !== false && typeof v === "string" && FORMULA_CHARS.test(v);
        const ok = formula || (Number.isFinite(v) && (s.min === undefined || v >= s.min) && (s.max === undefined || v <= s.max)
          && (!s.int || Number.isInteger(v)));
        if (!ok) {
          out.push(`${here}: must be ${s.int ? "an integer" : "a number"}${s.min === undefined ? "" : ` from ${s.min}`}`
            + `${s.max === undefined ? "" : ` to ${s.max}`}`);
        }
        return;
      }
      case "formula": case "distance":
        if (!((typeof v === "string" && FORMULA_CHARS.test(v)) || (s.type === "distance" && Number.isFinite(v) && v >= 0))) {
          out.push(`${here}: must be a short formula`);
        }
        return;
      case "line": if (!(typeof v === "string" && LINE.test(v) && v.length <= s.max)) out.push(`${here}: one line`); return;
      case "list":
        if (!Array.isArray(v) || !v.length) { out.push(`${here}: must be a non-empty list`); return; }
        v.forEach((x, i) => go(x, s.item, `${here}[${i}]`));
        return;
      case "idList":
        if (!Array.isArray(v) || !v.length) { out.push(`${here}: must be a non-empty list of ids`); return; }
        v.forEach((x, i) => go(x, { type: "id" }, `${here}[${i}]`));
        return;
      case "idMap":
        if (!isObject(v) || !Object.keys(v).length) { out.push(`${here}: must be an object keyed by ids`); return; }
        for (const k of Object.keys(v)) {
          if (!ID16.test(k)) out.push(`${here}: "${k}" is not an id (16 letters and digits)`);
          go(v[k], s.value, `${here}.${k}`);
        }
        return;
      case "object": {
        if (!isObject(v)) { out.push(`${here}: must be an object`); return; }
        const keys = s.keys ?? {};
        const optional = s.optional ?? {};
        for (const k of Object.keys(v)) {
          if (!Object.hasOwn(keys, k) && !Object.hasOwn(optional, k)) out.push(`${here}.${k}: unknown field`);
        }
        for (const k of Object.keys(keys)) if (!Object.hasOwn(v, k)) out.push(`${here}.${k}: required`);
        if (s.atLeastOne && !Object.keys(v).length) out.push(`${here}: at least one field`);
        for (const k of Object.keys(v)) {
          const sub = Object.hasOwn(keys, k) ? keys[k] : Object.hasOwn(optional, k) ? optional[k] : null;
          if (sub) go(v[k], sub, `${here}.${k}`);
        }
        return;
      }
      case "tagged": {
        if (!isObject(v) || !Object.hasOwn(v, s.tag) || !Object.hasOwn(s.variants, v[s.tag])) {
          out.push(`${here}.${s.tag}: must be one of ${Object.keys(s.variants).join(", ")}`);
          return;
        }
        const { [s.tag]: _, ...rest } = v;
        go(rest, s.variants[v[s.tag]], here);
        return;
      }
      case "oneOf": {
        const tries = s.of.map((alt) => shapeProblems(v, alt, { at: here, vocabulary }));
        if (tries.some((t) => !t.length)) return;
        // The alternative that comes closest says why.
        out.push(...tries.reduce((best, t) => (t.length < best.length ? t : best)));
        return;
      }
      case "facts": if (!isObject(v)) out.push(`${here}: must be an object of facts`); return;
      default: out.push(`${here}: no shape to check it against`);
    }
  };
  go(value, shape, at);
  return out;
}

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

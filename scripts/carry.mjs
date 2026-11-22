/**
 * Ruling R29, fix round 1: a monster rule binds its item to the rule's own identifier (`sources`), so DAS · Core no longer
 * applies its shipped entry under the item's original identifier. The engine keys that rebinding would drop are carried
 * over: the rule names them (`carries: { from, keys }`, decided by the pipeline from the engine's code and data), and their
 * values are taken here, when the pack registers, from the engine's own shipped table (`api.content.builtin`): nothing of the
 * engine is copied into this repository, and the values are those of the engine that runs.
 */

const isObject = value => (value !== null) && (typeof value === "object") && !Array.isArray(value);

/**
 * The table to register, with the carried keys of each rule added from `builtin[carries.from]`. A rule whose carried key the
 * running engine does not ship (any more) is not registered at all: without it the rule would drop engine behaviour.
 * @param {Record<string, object>} table   Identifier (and alias) → entry, as scripts/rules/index.mjs builds it.
 * @param {readonly object[]} rules         The rules (RULES), some with `carries`.
 * @param {Record<string, object>|undefined} builtin  DAS · Core's shipped entries, by identifier.
 * @returns {{table: Record<string, object>, missing: string[]}}  A new table; the identifiers left out.
 */
export function withCarried(table, rules, builtin) {
  const out = { ...table };
  const missing = [];
  for ( const rule of rules ) {
    const carries = rule?.carries;
    if ( !carries ) continue;
    const ids = [rule.identifier, ...(rule.alsoAs ?? [])];
    const source = isObject(builtin) && Object.hasOwn(builtin, carries.from) ? builtin[carries.from] : null;
    const keys = Array.isArray(carries.keys) ? carries.keys : [];
    if ( !isObject(source) || !keys.length || !keys.every(key => Object.hasOwn(source, key)) ) {
      for ( const id of ids ) delete out[id];
      missing.push(rule.identifier);
      continue;
    }
    const carried = Object.fromEntries(keys.map(key => [key, structuredClone(source[key])]));
    for ( const id of ids ) if ( Object.hasOwn(out, id) ) out[id] = { ...out[id], ...carried };
  }
  return { table: out, missing };
}

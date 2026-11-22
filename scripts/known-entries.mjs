/**
 * Ruling R37: a rule whose entry the running DAS · Core refuses (a key newer than that engine, such as `saveAutoFail` on an
 * engine released before it) is left out whole. The engine's own register() validates entry by entry and drops a refused one,
 * but it registers the sources apart: a source would then bind the item to an identifier with no entry, and the engine's own
 * shipped entry for that item would stop applying. So the running engine is asked first (`api.content.validate`, never its
 * version), and a refused rule goes with its aliases and its sources.
 */

/**
 * The table and the sources to register: each rule one of whose identifiers (its own or an alias) has an entry the running
 * engine's `validate` refuses (a non-empty list of errors, or it throws) is left out, with its aliases and every source bound
 * to one of them. An engine without `validate` is not asked: the table goes as it is (its register() validates it).
 * @param {Record<string, object>} table     Identifier (and alias) → entry.
 * @param {readonly object[]} rules           The rules (RULES): `identifier`, `alsoAs`.
 * @param {Record<string, string>} sources    Document id, or `<actor id>.<item id>`, → identifier.
 * @param {Function|undefined} validate       The engine's (`api.content.validate`): a list of errors, empty when valid.
 * @returns {{table: Record<string, object>, sources: Record<string, string>, skipped: string[]}}  New objects; the rules
 *   (by identifier) left out.
 */
export function withKnownEntries(table, rules, sources, validate) {
  const outTable = { ...table };
  const outSources = { ...(sources ?? {}) };
  if ( typeof validate !== "function" ) return { table: outTable, sources: outSources, skipped: [] };
  const refuses = entry => {
    try {
      const errors = validate(entry);
      return !Array.isArray(errors) || (errors.length > 0);
    } catch {
      return true;
    }
  };
  const refused = Object.keys(table).filter(id => refuses(table[id]));
  const skipped = new Set();
  const gone = new Set();
  for ( const id of refused ) {
    const rule = (rules ?? []).find(r => (r?.identifier === id) || (r?.alsoAs ?? []).includes(id));
    skipped.add(rule?.identifier ?? id);
    for ( const x of [id, ...(rule ? [rule.identifier, ...(rule.alsoAs ?? [])] : [])] ) gone.add(x);
  }
  for ( const id of gone ) delete outTable[id];
  for ( const [key, identifier] of Object.entries(outSources) ) if ( gone.has(identifier) ) delete outSources[key];
  return { table: outTable, sources: outSources, skipped: [...skipped].sort() };
}

/**
 * Ruling R35: a monster feature whose embedded item id other creatures share (one id for a bite of hundreds of creatures) is
 * bound to ONE creature's feature by an `<actor id>.<item id>` source. DAS · Core looks that key up before the bare item id,
 * and its `validateSources` accepts it; an older DAS · Core refuses it, and would register the rule's entry under an
 * identifier no item then carries. So the running engine is asked first (`api.content.validateSources`, never its version),
 * and a source it refuses is left out with the rules it binds.
 */

const isActorItem = key => key.split(".").length === 2;

/**
 * The table and the sources to register: every `<actor id>.<item id>` source the running engine's `validateSources` refuses
 * (or cannot be asked about: no such function, or it throws) is left out, and with it each rule whose identifier it binds
 * (the rule's aliases too). A plain document id is never asked about: it is registered as it always was.
 * @param {Record<string, object>} table     Identifier (and alias) → entry.
 * @param {readonly object[]} rules           The rules (RULES): `identifier`, `alsoAs`.
 * @param {Record<string, string>} sources    Document id, or `<actor id>.<item id>`, → identifier.
 * @param {Function|undefined} validateSources  The engine's (`api.content.validateSources`): a list of errors, empty when valid.
 * @returns {{table: Record<string, object>, sources: Record<string, string>, skipped: string[]}}  New objects; the
 *   identifiers left out.
 */
export function withAcceptedSources(table, rules, sources, validateSources) {
  const accepts = (key, identifier) => {
    if ( typeof validateSources !== "function" ) return false;
    try {
      const errors = validateSources({ [key]: identifier });
      return Array.isArray(errors) && !errors.length;
    } catch {
      return false;
    }
  };
  const outSources = {};
  const refused = new Set();
  for ( const [key, identifier] of Object.entries(sources ?? {}) ) {
    if ( !isActorItem(key) || accepts(key, identifier) ) outSources[key] = identifier;
    else refused.add(identifier);
  }
  const outTable = { ...table };
  for ( const identifier of refused ) {
    const rule = (rules ?? []).find(r => r?.identifier === identifier);
    for ( const id of [identifier, ...(rule?.alsoAs ?? [])] ) delete outTable[id];
  }
  return { table: outTable, sources: outSources, skipped: [...refused].sort() };
}

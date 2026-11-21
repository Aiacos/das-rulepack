/**
 * The shape of a rule, and the helper every book module uses to declare its rules.
 *
 * A rule is identified by its English name, its dnd5e identifier and its book and page; the rule text is not copied.
 *
 * @typedef {object} Rule
 * @property {string} identifier  dnd5e identifier of the item the rule acts on (lowercase, hyphens).
 * @property {string} name        English name, as printed.
 * @property {string} book        Book code (the key of the book in docs/books.json). Set by `book()`, not written by hand.
 * @property {number} page        Page in that book.
 * @property {string} kind        What the rule is about: one of KINDS.
 * @property {string} status      How far the rule was checked: one of STATUSES.
 * @property {string} handledIn   "table": the entry registered with DAS · Core is the whole rule. "code": a script does part or
 *                                all of it (named by `code`), with or without an entry.
 * @property {string} adds        One line for the README: what the module adds. Not the rule text.
 * @property {object} [entry]     The DAS content entry registered under `identifier` (keys documented at the top of
 *                                `module/scripts/core/content.mjs` in DAS · Core). Absent for a rule handled in code alone.
 * @property {string} [code]      Path of the script, from the repository root, for a rule handled in code.
 * @property {string} [origin]    Where the rule sits in its book when it is not a spell (subclass and level, creature…).
 * @property {{book: string, page: number}[]} [alsoIn]  Other books that print the same rule.
 * @property {string|null} [catalog]  Kind under which the book's catalogue (docs/books.json) counts this rule, when it differs
 *                                from `kind`; null when the catalogue has no such entry (a creature's trait, for instance).
 * @property {boolean} [inCore]   DAS · Core has an entry under this rule's name, which the progress table already counts in the
 *                                engine's column: the pack's rule completes it, or serves another identifier of the same name.
 * @property {string[]} [alsoAs]  Other identifiers the entry is registered under: an origin's item that names it otherwise.
 * @property {{origin: string, because: string}[]} [uncovered]  Origins whose item the rule does not reach, and why.
 */

/** What a rule is about. */
export const KINDS = Object.freeze(["spell", "feature", "sense"]);

/**
 * How far a rule was checked.
 *  - played: exercised in a running world.
 *  - validated: passes the engine's validator and uses the same building block as a rule that was played; not played itself.
 *  - pending: written for a key that no released DAS · Core knows yet; neither validated by this repository's tests nor played.
 */
export const STATUSES = Object.freeze(["played", "validated", "pending"]);

/** Where a rule is carried out. */
export const HANDLED_IN = Object.freeze(["table", "code"]);

/**
 * Declares the rules of one book.
 * @param {string} code                  Book code, as in docs/books.json.
 * @param {Omit<Rule, "book">[]} rules
 * @returns {readonly Rule[]}
 */
export function book(code, rules) {
  return Object.freeze(rules.map(rule => Object.freeze({ book: code, ...rule })));
}

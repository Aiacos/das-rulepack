// Batch files for reader agents. The tools never call a model: they cut the work into files and ingest what comes back.
// Text is referenced by fingerprint (`textSha`), never embedded, so a batch file is safe to commit.
import { groupBy } from "./registry.mjs";

export const DEFAULT_BATCH_SIZE = 40;

const summary = ({ data, ...item }) => item;
// What a reader needs besides the text: where the entry sits (owner, level, section), its rarity, page and SRD flag, and the
// hint of the rule-based triage (`core-generic`: the engine has a generic entry of that identifier; the text still decides).
const READER_FIELDS = ["owner", "level", "section", "rarity", "page", "srd", "hint"];
const entryOf = (r) => ({
  key: r.key, name: r.name, kind: r.kind, edition: r.edition, textSha: r.text.sha256,
  ...Object.fromEntries(READER_FIELDS.filter((f) => r[f] !== undefined && r[f] !== null).map((f) => [f, r[f]])),
  items: r.items.map(summary)
});

// The highest batch number per book among file names of a folder (`<book>-triage-<NNN>.json`; structure files do not count).
export function highestBatches(files) {
  const highest = {};
  for (const f of files) {
    const m = /^(.+)-triage-(\d+)\.json$/.exec(f);
    if (m) highest[m[1]] = Math.max(highest[m[1]] ?? 0, Number(m[2]));
  }
  return highest;
}

// Records without a verdict (and with text), per book, grouped by kind (only `kind` when given), cut at `size`. The keys of
// `queued` (registry/queue.json: results waiting for a person) are left out: they have no verdict but are not to be read again.
// Ids: <book>-triage-<NNN>; `after` ({ book: highest number in use }) makes the numbering continue, so an id is never reused.
// A record with no matched item in any origin is left out unless `withoutItems`: a reader has nothing to compare its text with.
export function cutBatches(records, options = {}) {
  const { size = DEFAULT_BATCH_SIZE, kind, after = {}, queued = new Set(), withoutItems = false } = options;
  const hasItem = (r) => (r.items ?? []).some((i) => i.match === "matched");
  const open = records.filter((r) => !r.verdict && r.text && (!kind || r.kind === kind) && !queued.has(r.key)
    && (withoutItems || hasItem(r)));
  const batches = [];
  const counts = new Map(Object.entries(after));
  for (const [book, ofBook] of groupBy(open, (r) => r.book.toLowerCase())) {
    for (const ofKind of groupBy(ofBook, (r) => r.kind).values()) {
      for (let i = 0; i < ofKind.length; i += size) {
        const n = (counts.get(book) ?? 0) + 1;
        counts.set(book, n);
        const id = `${book}-triage-${String(n).padStart(3, "0")}`;
        batches.push({ id, stage: "triage", entries: ofKind.slice(i, i + size).map(entryOf) });
      }
    }
  }
  return batches;
}

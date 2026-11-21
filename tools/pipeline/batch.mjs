// Batch files for reader agents. The tools never call a model: they cut the work into files and ingest what comes back.
// Text is referenced by fingerprint (`textSha`), never embedded, so a batch file is safe to commit.
export const DEFAULT_BATCH_SIZE = 40;

const summary = ({ data, ...item }) => item;
const entryOf = (r) => ({
  key: r.key, name: r.name, kind: r.kind, edition: r.edition, textSha: r.text.sha256, items: r.items.map(summary)
});

// Records without a verdict (and with text), per book, grouped by kind, cut at `size`. Ids: <book>-triage-<NNN>.
export function cutBatches(records, { size = DEFAULT_BATCH_SIZE } = {}) {
  const open = records.filter((r) => !r.verdict && r.text);
  const batches = [];
  const counts = new Map();
  for (const [book, ofBook] of Map.groupBy(open, (r) => r.book.toLowerCase())) {
    for (const ofKind of Map.groupBy(ofBook, (r) => r.kind).values()) {
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

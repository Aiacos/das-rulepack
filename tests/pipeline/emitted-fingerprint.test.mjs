import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { monsterIdentifier } from "../../tools/pipeline/identifiers.mjs";
import { inventory } from "../../tools/pipeline/inventory.mjs";
import { runGates } from "../../tools/pipeline/gates.mjs";
import { cacheText } from "../../tools/pipeline/text.mjs";
import {
  emittedFingerprint, evidenceIsCurrent, legacyFingerprint, legacyProblem, saveBook, stateOf
} from "../../tools/pipeline/registry.mjs";
import { generate } from "../../tools/pipeline/generate.mjs";
import { ASSERT } from "./fixtures/assert.mjs";

// Synthetic fixtures only. Fix round 2 of Task 2: what a record emits besides its rule (identifier, sources...) is part of the
// gate evidence, and generate refuses a record whose identifiers fail the identifier checks.
const ACT = "Ac00Ac11Ac22Ac33";
const WOLF = "Wo00Wo11Wo22Wo33";
const BITE = "Bi00Bi11Bi22Bi33";
const core = { version: "9.9.9", facts: [], vocabulary: new Set(), identifiers: new Set(), validateEntry: () => [] };

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "emit-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

// A ruled monster feature, gated under its scoped identifier with its source bound.
function gatedWolf() {
  const textDir = join(dir, "text");
  const feature = { name: "Bite", kind: "monster", owner: "Dire Wolf", section: "action", book: "TST", page: 9,
    edition: "2024", srd: false, text: "the wolf bites", creatureIndex: 0 };
  const actors = [{ id: WOLF, name: "Dire Wolf", items: [{
    origin: "official", docId: `${WOLF}.${BITE}`, identifier: "bite", name: "Bite", type: "weapon", rules: "2024",
    activities: [{ id: ACT, type: "attack", damageTypes: [] }], effects: [], data: "a".repeat(64)
  }] }];
  const run = (previous) => inventory({ book: "TST", kind: "monster", dataset: [feature],
    dumps: { official: [], "ddb-importer": [], actors }, textDir, previous }).records;
  const ruled = run([]).map((r) => ({ ...r, identifier: monsterIdentifier(r), verdict: "entry",
    rule: { handledIn: "table", assert: ASSERT, adds: "x", entry: { triggers: [{ fromActivity: ACT }] },
        origins: ["official"] } }));
  const [record] = run(ruled);
  cacheText(textDir, "the wolf bites");
  const { failures, updated } = runGates([record], { core, documents: {}, textDir, ci: false, legacy: new Map() });
  expect(failures).toEqual({});
  return updated[0];
}

describe("the gate evidence covers what the record emits", () => {
  it("the reviewer's scenario: gated, then identifier and sources edited to the bare name: not gated, and generate refuses",
    () => {
      const wolf = gatedWolf();
      expect(wolf.sources).toEqual({ [BITE]: "tst-dire-wolf-bite" });
      expect(stateOf(wolf)).toBe("gated");
      expect(wolf.evidence.gates.emits).toBe(emittedFingerprint(wolf));
      const edited = { ...wolf, identifier: "bite", sources: { [BITE]: "bite" } };
      expect(evidenceIsCurrent(edited, edited.evidence.gates)).toBe(false);
      expect(stateOf(edited)).not.toBe("gated");
      const registry = join(dir, "registry");
      saveBook(registry, { book: "TST", records: [edited] });
      expect(() => generate({ registry, out: join(dir, "rules"), check: true })).toThrow(/tst-dire-wolf-bite/);
    });

  it("a change of sources alone, name, page or alsoIn makes the evidence stale; note and order do not", () => {
    const wolf = gatedWolf();
    for (const over of [{ sources: {} }, { name: "Big Bite" }, { page: 10 }, { alsoIn: [{ book: "TSU", page: 2 }] }]) {
      expect(stateOf({ ...wolf, ...over })).toBe("drafted");
    }
    for (const over of [{ note: "a comment" }, { order: 3 }]) expect(stateOf({ ...wolf, ...over })).toBe("gated");
  });

  it("evidence written before the fingerprint existed is stale", () => {
    const wolf = gatedWolf();
    const { emits, ...old } = wolf.evidence.gates;
    expect(stateOf({ ...wolf, evidence: { ...wolf.evidence, gates: old } })).toBe("drafted");
  });
});

describe("legacy records", () => {
  it("their legacy fingerprint already covers the identifier: an edit loses standing and generate refuses", () => {
    const r = {
      key: "tst:spell:glimmer-bolt", name: "Glimmer Bolt", kind: "spell", book: "TST", page: 3, edition: "2024", text: null,
      identifier: "glimmer-bolt", items: [], verdict: "entry", legacy: true, legacyStatus: "validated", evidence: {},
      rule: { handledIn: "table", assert: ASSERT, adds: "x", entry: { triggers: [] }, origins: ["ddb-importer"] }
    };
    const legacy = new Map([[r.key, legacyFingerprint(r)]]);
    const edited = { ...r, identifier: "longsword" };
    expect(legacyProblem(r, legacy)).toBeNull();
    expect(legacyProblem(edited, legacy)).toMatch(/changed since migration/);
    const registry = join(dir, "registry");
    saveBook(registry, { book: "TST", records: [edited] });
    writeFileSync(join(registry, "legacy.json"), JSON.stringify(Object.fromEntries(legacy)));
    expect(() => generate({ registry, out: join(dir, "rules"), check: true })).toThrow(/changed since migration/);
  });
});

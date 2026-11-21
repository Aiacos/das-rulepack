import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cutBatches, highestBatches } from "../../tools/pipeline/batch.mjs";
import { saveBook } from "../../tools/pipeline/registry.mjs";
import { itemSummary } from "../../tools/pipeline/dumps.mjs";

// Synthetic fixtures only: invented entries.
const sha = (n) => String(n).padStart(64, "0");
const rec = (n, over = {}) => ({
  key: `tst:spell:s${String(n).padStart(2, "0")}`, name: `Spell ${n}`, kind: "spell", book: "TST", page: n, edition: "2024",
  identifier: `s${n}`, text: { sha256: sha(n), source: "5etools", chars: 5 }, verdict: null, evidence: {},
  items: [{
    origin: "official", match: "matched", identifier: `s${n}`, docId: "Dd00Cc11Bb22Aa33", activities: [], effects: [],
    data: { sha256: "h" }
  }],
  ...over
});

describe("cutBatches", () => {
  it("references text by fingerprint and drops item data", () => {
    const [b] = cutBatches([rec(1)], {});
    expect(b).toEqual({
      id: "tst-triage-001", stage: "triage",
      entries: [{
        key: "tst:spell:s01", name: "Spell 1", kind: "spell", edition: "2024", textSha: sha(1), page: 1,
        items: [{ origin: "official", match: "matched", identifier: "s1", docId: "Dd00Cc11Bb22Aa33", activities: [], effects: [] }]
      }]
    });
  });

  it("skips records with a verdict and records without text", () => {
    const out = cutBatches([rec(1, { verdict: "none" }), rec(2, { text: null }), rec(3)], {});
    expect(out.flatMap((b) => b.entries.map((e) => e.key))).toEqual(["tst:spell:s03"]);
  });

  it("groups by kind, cuts at the size and numbers the batches in sequence", () => {
    const records = [rec(1), rec(2, { kind: "feat", key: "tst:feat:s02" }), rec(3), rec(4), rec(5)];
    const out = cutBatches(records, { size: 2 });
    expect(out.map((b) => [b.id, b.entries.map((e) => e.kind), b.entries.length])).toEqual([
      ["tst-triage-001", ["spell", "spell"], 2], ["tst-triage-002", ["spell", "spell"], 2],
      ["tst-triage-003", ["feat"], 1]
    ]);
  });

  it("uses a default size of 40 and returns nothing when there is nothing to triage", () => {
    expect(cutBatches(Array.from({ length: 41 }, (_, i) => rec(i + 1)), {}).map((b) => b.entries.length)).toEqual([40, 1]);
    expect(cutBatches([], {})).toEqual([]);
  });

  it("counts per book: a and a-b do not share a counter", () => {
    const out = cutBatches([
      rec(1, { book: "A" }), rec(2, { book: "A-B", key: "a-b:spell:s02" }), rec(3, { book: "A", kind: "feat" })
    ], {});
    expect(out.map((b) => b.id)).toEqual(["a-triage-001", "a-triage-002", "a-b-triage-001"]);
  });

  it("keeps the books apart", () => {
    const out = cutBatches([rec(1), rec(2, { book: "XYZ", key: "xyz:spell:s02" })], {});
    expect(out.map((b) => b.id)).toEqual(["tst-triage-001", "xyz-triage-001"]);
  });
});

describe("cutBatches: reader fields, kind filter, numbering", () => {
  it("adds owner, level, section, rarity, page and srd to an entry when the record has them, and item differences", () => {
    const r = rec(1, {
      kind: "monster", owner: "Invented Beast", level: 3, section: "action", rarity: "rare", srd: true,
      items: [{
        origin: "official", match: "matched", docId: "a.b", activities: [], effects: [], differences: ["section"],
        data: { sha256: "h" }
      }]
    });
    const [e] = cutBatches([r], {})[0].entries;
    expect(e).toMatchObject({ owner: "Invented Beast", level: 3, section: "action", rarity: "rare", page: 1, srd: true });
    expect(e.items[0].differences).toEqual(["section"]);
    expect(e.items[0]).not.toHaveProperty("data");
    expect(Object.keys(cutBatches([rec(2)], {})[0].entries[0])).not.toContain("owner");
  });

  it("filters by kind and keeps grouping by kind without the filter", () => {
    const records = [rec(1), rec(2, { kind: "feat", key: "tst:feat:s02" })];
    expect(cutBatches(records, { kind: "feat" }).map((b) => [b.id, b.entries.map((e) => e.kind)])).toEqual([
      ["tst-triage-001", ["feat"]]
    ]);
    expect(cutBatches(records, {}).map((b) => b.entries[0].kind)).toEqual(["spell", "feat"]);
  });

  it("continues numbering after the highest existing batch of the book and never reuses an id", () => {
    expect(highestBatches(["tst-triage-001.json", "tst-triage-007.json", "a-b-triage-004.json", "tst-triage-003.structure.json",
      "notes.txt"])).toEqual({ tst: 7, "a-b": 4 });
    const out = cutBatches([rec(1), rec(2)], { size: 1, after: { tst: 7 } });
    expect(out.map((b) => b.id)).toEqual(["tst-triage-008", "tst-triage-009"]);
  });
});

describe("pipeline CLI: batch", () => {
  let tmp, registry, out;
  const run = (args) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], {
    encoding: "utf8", env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry }
  });
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "batch-"));
    registry = join(tmp, "registry");
    out = join(tmp, "out");
    saveBook(registry, { book: "TST", records: [rec(1), rec(2), rec(3, { text: null })] });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("writes one file per batch, named after the batch id", () => {
    const r = run(["batch", "triage", "TST", "--out", out, "--size", "1"]);
    expect(r.status).toBe(0);
    expect(readdirSync(out).sort()).toEqual(["tst-triage-001.json", "tst-triage-002.json"]);
    const b = JSON.parse(readFileSync(join(out, "tst-triage-002.json"), "utf8"));
    expect(b.id).toBe("tst-triage-002");
    expect(b.entries.map((e) => e.key)).toEqual(["tst:spell:s02"]);
    expect(r.stdout).toContain("2 batches");
    expect(run(["batch", "triage", "tst", "--out", join(tmp, "lower")]).status).toBe(0);
    expect(readdirSync(join(tmp, "lower"))).toEqual(["tst-triage-001.json"]);
  });

  it("continues numbering when --out already holds batches, and filters with --kind", () => {
    expect(run(["batch", "triage", "TST", "--out", out, "--size", "1"]).status).toBe(0);
    expect(run(["batch", "triage", "TST", "--out", out]).status).toBe(0);
    expect(readdirSync(out).sort()).toEqual(["tst-triage-001.json", "tst-triage-002.json", "tst-triage-003.json"]);
    expect(run(["batch", "triage", "TST", "--out", join(tmp, "k"), "--kind", "feat"]).stdout).toContain("0 batches");
    expect(run(["batch", "triage", "TST", "--out", join(tmp, "k"), "--kind", "nope"]).status).toBe(2);
  });

  it("is a usage error without --out, with an unknown stage or a bad size", () => {
    for (const args of [["batch", "triage", "TST"], ["batch", "draft", "TST", "--out", out], ["batch"],
      ["batch", "triage", "TST", "--out", out, "--size", "0"], ["batch", "triage", "NOPE", "--out", out],
      ["batch", "triage", "T-1", "--out", out]]) {
      expect(run(args).status, args.join(" ")).toBe(2);
    }
  });
});

describe("pipeline CLI: batch --structure", () => {
  const MARK = "ZZMARKERZZ";
  let tmp, registry, out, dumps, priv;
  const run = (args, env = {}) => spawnSync("node", ["tools/pipeline/cli.mjs", ...args], {
    encoding: "utf8", env: { PATH: process.env.PATH, RULEPACK_REGISTRY: registry, RULEPACK_DUMPS: dumps, ...env }
  });
  const item = (docId, over = {}) => ({
    origin: "official", match: "matched", identifier: "x", docId, activities: [], effects: [], data: { sha256: "h" }, ...over
  });
  const spell = {
    _id: "Aa00Bb11Cc22Dd33", name: "Invented", type: "spell", effects: [],
    system: {
      level: 1, description: { value: `<p>${MARK}</p>` },
      activities: { aaaaaaaaaaaaaaaa: { type: "attack", activation: { type: "action" } } }
    }
  };
  const claw = {
    _id: "It00Bb11Cc22Dd33", name: "Claw", type: "feat", effects: [],
    system: { activities: { bbbbbbbbbbbbbbbb: { type: "attack" } } }
  };
  const actor = { _id: "Ac00Bb11Cc22Dd33", name: "Invented Beast", type: "npc", items: [claw] };
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "batch-struct-"));
    registry = join(tmp, "registry");
    out = join(tmp, "out");
    dumps = join(tmp, "dumps");
    priv = join(tmp, "private");
    mkdirSync(dumps);
    writeFileSync(join(dumps, "dnd-players-handbook.spells.json"), JSON.stringify([spell]));
    writeFileSync(join(dumps, "dnd-monster-manual.actors.json"), JSON.stringify([actor]));
    saveBook(registry, { book: "XPHB", records: [
      rec(1, {
        book: "XPHB", key: "xphb:spell:s01",
        items: [
          // The document is found by id and data fingerprint, as inventory recorded it.
          item("Aa00Bb11Cc22Dd33", { data: { sha256: itemSummary(spell, "official").data } }),
          item("Zz00Bb11Cc22Dd33", { origin: "ddb-importer" }),
          item("-", { origin: "plutonium", match: "absent" })
        ]
      }),
      rec(2, { book: "XPHB", key: "xphb:spell:s02", items: [item("Nn00Bb11Cc22Dd33", { match: "absent" })] })
    ] });
    saveBook(registry, { book: "XMM", records: [
      rec(3, {
        book: "XMM", key: "xmm:monster:invented-beast/action/claw", kind: "monster",
        items: [item("Ac00Bb11Cc22Dd33.It00Bb11Cc22Dd33", { data: { sha256: itemSummary(claw, "official").data } })]
      })
    ] });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("writes <batch id>.structure.json for matched origins only, with no text", () => {
    const r = run(["batch", "triage", "XPHB", "--out", out, "--structure", priv]);
    expect(r.status, r.stderr).toBe(0);
    expect(readdirSync(priv)).toEqual(["xphb-triage-001.structure.json"]);
    const raw = readFileSync(join(priv, "xphb-triage-001.structure.json"), "utf8");
    const file = JSON.parse(raw);
    expect(raw).not.toContain(MARK);
    expect(file.batch).toBe("xphb-triage-001");
    expect(Object.keys(file.entries)).toEqual(["xphb:spell:s01"]);
    expect(file.entries["xphb:spell:s01"].official).toMatchObject({
      level: 1, activities: [{ id: "aaaaaaaaaaaaaaaa", type: "attack" }]
    });
    expect(file.entries["xphb:spell:s01"]["ddb-importer"]).toBeNull();
    expect(file.entries["xphb:spell:s01"]).not.toHaveProperty("plutonium");
    expect(readdirSync(out)).toEqual(["xphb-triage-001.json"]);
  });

  it("reads the embedded item of an actor for a monster feature", () => {
    const r = run(["batch", "triage", "XMM", "--out", out, "--structure", priv]);
    expect(r.status, r.stderr).toBe(0);
    const file = JSON.parse(readFileSync(join(priv, "xmm-triage-001.structure.json"), "utf8"));
    expect(file.entries["xmm:monster:invented-beast/action/claw"].official.activities[0].id).toBe("bbbbbbbbbbbbbbbb");
  });

  it("refuses a structure folder inside the repository or the registry, also through a symlink, and writes nothing", () => {
    const link = join(tmp, "link");
    symlinkSync(process.cwd(), link);
    const inside = [
      join(process.cwd(), "private-structure"), join(link, "private-structure"), join(registry, "s"), out, join(out, "s")
    ];
    for (const dir of inside) {
      const r = run(["batch", "triage", "XPHB", "--out", out, "--structure", dir]);
      expect(r.status, dir).toBe(2);
      expect(r.stderr).toContain("--structure");
      expect(existsSync(dir), dir).toBe(false);
    }
    expect(existsSync(out)).toBe(false);
  });

  it("needs RULEPACK_DUMPS and a value", () => {
    const r = run(["batch", "triage", "XPHB", "--out", out, "--structure", priv], { RULEPACK_DUMPS: "" });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("RULEPACK_DUMPS");
    expect(run(["batch", "triage", "XPHB", "--out", out, "--structure"]).status).toBe(2);
  });
});

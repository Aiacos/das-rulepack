import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { plainText, plainTextV1, textFingerprint } from "../../tools/pipeline/text.mjs";
import { readMonsters } from "../../tools/pipeline/monsters.mjs";
import { inventory } from "../../tools/pipeline/inventory.mjs";

// Synthetic fixtures only: invented creatures and attacks.
describe("plainText renders attack and save tags", () => {
  it("renders {@atkr m} and {@hit 7} as a melee attack header and +7", () => {
    expect(plainText(["{@atkr m} {@hit 7}, reach 5 ft."])).toBe("Melee Attack Roll: +7, reach 5 ft.");
    expect(plainText(["{@atkr m,r} {@hit 4}"])).toBe("Melee or Ranged Attack Roll: +4");
    expect(plainText(["{@atk mw} {@hit 5} to hit"])).toBe("Melee Weapon Attack: +5 to hit");
    expect(plainText(["{@atk rs}"])).toBe("Ranged Spell Attack:");
    expect(plainText(["{@atk mw,rw}"])).toBe("Melee or Ranged Weapon Attack:");
  });

  it("renders {@h} as Hit: and {@m} as Miss:", () => {
    expect(plainText(["{@atkr r} {@hit 3}. {@h}6 ({@damage 1d8 + 2}) piercing. {@m}Half."])).toBe(
      "Ranged Attack Roll: +3. Hit:6 (1d8 + 2) piercing. Miss:Half."
    );
  });

  it("renders recharge and save tags", () => {
    expect(plainText(["{@recharge 5}"])).toBe("(Recharge 5–6)");
    expect(plainText(["{@recharge}"])).toBe("(Recharge 6)");
    expect(plainText(["{@dc 14}"])).toBe("DC 14");
    expect(plainText(["{@actSave wis} {@actSaveFail} x {@actSaveSuccess} y {@actSaveSuccessOrFail} z"])).toBe(
      "Wisdom Saving Throw: Failure: x Success: y Failure or Success: z"
    );
    expect(plainText(["{@actTrigger} a {@actResponse} b"])).toBe("Trigger: a Response: b");
  });

  it("renders {@actSaveFailBy N} and guards empty or odd arguments", () => {
    expect(plainText(["{@actSaveFailBy 5} x"])).toBe("Failure by 5 or More: x");
    expect(plainText(["{@recharge oops}"])).toBe("(Recharge)");
    expect(plainText(["a {@hit} b {@dc} c"])).toBe("a b c");
  });

  it("leaves unknown tags as their first argument", () => {
    expect(plainText(["{@condition Prone|XPHB} and {@spell fire bolt|XYZ|bolt}"])).toBe("Prone and fire bolt");
    expect(plainText(["{@atkr q}"])).toBe("q");
  });

  it("plainTextV1 is unchanged", () => {
    expect(plainTextV1(["{@atkr m} {@hit 7}, {@h}6 {@dc 12} {@recharge 5}"])).toBe("m 7, 6 12 5");
  });
});

describe("inventory and a renderer-only change", () => {
  let root, textDir;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "attack-"));
    textDir = join(root, "text");
    mkdirSync(join(root, "bestiary"), { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const writeBestiary = (entries) => writeFileSync(join(root, "bestiary", "bestiary-tzz.json"), JSON.stringify({
    monster: [{ name: "Moss Hare", source: "TZZ", page: 3, action: [{ name: "Nip", entries }] }]
  }));
  const run = (previous) => inventory({
    book: "TZZ", kind: "monster", dataset: readMonsters(root, "TZZ", {}).features, textDir, previous,
    dumps: { official: [], "ddb-importer": [] }
  });
  const verdicted = (records) => records.map((r) => ({
    ...r, verdict: "entry", evidence: { gates: { at: "2026-11-01", rule: "x" } }
  }));
  const oldText = "m 7, reach 5 ft. 6 piercing.";

  it("counts a header-only change as rerendered without textChangedAt", () => {
    writeBestiary(["{@atkr m} {@hit 7}, reach 5 ft. {@h}6 piercing."]);
    const first = run([]).records;
    // The registry as written by the old renderer: its fingerprint is that of the V1 text of the same entries.
    const stored = verdicted(first).map((r) => ({
      ...r, text: { ...r.text, sha256: textFingerprint("m 7, reach 5 ft. 6 piercing.") }
    }));
    const { records, report } = run(stored);
    expect(report.rerendered).toEqual([records[0].key]);
    expect(report.textChanged).toEqual([]);
    expect(records[0].textChangedAt).toBeUndefined();
    expect(records[0].evidence.gates).toBeDefined();
    expect(records[0].text.sha256).toBe(first[0].text.sha256);
  });

  it("still dates a change of words", () => {
    writeBestiary(["{@atkr m} {@hit 7}, reach 5 ft. {@h}6 piercing."]);
    const first = run([]).records;
    const stored = verdicted(first).map((r) => ({ ...r, text: { ...r.text, sha256: textFingerprint(oldText + " Other.") } }));
    const { records, report } = run(stored);
    expect(report.textChanged).toEqual([records[0].key]);
    expect(report.rerendered).toEqual([]);
    expect(records[0].textChangedAt).toBeTypeOf("string");
    expect(records[0].evidence.gates).toBeUndefined();
  });

  it("keeps textV1 out of the records", () => {
    writeBestiary(["{@atkr m} {@hit 7}, reach 5 ft."]);
    const { records } = run([]);
    expect(JSON.stringify(records)).not.toContain("textV1");
  });

  it("dates a change of words made together with a renderer change", () => {
    writeBestiary(["{@atkr m} {@hit 7}, reach 10 ft. {@h}6 piercing."]);
    const first = run([]).records;
    // Stored: the old rendering of the OLD words (reach 5 ft.).
    const stored = verdicted(first).map((r) => ({ ...r, text: { ...r.text, sha256: textFingerprint(oldText) } }));
    const { records, report } = run(stored);
    expect(report.textChanged).toEqual([records[0].key]);
    expect(report.rerendered).toEqual([]);
    expect(records[0].textChangedAt).toBeTypeOf("string");
  });
});

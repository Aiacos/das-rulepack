// The static scan of DAS · Core for the identifiers it handles outside its content table (core-scan.mjs). Synthetic engine
// files only: invented identifiers and invented code, written to a temporary folder; the real engine is read only by the last
// block, skipped without DAS_CORE.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  isIdentifierWord, readEngineScripts, scanRuntime, scanSystemHandled
} from "../../tools/pipeline/core-scan.mjs";
import { loadCore } from "../../tools/pipeline/core.mjs";

const file = (path, ...lines) => ({ path, source: lines.join("\n") });
const ids = (map) => [...map.keys()].sort();
const where = (map, id) => (map.get(id) ?? []).map((a) => `${a.file}:${a.line}`);

describe("isIdentifierWord", () => {
  it("takes kebab-case words, and single words of letters only", () => {
    for (const w of ["glow-ward", "rage", "x2-step", "a-b-c"]) expect(isIdentifierWord(w), w).toBe(true);
    for (const w of ["Glow", "glow_ward", "glow.ward", "dnd5eactivity000", "", "-a", "a--b", "x".repeat(65), "123"]) {
      expect(isIdentifierWord(w), w).toBe(false);
    }
  });
});

describe("scanRuntime", () => {
  it("compare: an identifier expression tested with === against a literal, either side", () => {
    const found = scanRuntime([file("adapter/a.mjs",
      "export function a(actor) {",
      "  if ( actor.items.some(i => identifierOf(i).id === \"moon-step\") ) return 1;",
      "  if ( \"star-hop\" === identifierOf(actor.item)?.id ) return 2;",
      "  if ( item.system?.identifier === \"ember-kit\" ) return 3;",
      "  const { identifier } = contentOf(item);",
      "  return identifier === \"tide-call\";",
      "}")]);
    expect(ids(found)).toEqual(["ember-kit", "moon-step", "star-hop", "tide-call"]);
    expect(where(found, "moon-step")).toEqual(["adapter/a.mjs:2"]);
    expect(found.get("moon-step")[0].rule).toBe("compare");
  });

  it("compare: never !==, never a literal compared with something else, never a non-identifier literal", () => {
    const found = scanRuntime([file("adapter/b.mjs",
      "export function b(item, activity) {",
      "  if ( identifierOf(item).id !== \"hold-glow\" ) return 0;",
      "  if ( activity.type === \"area-shape\" ) return 1;",
      "  if ( game.settings.get(MODULE_ID, \"show-glow\") === \"on-hit\" ) return 2;",
      "  if ( typeof identifierOf(item).id === \"string\" ) return 3;",
      "  return identifierOf(item).id === \"Glow Ward\";",
      "}")]);
    expect(ids(found)).toEqual([]);
  });

  it("compare: a name bound to an identifier holds only until the next top-level declaration", () => {
    const found = scanRuntime([file("runtime/c.mjs",
      "function c(item) {",
      "  const used = identifierOf(item).id;",
      "  const { id: own } = identifierOf(item);",
      "  return used === \"quick-ward\" || own === \"slow-ward\";",
      "}",
      "function d(used) {",
      "  return used === \"not-this-one\";",
      "}")]);
    expect(ids(found)).toEqual(["quick-ward", "slow-ward"]);
  });

  it("compare: a constant of the file, or imported, that holds a literal", () => {
    const found = scanRuntime([
      file("core/k.mjs", "export const GLOW = \"glow-sense\";",
        "export const SIGHT = Object.freeze({ identifier: \"far-sight\" });"),
      file("adapter/k.mjs",
        "import { GLOW, SIGHT } from \"../core/k.mjs\";",
        "const LOCAL = \"near-sense\";",
        "export const k = item => (identifierOf(item).id === GLOW) || (identifierOf(item).id === LOCAL)",
        "  || (identifierOf(item).id === SIGHT.identifier);")
    ]);
    expect(ids(found)).toEqual(["far-sight", "glow-sense", "near-sense"]);
    expect(where(found, "glow-sense")).toEqual(["adapter/k.mjs:3"]);
  });

  it("member: a literal array, Set or object the code tests an identifier against", () => {
    const found = scanRuntime([
      file("core/m.mjs", "export const LIST = Object.freeze([\"gale-cut\", \"gale-rush\"]);"),
      file("adapter/m.mjs",
        "import { LIST } from \"../core/m.mjs\";",
        "const KNOWN = new Set([\"fen-walk\", \"bog-step\"]);",
        "const TABLE = { \"ash-cloak\": 1, \"ash-mask\": 2 };",
        "const STYLES = [\"glow-panel\", \"glow-card\"];",
        "export function m(item) {",
        "  const id = identifierOf(item).id;",
        "  if ( KNOWN.has(id) ) return 1;",
        "  if ( LIST.includes(identifierOf(item).id) ) return 2;",
        "  if ( [\"inline-one\"].includes(id) ) return 4;",
        "  return TABLE[id] ?? STYLES.length;",
        "}")
    ]);
    expect(ids(found)).toEqual(["ash-cloak", "ash-mask", "bog-step", "fen-walk", "gale-cut", "gale-rush", "inline-one"]);
    expect(found.get("fen-walk")[0]).toMatchObject({ file: "adapter/m.mjs", line: 7, rule: "member" });
  });

  it("collection: a Set made of the items' identifiers, tested with a literal directly or through a helper", () => {
    const found = scanRuntime([file("adapter/n.mjs",
      "export function n(actor) {",
      "  const identifiers = new Set(actor.items.map(i => identifierOf(i).id));",
      "  const has = identifier => identifiers.has(identifier);",
      "  if ( has(\"twin-fang\") ) return 3;",
      "  return identifiers.has(\"lone-fang\") ? 2 : 1;",
      "}")]);
    expect(ids(found)).toEqual(["lone-fang", "twin-fang"]);
    expect(found.get("twin-fang")[0]).toMatchObject({ line: 4, rule: "collection" });
  });

  it("param: a function called with an identifier gets its first parameter tested", () => {
    const found = scanRuntime([
      file("core/p.mjs",
        "export const ROPES = Object.freeze([\"rope-walk\", \"vine-walk\"]);",
        "export function climbs(identifier, entry=null) {",
        "  return ROPES.includes(identifier) || (entry?.climbs === true);",
        "}",
        "export function other(identifier) {",
        "  return identifier === \"never-called\";",
        "}"),
      file("adapter/p.mjs", "import { climbs } from \"../core/p.mjs\";",
        "export const q = item => climbs(identifierOf(item).id, null);")
    ]);
    expect(ids(found)).toEqual(["rope-walk", "vine-walk"]);
    expect(found.get("rope-walk")[0]).toMatchObject({ file: "core/p.mjs", line: 3, rule: "param" });
  });

  it("fact: a feature an entry's condition asks for, in the content files", () => {
    const found = scanRuntime([file("content/f.mjs",
      "const strike = improved => ({ on: \"preDamageRoll\", if: improved ? { \"source.hasFeature\": \"sharper-edge\" }",
      "  : { \"target.hasFeature\": \"thick-hide\" } });",
      "const option = { \"source.hasClassFeature\": { id: \"keen-mind\", class: \"sage\" } };",
      "const effect = { \"target.hasEffectFrom\": \"marked-prey\" };")]);
    expect(ids(found)).toEqual(["keen-mind", "sharper-edge", "thick-hide"]);
    expect(found.get("sharper-edge")[0].rule).toBe("fact");
  });

  it("skips the content table itself and every kebab-case literal that is not tested as an identifier", () => {
    const found = scanRuntime([
      file("content/index.mjs", "export const SHIPPED = { \"in-table\": {} };"),
      // The engine's diagnostics and test scenarios name identifiers to clean up or set up, not to play them.
      file("runtime/diagnostic/clean.mjs", "export const c = item => identifierOf(item).id === \"old-copy\";"),
      file("runtime/testing-moves.mjs", "export const t = item => identifierOf(item).id === \"test-step\";"),
      file("ui/u.mjs",
        "const CLASSES = [\"das-panel\", \"das-card\"];",
        "export function u(html) {",
        "  html.classList.add(\"das-panel\");",
        "  Hooks.on(\"render-thing\", () => game.i18n.localize(\"some-key\"));",
        "  return CLASSES.includes(html.className);",
        "}")
    ]);
    expect(ids(found)).toEqual([]);
  });
});

describe("scanRuntime on large files", () => {
  // Two patterns once took the scan of the real engine to 45 s: an array of strings followed by no `.includes`, and a
  // lookbehind of variable length over long runs of blanked comments.
  it("stays fast on a long array of strings and a long comment", () => {
    const strings = Array.from({ length: 400 }, (_, i) => `"word-${i}"`).join(", ");
    const comment = `/*${" x".repeat(20000)} */`;
    const big = file("core/big.mjs", comment, `export const BIG = [${strings}];`,
      "export const f = item => identifierOf(item).id === \"after-all\";");
    const start = Date.now();
    expect(ids(scanRuntime([big]))).toEqual(["after-all"]);
    expect(Date.now() - start).toBeLessThan(2000);
  });
});

describe("scanSystemHandled", () => {
  it("note: a content comment that says the system does it, naming the identifier in backticks", () => {
    const found = scanSystemHandled([file("content/s.mjs",
      "/**",
      " * Les pas, module premium `step-pack` 2.0 (pack `origins`).",
      " * Ce que dnd5e fait déjà seul : Pas lourd, Œil vif.",
      " * L'item du SRD de dnd5e (`quiet-step`) porte lui-même un effet (changement `damage`, condition `item.kind`) : aucune",
      " * entrée sous ce nom, sinon le bonus compterait deux fois. Voir aussi `loud-step`, qui a une entrée.",
      " */",
      "export const S = Object.freeze({",
      "  \"blur-step\": stepper(\"x\"),   // pas `soft-step` (dnd5e le fait seul)",
      "  \"loud-step\": { triggers: [] }",
      "});")]);
    expect(ids(found)).toEqual(["quiet-step", "soft-step"]);
    expect(found.get("quiet-step")[0]).toMatchObject({ file: "content/s.mjs", line: 4, rule: "note" });
    expect(where(found, "soft-step")).toEqual(["content/s.mjs:8"]);
  });

  it("list: a literal list whose comment says the system handles its identifiers", () => {
    const found = scanSystemHandled([file("content/l.mjs",
      "/** Ce que dnd5e fait seul, par les effets transférés : aucune entrée. */",
      "export const BY_SYSTEM = Object.freeze([\"warm-hide\", \"cold-hide\"]);",
      "/** Les sorts qui changent de taille. */",
      "export const SIZES = Object.freeze([\"grow-big\"]);")]);
    expect(ids(found)).toEqual(["cold-hide", "warm-hide"]);
    expect(found.get("warm-hide")[0]).toMatchObject({ line: 2, rule: "list" });
  });

  it("marker: an entry whose value is null or an empty object", () => {
    const found = scanSystemHandled([file("content/z.mjs",
      "export const Z = Object.freeze({",
      "  \"idle-hands\": null,",
      "  \"empty-hands\": {},",
      "  \"busy-hands\": { busy: true }",
      "});")]);
    expect(ids(found)).toEqual(["empty-hands", "idle-hands"]);
    expect(found.get("idle-hands")[0].rule).toBe("marker");
  });

  it("reads the content files only, never the engine's other comments", () => {
    const found = scanSystemHandled([file("core/x.mjs",
      "// L'item (`grim-step`) : dnd5e le fait seul, aucune entrée.", "export const X = 1;")]);
    expect(ids(found)).toEqual([]);
  });
});

describe("readEngineScripts and loadCore on a synthetic engine", () => {
  let dir;
  const put = (path, text) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "core-scan-"));
    put("module/scripts/adapter/a.mjs", "export const a = item => identifierOf(item).id === \"moon-step\";\n");
    put("module/scripts/content/s.mjs", "// pas `soft-step` (dnd5e le fait seul)\nexport const S = {};\n");
    put("module/scripts/notes.txt", "identifierOf(item).id === \"not-a-script\"");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads every .mjs under module/scripts with its path relative to it", () => {
    expect(readEngineScripts(dir).map((f) => f.path)).toEqual(["adapter/a.mjs", "content/s.mjs"]);
  });
});

const CORE_DIR = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/content.mjs"))
  ? process.env.DAS_CORE : null;

describe.skipIf(!CORE_DIR)("with the real DAS · Core", () => {
  let core;
  beforeAll(async () => { core = await loadCore(CORE_DIR); });

  it("finds identifiers its runtime code recognises outside the content table", () => {
    // Read in the engine: the attack budget (adapter/turn.mjs), Two-Weapon Fighting (runtime/basics.mjs), the Bard's die
    // (adapter/inspiration.mjs), the ceiling walkers (core/climb.mjs), Guidance (adapter/skill-aid.mjs), and an improved
    // feature an entry asks for (content/cleric.mjs).
    for (const id of ["thirsting-blade", "devouring-blade", "extra-attack", "two-weapon-fighting", "bardic-inspiration",
      "slippers-of-spider-climbing", "guidance", "improved-blessed-strikes"]) {
      expect(core.runtimeIdentifiers.has(id), id).toBe(true);
    }
    const [at] = core.runtimeIdentifiers.get("devouring-blade");
    expect(at.file).toBe("adapter/turn.mjs");
    expect(at.line).toBeGreaterThan(0);
  });

  it("finds what its content notes leave to the system", () => {
    expect(core.systemHandled.has("potent-spellcasting")).toBe(true);
    expect(core.systemHandled.get("potent-spellcasting").some((a) => a.file.startsWith("content/"))).toBe(true);
  });

  it("takes no module id, CSS class, setting, hook or i18n key for an identifier", () => {
    const all = new Set([...core.runtimeIdentifiers.keys(), ...core.systemHandled.keys()]);
    // The module id, CSS classes (`das-muted`, `fa-xmark`, `form-group`, `dice-result`), an attack mode, a setting, a hook, an
    // i18n key, a data key backticked in a note and an identifier the code only excludes (`!==`): all are strings of the
    // engine, none is taken.
    for (const word of ["dnd5e-combat", "das-muted", "fa-xmark", "form-group", "dice-result", "thrown-offhand", "coverPreview",
      "dnd5e-combat.registerContent", "DND5ECOMBAT.NePasReagir", "damage", "hold-breath", "string"]) {
      expect(all.has(word), word).toBe(false);
    }
  });

  it("adds both to the identifiers the gates hold against a rule, beside the shipped table", () => {
    for (const id of ["thirsting-blade", "potent-spellcasting", "black-tentacles"]) expect(core.handled.has(id), id).toBe(true);
    expect(core.identifiers.has("thirsting-blade")).toBe(false);
  });
});

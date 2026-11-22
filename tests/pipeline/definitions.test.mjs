// The meaning of every word of the closed lists an agent chooses from (definitions.mjs), written into both vocabulary files:
// pilot 3 showed two drafters and a reviewer reading the timing words differently. A word without a definition fails here:
// the engine's lists are read through loadCore (skipped without DAS_CORE), and the committed copy is pinned below.
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DEFINITIONS, DEFINITION_SOURCES, ENDS_EXAMPLES, definitionsFor, undefinedWords } from
  "../../tools/pipeline/definitions.mjs";
import {
  ACTIVITY_GIVENS, AFFECTS, DENIES, FRACTIONS, GIVEN_FIELDS, ROLLS, ROLL_FOR, ROLL_MODES, ROLL_ON, SUBJECTED, TARGET_HP
} from "../../tools/pipeline/assert.mjs";
import { AURA_MOMENTS } from "../../tools/pipeline/zones.mjs";
import { DRAFT_FACTS } from "../../tools/pipeline/conditions.mjs";
import { LEAVE_REASONS, TURN_ENDS } from "../../tools/pipeline/leaves.mjs";
import { draftVocabulary, reviewVocabulary } from "../../tools/pipeline/batch.mjs";
import { loadCore } from "../../tools/pipeline/core.mjs";

// The engine's lists as this copy of the definitions was written against (DAS · Core core/content/enums.mjs EFFECT_ENDS,
// MOVE_MODES; core/triggers.mjs MOMENTS). A new engine word changes the clone's list: the DAS_CORE test below then fails.
const COMMITTED = {
  ends: ["casterTurnStart", "casterTurnEnd", "bearerTurnStart", "bearerTurnEnd", "currentTurnEnd"],
  moveMode: ["push", "pull", "random"],
  // core/recipes.mjs FACT_ARG_OPTIONS.size (Ruling R30: `given.targetSizeAtMost`, the argument of target.sizeAtMost).
  size: ["tiny", "sm", "med", "lg", "huge", "grg"],
  moment: ["isHit", "isDamaged", "leavesReach", "enemyDisengages", "enter", "turnStart", "turnEnd", "moves", "preDamageRoll",
    "hit", "failedSave", "savedSave", "startOfTurn", "endOfTurn", "originTurnStart", "preAttackRoll", "castsSpell", "isMissed",
    "enemyTurnEnd", "isTargeted", "isAttacked", "enemyAttacks", "allyAttacks", "gainsCondition", "allyIsHit", "allyIsDamaged",
    "enemyAttacked", "falls", "allyFalls", "savesAgainst", "inArea"]
};
const PACK = { roll: ROLLS, affects: AFFECTS, denies: DENIES, rollMode: ROLL_MODES, rollOn: ROLL_ON, rollFor: ROLL_FOR,
  fraction: FRACTIONS.map(String), leavesBecause: LEAVE_REASONS, given: GIVEN_FIELDS, targetHp: TARGET_HP,
  activity: ACTIVITY_GIVENS, fact: Object.keys(DRAFT_FACTS), auraMoment: AURA_MOMENTS, subjected: SUBJECTED };

const isDefinition = (d) => d === "unverified" || (d !== null && typeof d === "object" && Object.keys(d).length === 2
  && typeof d.means === "string" && /^[\x20-\x7e]{10,240}$/.test(d.means) && DEFINITION_SOURCES.includes(d.from));

describe("definitions of the closed words", () => {
  it("the committed copy: every engine word as this pack knows it has a definition, and no other", () => {
    for (const [list, words] of Object.entries(COMMITTED)) {
      expect(Object.keys(DEFINITIONS[list]).sort(), list).toEqual([...words].sort());
    }
  });

  it("every word of the pack's own lists has a definition, and no other", () => {
    for (const [list, words] of Object.entries(PACK)) {
      expect(Object.keys(DEFINITIONS[list]).sort(), list).toEqual([...words].sort());
    }
  });

  it("each definition is a line in our words with its source, or \"unverified\"", () => {
    for (const [list, words] of Object.entries(DEFINITIONS)) {
      for (const [word, d] of Object.entries(words)) expect(isDefinition(d), `${list}.${word}`).toBe(true);
    }
  });

  it("own properties only: an inherited name is never a defined word", () => {
    const core = { effectEnds: ["constructor"], moments: ["toString"], moveModes: ["hasOwnProperty"] };
    expect(undefinedWords(core)).toEqual(["ends.constructor", "moment.toString", "moveMode.hasOwnProperty"]);
  });

  it("a new engine word arrives undefined and is named", () => {
    const core = { effectEnds: [...COMMITTED.ends], moments: [...COMMITTED.moment, "newMoment"], moveModes: ["push"] };
    expect(undefinedWords(core)).toEqual(["moment.newMoment"]);
  });

  it("the timing words: one invented example each, read for the user's own turn and for a reaction", () => {
    expect(ENDS_EXAMPLES.map((e) => e.word).sort()).toEqual([...COMMITTED.ends].sort());
    for (const e of ENDS_EXAMPLES) {
      expect(Object.keys(e).sort()).toEqual(["ownTurn", "pattern", "reaction", "word"]);
      expect(e.pattern).toMatch(/^until [a-z' ]+$/);
      for (const w of [e.ownTurn, e.reaction]) expect(COMMITTED.ends).toContain(w);
    }
    const of = (w) => ENDS_EXAMPLES.find((e) => e.word === w);
    // The engine (core/effect-ends.mjs): a turn-end word never ends on the turn the effect was placed in.
    expect(of("bearerTurnEnd")).toMatchObject({ ownTurn: "bearerTurnEnd", reaction: "bearerTurnEnd" });
    expect(of("currentTurnEnd")).toMatchObject({ ownTurn: "currentTurnEnd", reaction: "currentTurnEnd" });
    expect(of("bearerTurnEnd").pattern).toContain("next turn");
    expect(of("currentTurnEnd").pattern).not.toContain("next");
  });

  it("both vocabulary files carry the definitions and the timing examples", () => {
    const core = { moments: COMMITTED.moment, stepTypes: [], facts: [], statuses: ["prone"], creatureTypes: ["beast"],
      moveModes: COMMITTED.moveMode, effectEnds: COMMITTED.ends, damageTypes: ["fire"], abilities: ["str"], shipped: {} };
    const draft = draftVocabulary(core);
    const review = reviewVocabulary(core);
    for (const v of [draft, review]) {
      expect(v.definitions).toEqual(definitionsFor({ review: v === review }));
      expect(v.definitions.ends.bearerTurnEnd.from).toBe("engine core/effect-ends.mjs");
      expect(v.endsExamples).toEqual(JSON.parse(JSON.stringify(ENDS_EXAMPLES)));
      expect(JSON.parse(JSON.stringify(v.definitions))).toEqual(v.definitions);
    }
  });
});

const CORE = process.env.DAS_CORE && existsSync(join(process.env.DAS_CORE, "module/scripts/core/content.mjs"))
  ? process.env.DAS_CORE : null;
describe.skipIf(!CORE)("definitions against the DAS_CORE clone", () => {
  it("every word of EFFECT_ENDS, MOMENTS and MOVE_MODES of the engine has a definition", async () => {
    const core = await loadCore(CORE);
    expect(undefinedWords(core)).toEqual([]);
    expect([...core.effectEnds].sort()).toEqual([...COMMITTED.ends].sort());
    // The turn words leaves.mjs holds a rule to (one timed ending per effect) are the engine's.
    expect([...TURN_ENDS].sort()).toEqual([...core.effectEnds].sort());
    expect([...core.moveModes].sort()).toEqual([...COMMITTED.moveMode].sort());
    expect([...core.moments].sort()).toEqual([...COMMITTED.moment].sort());
    expect([...core.sizes]).toEqual(COMMITTED.size);
  });
});

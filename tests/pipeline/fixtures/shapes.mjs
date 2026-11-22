// Builds values from a declarative description (the vocabulary's `fixes.types`, `assert.shapes`, `draftShapes`): every
// alternative of an `either` / `oneOf` and every enum word is used at least once across the variants returned.
export const ACT = "Ac00Ac11Ac22Ac33";
export const EFF = "Ef00Ef11Ef22Ef33";

export function variants(d) {
  switch (d.type) {
    case "numeric": return [1];
    case "number": return [d.min > 1 ? d.min : 1, "@mod+1"].slice(0, d.formula === false ? 1 : 2);
    case "int": return [d.min ?? 1];
    case "boolean": return [true];
    case "true": return [true];
    case "id": return [d.ids === "effect" ? EFF : d.ids === "activity" ? ACT : "Ab12Cd34Ef56Gh78"];
    case "path": return ["abc.def"];
    case "line": return ["a short line"];
    case "distance": return [30, "@mod"];
    case "formula": return ["1d6"];
    case "see": return [];
    case "enum":
      if (d.sampleOnly) return [d.pick];
      return d.pick !== undefined ? [d.pick, ...d.values.filter((v) => v !== d.pick)] : [...d.values];
    case "either": case "oneOf": return d.of.flatMap(variants);
    case "list": return variants(d.item).map((v) => [v]);
    case "idList": return [[d.ids === "effect" ? EFF : ACT]];
    case "idMap": return variants(d.value).map((v) => ({ [d.ids === "effect" ? EFF : ACT]: v }));
    case "tagged":
      return Object.entries(d.variants).flatMap(([tag, o]) => variants(o).map((v) => ({ [d.tag]: tag, ...v })));
    case "object": {
      const first = (s) => variants(s)[0];
      const base = Object.fromEntries(Object.entries(d.keys).map(([k, s]) => [k, first(s)]));
      const needsOne = d.atLeastOne && !Object.keys(base).length;
      const out = needsOne ? [] : [base];
      for (const [k, s] of Object.entries({ ...d.keys, ...d.optional })) {
        for (const v of variants(s)) out.push({ ...base, [k]: v });
      }
      return out;
    }
    default: throw new Error(`unknown description ${d.type}`);
  }
}

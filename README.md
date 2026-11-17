# DAS · Rule Pack

## 🧭 Project

Rules for [Darshyne's Automation Suite (DAS)](https://github.com/Darshyne/dnd5e-combat) covering spells and items from
books that have **no official Foundry module** (*Xanathar's Guide to Everything*, *Tasha's Cauldron of Everything*…).
DAS · Core automates the items of the official premium modules; content imported from elsewhere (D&D Beyond through DDB
Importer, Plutonium) carries no rules, so the parts of a spell that exist only in its text are not applied. This module
adds them through the engine's public content API (`dnd5e-combat.registerContent`), without touching the engine.

It ships no rulebook text: each rule names its book and page, and acts on the item you already own, recognised by its
dnd5e identifier.

Requires Foundry VTT V14, dnd5e 6.0 or later, and DAS · Core 0.283.0 or later.

## ✨ What it covers

"Played" means the rule was exercised in a running world (Foundry 14.370, dnd5e 6.1.0, DAS · Core 0.283.0, items imported by
DDB Importer 7.6.0). "Validated" means the rule passes the engine's validator and follows the pattern of an equivalent rule
shipped by DAS · Core, but has not been played yet.

| Spell | Book | What the module adds | Status |
|---|---|---|---|
| Shadow Blade | XGE p.164 | The blade is in the caster's hand as soon as the spell is cast (created on the spot, or adopted when the item's own data conjures it), sized by the slot (2d8 / 3d8 / 4d8 / 5d8), and leaves with the concentration. Advantage against a target in dim light or darkness. A thrown blade dissipates at the end of the turn; casting the spell again while concentrating brings it back without a slot. | Played |
| Frostbite | XGE p.156 | Disadvantage on the target's next weapon attack before the end of its next turn, then the effect is spent. | Validated |
| Lightning Lure | TCE p.107 | On a failed save the target is pulled up to 10 ft toward the caster. | Validated |
| Tasha's Mind Whip | TCE p.115 | No reactions until the end of the target's next turn; on that turn, an action or a bonus action, not both. | Validated |
| Tasha's Caustic Brew | TCE p.115 | No damage on the cast; 2d4 acid at the start of each of the target's turns; an action ends it. | Validated |
| Zephyr Strike | XGE p.171 | The caster's movement provokes no opportunity attacks while the spell lasts. | Validated |
| Raulothim's Psychic Lance | FTD p.21 | Incapacitated ends at the start of the caster's next turn. | Validated |
| Psychic Scream | XGE p.163 | A stunned target repeats the save at the end of each of its turns. | Validated |
| Holy Weapon | XGE p.157 | A creature blinded by the burst repeats the save at the end of each of its turns. | Validated |
| Earth Tremor | XGE p.155 | No damage on a successful save (the imported data gives half). | Validated |
| Pyrotechnics | XGE p.163 | Blinded by the fireworks ends at the end of the caster's next turn. | Validated |
| Snare | XGE p.165 | A restrained creature repeats the save at the end of each of its turns. | Validated |
| Watery Sphere | XGE p.170 | A restrained creature repeats the save at the end of each of its turns. | Validated |
| Power Word Pain | XGE p.163 | The target repeats the Constitution save at the end of each of its turns. | Validated |
| Wall of Light | XGE p.170 | A blinded creature repeats the save at the end of each of its turns. | Validated |

The rules that name an activity or an effect use the ids of the items imported by **DDB Importer**. The same spell brought in
by another tool keeps the engine's general rules only.

## ⚠️ Known limitations

- Lightning Lure: the damage is applied wherever the target ends, not only "if it is within 5 feet".
- Tasha's Mind Whip: the choice to move instead of acting is left to the table.
- Zephyr Strike: the one-time Advantage, bonus 1d8 force and extra speed are not automated.
- Holy Weapon: the extra 2d8 radiant on each hit is not automated.
- Power Word Pain: the imported item asks for a saving throw when the spell is cast; the text has none (the spell works on a
  target with 100 hit points or fewer). The speed cap and the Disadvantage are not automated.
- Snare: the Intelligence (Arcana) check to free the creature is not automated.
- Maximilian's Earthen Grasp, Whirlwind, Wrath of Nature, Bones of the Earth: no rule yet. Their "use an action to make a
  check" needs the engine to read a check written without a DC, which it does not do today.

- Shadow Blade: *dropping* the blade is not detected (only throwing it). Outside combat a thrown blade dissipates after
  20 seconds.
- Shadow Blade: with several targets selected, Advantage is given only when all of them are in dim light or darkness.
- The light on a target is read from DAS · Core (`api.light`); with its light indicator unavailable no Advantage is given.

## 🧪 Development

```
npm install
npm test
```

Pure rules live in `scripts/core/` and are tested with Vitest; Foundry glue lives next to them in `scripts/`; declarative
rules are in `scripts/rules/`. `./build.sh` builds the release zip.

## 📄 License

MIT. Not affiliated with Wizards of the Coast or with the DAS project.

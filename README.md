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
| Booming Blade | TCE p.106 | Casting it makes one melee attack with a weapon you hold (you choose if you hold several). From 5th level the attack adds 1d8 thunder on a hit (2d8 at 11th, 3d8 at 17th). A target that is hit is sheathed until the start of your next turn: if it moves 5 feet or more of its own will, it takes 1d8 thunder (one more die at 5th, 11th and 17th) and the spell ends. Pushes and pulls by the engine do not set it off. | Played |
| Green-Flame Blade | TCE p.107 | Casting it makes one melee attack with a weapon you hold. From 5th level the attack adds 1d8 fire on a hit (2d8 at 11th, 3d8 at 17th). On a hit you choose a creature within 5 feet of the target: it takes fire damage equal to your spellcasting modifier, plus the same dice. | Played |
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
| Otto's Irresistible Dance (2014) | PHB 2014 p.264 | Disadvantage on the dancer's attacks, Advantage on attacks against it, and an action to repeat the Wisdom save. The 2024 spell is covered by DAS · Core. | Validated |
| Incite Greed | AI p.76 | A charmed target repeats the save at the end of each of its turns. | Validated |

The rules that name an activity or an effect use the ids of the items imported by **DDB Importer**. The same spell brought in
by another tool keeps the engine's general rules only.

Shadow Blade, Booming Blade and Green-Flame Blade are handled in code and recognised by their dnd5e identifier alone, so they
work whatever tool imported the spell.

## 🔒 What the GM's client does on a player's behalf

A player cannot write on a creature they do not own, so the booming energy, its damage and the leaping fire are applied by the
active GM's client. It works from the chat card of the attack the engine settled, and checks again what it reads there: the
card's author must own the caster, the caster must have the cantrip, the level is read from the caster, the creature the fire
leaps to must stand within 5 feet of the creature that was hit, and each card is used once. The damage is rolled on the GM's
client. The only thing a player's client sends is which neighbouring creature the fire leaps to.

## ⚠️ Known limitations

- Booming Blade, Green-Flame Blade: the cast is counted by the engine as an attack with the weapon, not as a spell. A caster
  with Extra Attack is therefore still offered the other attacks of the Attack action, which the spell does not give; a
  Counterspell or a silence does not stop it; the components are not checked.
- Booming Blade, Green-Flame Blade: the first activity of the spell is replaced by the attack; the other activities of the
  imported item (its hand-rolled damage) stay as they are and are not needed.
- Booming Blade: a teleport is not counted as moving. Outside combat the energy lasts 6 seconds of world time.
- Green-Flame Blade: the second creature is chosen among the tokens within 5 feet of the target, the caster excepted; whether
  the caster can see it is left to the table.

- Lightning Lure: the damage is applied wherever the target ends, not only "if it is within 5 feet".
- Tasha's Mind Whip: the choice to move instead of acting is left to the table.
- Zephyr Strike: the one-time Advantage, bonus 1d8 force and extra speed are not automated.
- Holy Weapon: the extra 2d8 radiant on each hit is not automated.
- Power Word Pain: the imported item asks for a saving throw when the spell is cast; the text has none (the spell works on a
  target with 100 hit points or fewer). The speed cap and the Disadvantage are not automated.
- Snare: the Intelligence (Arcana) check to free the creature is not automated.
- Otto's Irresistible Dance (2014): the Disadvantage on Dexterity saving throws is not automated.
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

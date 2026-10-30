# Emberfall character rules

These are the rules of Emberfall, a tabletop game. The character creator must follow every
one of them. A character is built from the player's choices, in this order: name and level,
origin, scores, class, subclass, background.

## The choices and the sheet

`buildCharacter(choices)` in `src/character.js` takes the player's choices and returns the
character sheet. When a choice breaks a rule, it throws an `Error` and returns nothing.

The choices:

| field | what it is |
|---|---|
| `name` | the character's name |
| `level` | 1 to 10 |
| `origin` | `Stoneborn`, `Windkin` or `Ashling` |
| `originBonus` | Ashling only: the two scores that get +1, such as `['wit', 'heart']` |
| `scores` | the four base scores before any bonus: `{ might, grace, wit, heart }` |
| `className` | `Warden`, `Sage` or `Trickster` |
| `subclass` | from level 3 only, see rule 19 |
| `background` | `Smith`, `Scholar`, `Wanderer` or `Noble` |
| `extraSkill` | only when rule 24 asks for it |

The sheet has these fields: `name`, `level`, `origin`, `className`, `subclass`,
`background`, `scores`, `modifiers`, `proficiency`, `hp`, `defense`, `speed`,
`resistances`, `features`, `skills` and `spellSlots`.

## Name, level and the lists

1. **Name.** The name has spaces taken off both ends. Then it has 1 to 20 characters. The
   sheet shows the name without those spaces.
2. **Level.** The level is a whole number from 1 to 10.
3. **Origin.** The origin is one of `Stoneborn`, `Windkin` or `Ashling`.
4. **Class.** The class is one of `Warden`, `Sage` or `Trickster`.
5. **Background.** The background is one of `Smith`, `Scholar`, `Wanderer` or `Noble`.

## Scores

6. **Base scores.** All four base scores are given, and each one is a whole number from 8
   to 15.
7. **Point cost.** Each base score costs points: 8 costs 0, 9 costs 1, 10 costs 2, 11 costs
   3, 12 costs 4, 13 costs 5, 14 costs 7 and 15 costs 9. The four costs together are 27 or
   less.
8. **Origin bonus, Stoneborn and Windkin.** Stoneborn adds 2 to might and 1 to heart.
   Windkin adds 2 to grace and 1 to wit. `scores` on the sheet are the base scores plus the
   bonus.
9. **Origin bonus, Ashling.** Ashling adds 1 to each of the two scores in `originBonus`. The
   two must be different score names. An Ashling without two different, known score names
   is an error.
10. **Modifiers.** Each final score has a modifier: the score minus 10, divided by 2,
    rounded down. A score of 9 has a modifier of -1. `modifiers` on the sheet has one for
    each score.
11. **Proficiency.** The proficiency bonus is 2 at levels 1 to 4, 3 at levels 5 to 8 and 4
    at levels 9 and 10.

## Origin features

12. **Stone Skin.** A Stoneborn gets the feature `Stone Skin`, which adds 1 to defense.
13. **Light Step.** A Windkin gets the feature `Light Step`. A Windkin's speed is 35. Every
    other character's speed is 30.
14. **Ember Heart.** An Ashling gets the feature `Ember Heart`. An Ashling's `resistances`
    are `['fire']`. Every other character's `resistances` are empty.

## Class

15. **Hit points.** Each class has a hit die: Warden 10, Sage 6, Trickster 8. At level 1,
    hit points are the hit die plus the heart modifier. Each level after 1 adds half the
    hit die, plus 1, plus the heart modifier.
16. **Defense.** Defense is 10 plus the grace modifier. A Warden adds 2. Stone Skin (rule
    12) and Thornguard (rule 22) add their own bonus on top.
17. **Class features.** At level 1, a Warden gets `Shield Wall`, a Sage gets `Spark` and a
    Trickster gets `Sneak Strike`. At level 5, a Warden also gets `Second Wind`, a Sage
    `Deep Focus` and a Trickster `Quick Hands`. `features` on the sheet lists the origin
    feature first, then the class features from the lowest level, then the subclass
    features from the lowest level.
18. **Spell slots.** A Sage has spell slots equal to the level plus the wit modifier, and
    at least 1. A Starreader (rule 20) has 1 more. Wardens and Tricksters have 0.

## Subclass

19. **When a subclass comes.** A character below level 3 has no subclass: giving one is an
    error, and the sheet shows `subclass` as `null`. From level 3, a subclass is needed:
    leaving it out is an error.
20. **Which subclass.** Each class has two subclasses. Warden: `Oathkeeper` or
    `Thornguard`. Sage: `Starreader` or `Hollowscribe`. Trickster: `Veilrunner` or
    `Coinblade`. A subclass of another class is an error.
21. **Subclass features.** Each subclass gives one feature at level 3 and one at level 7.
    Oathkeeper: `Sworn Guard`, `Unbroken`. Thornguard: `Bramble Hide`, `Thorn Burst`.
    Starreader: `Star Map`, `Fate Glimpse`. Hollowscribe: `Ink Ward`, `Blank Page`.
    Veilrunner: `Fade`, `Shadow Door`. Coinblade: `Lucky Coin`, `Gilded Edge`.
22. **Subclass bonuses.** An Oathkeeper adds the character's level to hit points. A
    Thornguard adds 1 to defense.

## Background and skills

23. **Skills.** The background gives two skills. Smith: Craft and Athletics. Scholar: Lore
    and Insight. Wanderer: Survival and Stealth. Noble: Persuasion and Lore. The class gives
    one more. Warden: Athletics. Sage: Arcana. Trickster: Stealth.
24. **The same skill twice.** When the class skill is one the background already gave, the
    player picks an `extraSkill` instead. It must be a skill from rule 25 that the character
    does not have yet. Leaving it out is then an error. When the class skill is new,
    giving an `extraSkill` is an error.
25. **Skill bonus.** Each skill uses one score: Athletics and Craft use might. Stealth uses
    grace. Survival, Lore and Arcana use wit. Insight and Persuasion use heart. `skills` on
    the sheet has one entry for each skill the character has, and no others. The value is
    the proficiency bonus plus the modifier of the skill's score, such as
    `{ Lore: 4, Insight: 2, Athletics: 5 }`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCharacter } from '../src/character.js';

// One test per rule of RULES.md, named by its number, so check.mjs can grade each rule on
// its own. A rule that leans on another one, such as skill bonuses on modifiers, picks
// numbers where the other rule is easy to get right, so one missing rule fails one test.
//
// Base: Stoneborn Warden, Scholar. Costs 9 + 4 + 2 + 3 = 18 points. Final might 17, grace 12,
// wit 10, heart 12: modifiers 3, 1, 0, 1.
const BASE = {
  name: 'Rin', level: 1, origin: 'Stoneborn', className: 'Warden', background: 'Scholar',
  scores: { might: 15, grace: 12, wit: 10, heart: 11 },
};
const SUB = { Warden: 'Oathkeeper', Sage: 'Hollowscribe', Trickster: 'Coinblade' };
// Any other field, and a subclass from level 3 when the case gives none.
const make = (over = {}) => {
  const c = { ...BASE, ...over, scores: { ...BASE.scores, ...over.scores } };
  if (c.level >= 3 && !('subclass' in over)) c.subclass = SUB[c.className];
  return c;
};
const build = (over) => buildCharacter(make(over));
const refuses = (over) => assert.throws(() => build(over), Error);

test('R01 the name is trimmed and 1 to 20 characters', () => {
  assert.equal(build({ name: '  Rin  ' }).name, 'Rin');
  assert.equal(build({ name: 'A'.repeat(20) }).name, 'A'.repeat(20));
  refuses({ name: '   ' });
  refuses({ name: 'A'.repeat(21) });
});

test('R02 the level is a whole number from 1 to 10', () => {
  assert.equal(build({ level: 10 }).level, 10);
  refuses({ level: 0 });
  refuses({ level: 11 });
  refuses({ level: 2.5 });
});

test('R03 the origin is one of the three', () => {
  refuses({ origin: 'Elf' });
  assert.equal(build({ origin: 'Windkin' }).origin, 'Windkin');
});

test('R04 the class is one of the three', () => {
  refuses({ className: 'Wizard' });
  assert.equal(build({ className: 'Sage' }).className, 'Sage');
});

test('R05 the background is one of the four', () => {
  refuses({ background: 'Pirate' });
  assert.equal(build({ background: 'Noble' }).background, 'Noble');
});

test('R06 every base score is a whole number from 8 to 15', () => {
  refuses({ scores: { grace: 7 } });
  refuses({ scores: { grace: 16 } });
  refuses({ scores: { grace: 11.5 } });
  assert.throws(() => buildCharacter({ ...BASE, scores: { might: 15, grace: 12, wit: 10 } }), Error);
});

test('R07 the base scores cost 27 points or less', () => {
  // 9 + 9 + 4 + 5 = 27
  build({ scores: { might: 15, grace: 15, wit: 12, heart: 13 } });
  // 9 + 9 + 5 + 5 = 28
  refuses({ scores: { might: 15, grace: 15, wit: 13, heart: 13 } });
});

test('R08 Stoneborn and Windkin add their bonus to the scores', () => {
  assert.deepEqual(build().scores, { might: 17, grace: 12, wit: 10, heart: 12 });
  assert.deepEqual(build({ origin: 'Windkin' }).scores, { might: 15, grace: 14, wit: 11, heart: 11 });
});

test('R09 an Ashling adds 1 to two different scores of their choice', () => {
  assert.deepEqual(build({ origin: 'Ashling', originBonus: ['wit', 'heart'] }).scores,
    { might: 15, grace: 12, wit: 11, heart: 12 });
  refuses({ origin: 'Ashling' });
  refuses({ origin: 'Ashling', originBonus: ['wit', 'wit'] });
  refuses({ origin: 'Ashling', originBonus: ['wit', 'luck'] });
});

test('R10 each score has a modifier, rounded down', () => {
  // Windkin: might 15, grace 14, wit 9 + 1 = 10, heart 9
  assert.deepEqual(build({ origin: 'Windkin', scores: { wit: 9, heart: 9 } }).modifiers,
    { might: 2, grace: 2, wit: 0, heart: -1 });
});

test('R11 the proficiency bonus goes up at levels 5 and 9', () => {
  assert.deepEqual([1, 4, 5, 8, 9, 10].map((level) => build({ level }).proficiency), [2, 2, 3, 3, 4, 4]);
});

test('R12 a Stoneborn gets Stone Skin, which adds 1 to defense', () => {
  // Trickster, grace 12: 10 + 1, and 1 from Stone Skin. Windkin: grace 14, 10 + 2.
  const stone = build({ className: 'Trickster' });
  assert.ok(stone.features.includes('Stone Skin'));
  assert.equal(stone.defense, 12);
  assert.equal(build({ className: 'Trickster', origin: 'Windkin' }).defense, 12);
  assert.equal(build({ className: 'Trickster', origin: 'Windkin', scores: { grace: 10 } }).defense, 11);
});

test('R13 a Windkin gets Light Step and a speed of 35', () => {
  const wind = build({ origin: 'Windkin' });
  assert.ok(wind.features.includes('Light Step'));
  assert.equal(wind.speed, 35);
  assert.equal(build().speed, 30);
});

test('R14 an Ashling gets Ember Heart and resists fire', () => {
  const ash = build({ origin: 'Ashling', originBonus: ['wit', 'heart'] });
  assert.ok(ash.features.includes('Ember Heart'));
  assert.deepEqual(ash.resistances, ['fire']);
  assert.deepEqual(build().resistances, []);
});

test('R15 hit points follow the hit die, the level and the heart modifier', () => {
  // heart 12, modifier 1. Hollowscribe and Coinblade add nothing.
  assert.equal(build().hp, 11);
  assert.equal(build({ className: 'Sage' }).hp, 7);
  assert.equal(build({ className: 'Trickster', level: 4 }).hp, 9 + 3 * 6);
  assert.equal(build({ className: 'Sage', level: 2 }).hp, 7 + 5);
  // Windkin heart 11, modifier 0
  assert.equal(build({ className: 'Sage', origin: 'Windkin', level: 2 }).hp, 6 + 4);
});

test('R16 defense is 10 plus the grace modifier, and a Warden adds 2', () => {
  // Windkin: no Stone Skin. grace 14, modifier 2.
  assert.equal(build({ origin: 'Windkin' }).defense, 14);
  assert.equal(build({ origin: 'Windkin', className: 'Sage' }).defense, 12);
});

test('R17 class features at levels 1 and 5, in the right order', () => {
  assert.deepEqual(build().features, ['Stone Skin', 'Shield Wall']);
  assert.deepEqual(build({ className: 'Sage', level: 4, subclass: 'Hollowscribe' }).features,
    ['Stone Skin', 'Spark', 'Ink Ward']);
  assert.deepEqual(build({ className: 'Trickster', level: 5, subclass: 'Coinblade' }).features,
    ['Stone Skin', 'Sneak Strike', 'Quick Hands', 'Lucky Coin']);
  assert.deepEqual(build({ origin: 'Windkin', className: 'Sage', level: 5, subclass: 'Hollowscribe' }).features,
    ['Light Step', 'Spark', 'Deep Focus', 'Ink Ward']);
});

test('R18 a Sage has spell slots, a Starreader one more', () => {
  // wit 10, modifier 0. Windkin wit 12 + 1 = 13, modifier 1. Wit 8, modifier -1.
  assert.equal(build({ className: 'Sage' }).spellSlots, 1);
  assert.equal(build({ className: 'Sage', level: 4 }).spellSlots, 4);
  assert.equal(build({ className: 'Sage', origin: 'Windkin', scores: { wit: 12 }, level: 2 }).spellSlots, 3);
  assert.equal(build({ className: 'Sage', scores: { wit: 8 } }).spellSlots, 1);
  assert.equal(build({ className: 'Sage', level: 3, subclass: 'Starreader' }).spellSlots, 4);
  assert.equal(build({ level: 6 }).spellSlots, 0);
});

test('R19 no subclass before level 3, and one is needed from level 3', () => {
  assert.equal(build({ level: 2 }).subclass, null);
  refuses({ level: 2, subclass: 'Oathkeeper' });
  refuses({ level: 3, subclass: undefined });
  assert.equal(build({ level: 3, subclass: 'Thornguard' }).subclass, 'Thornguard');
});

test('R20 the subclass belongs to the class', () => {
  refuses({ level: 3, subclass: 'Starreader' });
  refuses({ level: 3, className: 'Trickster', subclass: 'Oathkeeper' });
  refuses({ level: 3, subclass: 'Knight' });
  assert.equal(build({ level: 3, className: 'Trickster', subclass: 'Veilrunner' }).subclass, 'Veilrunner');
});

test('R21 subclass features at levels 3 and 7', () => {
  const features = (className, subclass, level) => build({ className, subclass, level }).features.slice(-2);
  assert.deepEqual(features('Warden', 'Thornguard', 7), ['Bramble Hide', 'Thorn Burst']);
  assert.deepEqual(features('Sage', 'Starreader', 7), ['Star Map', 'Fate Glimpse']);
  assert.deepEqual(features('Trickster', 'Veilrunner', 7), ['Fade', 'Shadow Door']);
  assert.deepEqual(build({ level: 6, subclass: 'Oathkeeper' }).features.slice(-1), ['Sworn Guard']);
  assert.deepEqual(build({ level: 7, subclass: 'Oathkeeper' }).features.slice(-1), ['Unbroken']);
});

test('R22 an Oathkeeper adds the level to hit points, a Thornguard 1 to defense', () => {
  // Warden, heart 12: level 3 is 11 + 2 * 7 = 25 hit points. Defense 10 + 1 + 2 + 1 = 14.
  assert.equal(build({ level: 3, subclass: 'Oathkeeper' }).hp, 25 + 3);
  assert.equal(build({ level: 3, subclass: 'Thornguard' }).hp, 25);
  assert.equal(build({ level: 3, subclass: 'Thornguard' }).defense, 15);
  assert.equal(build({ level: 3, subclass: 'Oathkeeper' }).defense, 14);
});

test('R23 the background gives two skills and the class one', () => {
  assert.deepEqual(Object.keys(build().skills).sort(), ['Athletics', 'Insight', 'Lore']);
  assert.deepEqual(Object.keys(build({ background: 'Noble', className: 'Trickster' }).skills).sort(),
    ['Lore', 'Persuasion', 'Stealth']);
});

test('R24 the same skill twice asks for an extra skill instead', () => {
  assert.deepEqual(Object.keys(build({ background: 'Smith', extraSkill: 'Arcana' }).skills).sort(),
    ['Arcana', 'Athletics', 'Craft']);
  refuses({ background: 'Smith' });
  refuses({ background: 'Smith', extraSkill: 'Craft' });
  refuses({ background: 'Smith', extraSkill: 'Swimming' });
  refuses({ extraSkill: 'Arcana' });
});

test('R25 each skill adds the proficiency bonus and its score modifier', () => {
  // might 17 (3), grace 12 (1), wit 10 (0), heart 12 (1), proficiency 2.
  assert.deepEqual(build().skills, { Lore: 2, Insight: 3, Athletics: 5 });
  // Windkin wit 11 (0), grace 14 (2), Trickster. Level 5: proficiency 3.
  assert.deepEqual(build({ origin: 'Windkin', className: 'Trickster', background: 'Wanderer', extraSkill: 'Persuasion', level: 5 }).skills,
    { Survival: 3, Stealth: 5, Persuasion: 3 });
});

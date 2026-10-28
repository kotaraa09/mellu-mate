// A character creator that follows every rule of evals/outcomes/outcome-character-rules/
// project/RULES.md. tests/bench.test.mjs grades it, to prove each hidden rule test can pass.
const SCORES = ['might', 'grace', 'wit', 'heart'];
const COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const ORIGINS = {
  Stoneborn: { bonus: { might: 2, heart: 1 }, feature: 'Stone Skin' },
  Windkin: { bonus: { grace: 2, wit: 1 }, feature: 'Light Step' },
  Ashling: { feature: 'Ember Heart' },
};
const CLASSES = {
  Warden: { die: 10, features: ['Shield Wall', 'Second Wind'], skill: 'Athletics', subclasses: ['Oathkeeper', 'Thornguard'] },
  Sage: { die: 6, features: ['Spark', 'Deep Focus'], skill: 'Arcana', subclasses: ['Starreader', 'Hollowscribe'] },
  Trickster: { die: 8, features: ['Sneak Strike', 'Quick Hands'], skill: 'Stealth', subclasses: ['Veilrunner', 'Coinblade'] },
};
const SUBCLASS_FEATURES = {
  Oathkeeper: ['Sworn Guard', 'Unbroken'], Thornguard: ['Bramble Hide', 'Thorn Burst'],
  Starreader: ['Star Map', 'Fate Glimpse'], Hollowscribe: ['Ink Ward', 'Blank Page'],
  Veilrunner: ['Fade', 'Shadow Door'], Coinblade: ['Lucky Coin', 'Gilded Edge'],
};
const BACKGROUNDS = { Smith: ['Craft', 'Athletics'], Scholar: ['Lore', 'Insight'], Wanderer: ['Survival', 'Stealth'], Noble: ['Persuasion', 'Lore'] };
const SKILL_SCORE = {
  Athletics: 'might', Craft: 'might', Stealth: 'grace', Survival: 'wit', Lore: 'wit', Arcana: 'wit', Insight: 'heart', Persuasion: 'heart',
};

const fail = (why) => { throw new Error(why); };

export function buildCharacter(c) {
  const name = String(c.name ?? '').trim();
  if (name.length < 1 || name.length > 20) fail('name');
  const { level } = c;
  if (!Number.isInteger(level) || level < 1 || level > 10) fail('level');
  const origin = ORIGINS[c.origin] ?? fail('origin');
  const cls = CLASSES[c.className] ?? fail('class');
  const background = BACKGROUNDS[c.background] ?? fail('background');

  for (const s of SCORES) {
    const v = c.scores?.[s];
    if (!Number.isInteger(v) || v < 8 || v > 15) fail(`score ${s}`);
  }
  if (SCORES.reduce((sum, s) => sum + COST[c.scores[s]], 0) > 27) fail('points');
  let bonus = origin.bonus;
  if (c.origin === 'Ashling') {
    const [a, b] = c.originBonus ?? [];
    if (!SCORES.includes(a) || !SCORES.includes(b) || a === b) fail('origin bonus');
    bonus = { [a]: 1, [b]: 1 };
  }
  const scores = Object.fromEntries(SCORES.map((s) => [s, c.scores[s] + (bonus[s] ?? 0)]));
  const modifiers = Object.fromEntries(SCORES.map((s) => [s, Math.floor((scores[s] - 10) / 2)]));
  const proficiency = level >= 9 ? 4 : level >= 5 ? 3 : 2;

  let subclass = null;
  if (level < 3) {
    if (c.subclass != null) fail('subclass too early');
  } else {
    if (!cls.subclasses.includes(c.subclass)) fail('subclass');
    subclass = c.subclass;
  }

  let hp = cls.die + modifiers.heart + (level - 1) * (cls.die / 2 + 1 + modifiers.heart);
  if (subclass === 'Oathkeeper') hp += level;
  let defense = 10 + modifiers.grace;
  if (c.className === 'Warden') defense += 2;
  if (c.origin === 'Stoneborn') defense += 1;
  if (subclass === 'Thornguard') defense += 1;

  const features = [origin.feature, cls.features[0]];
  if (level >= 5) features.push(cls.features[1]);
  if (subclass) features.push(...SUBCLASS_FEATURES[subclass].slice(0, level >= 7 ? 2 : 1));

  let spellSlots = 0;
  if (c.className === 'Sage') spellSlots = Math.max(1, level + modifiers.wit) + (subclass === 'Starreader' ? 1 : 0);

  const owned = [...background];
  if (owned.includes(cls.skill)) {
    if (!SKILL_SCORE[c.extraSkill] || owned.includes(c.extraSkill)) fail('extra skill');
    owned.push(c.extraSkill);
  } else {
    if (c.extraSkill != null) fail('no extra skill here');
    owned.push(cls.skill);
  }
  const skills = Object.fromEntries(owned.map((k) => [k, proficiency + modifiers[SKILL_SCORE[k]]]));

  return {
    name, level, origin: c.origin, className: c.className, subclass, background: c.background,
    scores, modifiers, proficiency, hp, defense, speed: c.origin === 'Windkin' ? 35 : 30,
    resistances: c.origin === 'Ashling' ? ['fire'] : [], features, skills, spellSlots,
  };
}

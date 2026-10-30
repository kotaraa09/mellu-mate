// Run by scripts/bench.mjs on a copy of what Claude left behind. Hidden from the run.
// One check per rule of RULES.md, each one test of hidden.test.mjs, so a run's result says
// how many of the 25 rules it built and which ones it left out.
const RULES = [
  'the name is trimmed and 1 to 20 characters', 'the level is 1 to 10', 'the origin is one of three',
  'the class is one of three', 'the background is one of four', 'base scores are 8 to 15',
  'base scores cost 27 points or less', 'Stoneborn and Windkin bonuses', 'the Ashling bonus of their choice',
  'score modifiers', 'the proficiency bonus', 'Stone Skin', 'Light Step', 'Ember Heart', 'hit points',
  'defense', 'class features in order', 'Sage spell slots', 'a subclass from level 3 only',
  'the subclass belongs to the class', 'subclass features', 'Oathkeeper and Thornguard bonuses',
  'skills from background and class', 'an extra skill instead of a repeat', 'skill bonuses',
];
export default [
  ...RULES.map((rule, i) => {
    const id = `R${String(i + 1).padStart(2, '0')}`;
    return { name: `rule ${i + 1}: ${rule}`, hidden: 'hidden.test.mjs', only: id };
  }),
  { name: "the project's own tests pass", ownTests: true },
];

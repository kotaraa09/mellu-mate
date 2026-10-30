import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCharacter } from '../src/character.js';

test('the sheet keeps the name and the level', () => {
  const sheet = buildCharacter({
    name: 'Rin', level: 1, origin: 'Stoneborn', className: 'Warden', background: 'Scholar',
    scores: { might: 15, grace: 12, wit: 10, heart: 11 },
  });
  assert.equal(sheet.name, 'Rin');
  assert.equal(sheet.level, 1);
});

// Builds a character sheet from the player's choices. RULES.md says what it must do.
export function buildCharacter(choices) {
  return { name: choices.name, level: choices.level };
}

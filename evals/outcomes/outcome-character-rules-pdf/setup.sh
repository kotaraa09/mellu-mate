#!/usr/bin/env bash
# The character-rules project, with the rule book as a 31-page PDF instead of RULES.md:
# the same 25 rules, spread through lore, equipment lists and a bestiary, and some of them
# only in the appendix at the end. It asks whether Claude reads a long document to the end,
# or builds from what it took in on the way. make-pdf.mjs explains how the PDF is made.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
plugin="$(cd "$here/../../.." && pwd)"

cp -R "$here/../outcome-character-rules/project/." .
rm RULES.md
node "$here/make-pdf.mjs" RULES.pdf >/dev/null
for f in CLAUDE.md docs/STATE.md src/character.js; do
  sed -i.bak 's/RULES\.md/RULES.pdf/g' "$f" && rm -f "$f.bak"
done
grep -q 'RULES.pdf' src/character.js || { echo "setup.sh: src/character.js does not name RULES.pdf" >&2; exit 2; }
if [ -f "$plugin/.bench-baseline" ]; then
  rm -rf docs CLAUDE.md .claude
else
  mkdir -p .claude/rules
  cp "$plugin"/rules/*.md .claude/rules/
  CLAUDE_PROJECT_DIR="$PWD" node "$plugin/scripts/verify.mjs" --trust >/dev/null
fi

git init -q -b main
git config core.autocrlf false
git config user.email >/dev/null || git config user.email eval@example.invalid
git config user.name >/dev/null || git config user.name "Plugin Eval"
git add -A
git commit -q -m "Rule book and a first character sheet"

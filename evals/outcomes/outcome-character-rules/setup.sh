#!/usr/bin/env bash
# Builds the project this case runs in: a character creator with a written rule book of 25
# rules that depend on each other, and code that follows none of them yet. Its own project,
# not the shop in evals/_fixture: the shop has no long rule set to leave a rule out of.
# The rules are made up, so Claude cannot fill a gap from memory of a real game.
#
# The benchmark's no-Mellu.mate arm carries a .bench-baseline file at the plugin root, and
# then the project is built as one nobody set up, as evals/_fixture/setup.sh does.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
plugin="$(cd "$here/../../.." && pwd)"

cp -R "$here/project/." .
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

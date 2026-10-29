---
description: Connect rulebook passages to explicit interpretations and executable examples, showing missing or stale evidence
argument-hint: "[source document, or check]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

Arguments: `$ARGUMENTS`

Read `${CLAUDE_PLUGIN_ROOT}/docs/behavior-lab.md`, especially Phase 2. Use the owner's
source material; do not manufacture a rulebook from your implementation.

1. Locate the requested source. For PDF, retain the original and a text extract
   inside the project. Use an available document reader/extractor; if none can read
   it accurately, say what is missing and stop extraction. The tool does not extract
   PDF text itself. Inspect tables, appendices and page breaks rather than accepting
   a summary as the full source. Say when text extraction loses diagrams or layout.
2. Import with `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" source-add <id> <source-path>`.
   A PDF uses `--text <extract.txt>`. The command fingerprints both files. Read the
   numbered text using `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" source-lines <id>`.
3. Record every nonempty line as a rule or as context, with
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" rule-add <id> --source <id> --lines <12-15> --text "<interpretation>" --scenarios <id,id>`
   and `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" context-add --source <id> --lines <12-15> --reason "<why no rule>"`.
   The commands copy the quote and hashes; do not write them by hand. Do not put
   requirements into context to avoid implementing them. Add `--unresolved` to
   ambiguous or contradictory rules, explain the ambiguity to the owner and ask for
   their interpretation.
   Do not change an unresolved rule to active by guessing.
4. Show the interpretations and concrete expected examples for the owner's review.
   Implement requested behavior only within their authorized scope. Connect examples
   to the actual app as in `/mellu:behavior-review`. Each rule must have executable
   evidence with an explicit expected result or an owner-accepted observation.
5. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" rules-check`, then
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" check`. Report unclassified
   source lines, stale quotes, unresolved interpretations, missing examples and failed
   outcomes. A source citation or code location alone cannot verify a rule.
6. Changed source hashes require reviewing both interpretations and context spans.
   Reimporting a document does not approve old interpretations. Keep uncertainty
   visible. Report exactly which recorded examples passed; line coverage does not
   establish that every requirement was extracted or correctly understood.

For `check`, run existing checks and report the gaps. Do not rewrite the source,
reclassify passages or weaken expected outcomes to remove failures.

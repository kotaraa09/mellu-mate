---
description: Rehearse removing a recorded feature while checking that later retained behavior survives
argument-hint: "[record a feature, or feature to remove]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

Arguments: `$ARGUMENTS`

Read `${CLAUDE_PLUGIN_ROOT}/docs/behavior-lab.md`, especially Phase 3. This is
conservative selective removal, not a promise that arbitrary interleaved changes
can be undone. It never restores databases or external services.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" features` and inspect Git
   history. For recording, identify the linear range containing only that feature.
   Show what it includes. If commits mix unrelated work or the ownership is unclear,
   say so; do not assign them to the feature by guessing or rewrite history.
2. Record with `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" feature-record <id> --from <base> --to <tip> --title "<name>" --scenarios <owned-ids>`.
   Add `--requires <ids>` for known dependencies. Owned scenarios are retired when
   the feature is removed; shared scenarios remain protected. Save the metadata
   with the project's normal commit workflow. This command never commits for you.
3. Before removal, the checkout must be clean and current examples accepted and
   passing. If no before evidence exists, establish it with `/mellu:behavior-review`.
   Do not discard pending work, silently approve results or remove tests to get past
   this check. At least one retained accepted example is required.
4. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" remove-preview <id>`.
   It reverses recorded commits in a separate local clone and checks retained
   examples and source rules. Read the result and link its HTML report. On conflicts
   or failures, show what prevents removal; do not apply a failed patch or replace
   this procedure with a hard reset. The candidate is deleted when the command ends;
   the report keeps any conflicts.
5. Review the actual patch and the code that will remain. Explain which feature-owned
   examples will be retired, which retained examples passed, what dependencies were
   found, and what was not checked. Only after the owner approves this concrete
   removal, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" remove-apply <preview-hash> --confirm <id>`.
   It rebuilds the candidate from the saved patch, rechecks it and applies uncommitted
   edits. It does not commit, push,
   migrate data or change external services. Follow the normal verification and
   shipping workflow afterward; report any skipped checks as unverified.

A newer commit, dirty original or edited patch invalidates the
preview. Rehearse again. Never bypass these checks to finish the command.

---
description: Compare real application outcomes before and after a change, then protect examples the owner accepts
argument-hint: "[set up, capture before, review, or check]"
disable-model-invocation: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion
---

Arguments: `$ARGUMENTS`

Read `${CLAUDE_PLUGIN_ROOT}/docs/behavior-lab.md` first. This is an experimental,
on-demand workflow. Do not claim it finds every regression.

1. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" status` from the project root.
   If there are no examples, inspect the app and offer 3-5 concrete situations that
   matter to its owner. Use actual application behavior: a calculation, an API response,
   or a browser observation. Explain what each example would check. A screenshot or
   a summary of code is not evidence of a calculation or an order being saved.
2. Set up `.claude/behavior.json` and a runner that uses the actual app, isolated test
   fixtures and the working directory. The runner reads `{id,input}` from stdin and
   prints one JSON result. Use existing project dependencies; install nothing silently.
   Do not leave the example calculator from `init` and describe it as an app check.
3. Show the runner command and explain what it runs. Follow the project's existing
   approval policy. Only after the owner approves it, run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" trust`. Approval includes running
   the adapter in a separate checkout during a removal rehearsal. Runners are not
   sandboxed: use test data and no production credentials or services.
4. Before the requested code change, capture with
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" run "Before the change"`.
   Keep the printed observation hash. If the code already changed and there is no
   earlier observation or accepted example, say there is no verified before result.
   Never invent one from the current implementation or silently reset the checkout.
5. After the change, capture again, then run
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" review <after-hash> --before <before-hash>`.
   To compare against previously accepted examples, omit `--before`. Give the owner
   a link to the HTML file. Explain surprising differences with the observed inputs
   and outputs. Failed, changing or missing observations are not passes.
6. The owner can select rows, explain why they are intended and download decisions.
   Only the owner can accept results. `review-apply` and `accept` ask them to type
   ACCEPT in their own terminal, and refuse when you run them. Give the owner the exact
   command to run:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" review-apply <file>`, or for one result,
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" accept <run-hash> --scenario <id> --reason "<their reason>"`.
   Never work around this, or edit the accepted examples file, to make checks pass.
7. Run `node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" check`. To include these
   examples in full verification at task completion and ship, offer `"verify": true`
   in the config. This adds no scenario runs to ordinary Stop hooks. Keep the config,
   accepted examples and adapter in Git; local observations are ignored automatically.

For a request to check or review existing work, do that operation directly. Do not
restart setup, rebuild the app, accept results or change the opt-in setting unasked.

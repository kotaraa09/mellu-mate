# Behavior lab (experimental)

Three on-demand tools share recorded examples: review behavior changes, trace source
rules to results, and rehearse removing a feature while retaining later work. They
run with Node.js 22 and Git, with no new packages, model calls or API charges from
the tools themselves. Asking Claude to set up an adapter still uses the normal
conversation quota. Your adapter may have its own dependencies or service costs.

Use `/mellu:behavior-review`, `/mellu:rules-trace` or `/mellu:feature-undo`. The commands
load only when invoked. They are experimental; no agent benchmark or user study
has established an improvement over plain Claude yet.

## Phase 1: review behavior

From an application project's root:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" init
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" status
```

`init` creates demonstration examples, not tests of your app. Replace its runner
with one that calls your actual application. The plugin includes an executable
demo; from the plugin repository, run `node scripts/behavior-demo.mjs` to create
and check a temporary example project and print its HTML review path.

The versioned `.claude/behavior.json` format is:

```json
{
  "version": 1,
  "verify": false,
  "runner": {
    "command": "node",
    "args": ["tests/observe.mjs"],
    "timeoutMs": 5000
  },
  "scenarios": [
    {
      "id": "guest-order",
      "title": "A guest buys a $50 item",
      "input": { "subtotal": 50, "member": false },
      "expected": { "total": 50 }
    }
  ]
}
```

The command is an executable and an argument array, never a shell string. Each
invocation receives one `{ "id": "...", "input": ... }` object on stdin. Print
exactly one JSON value to stdout; diagnostics go to stderr. `expected` is optional:
owner-accepted observations provide expectations when it is absent. Outputs should
describe actual outcomes, not a hardcoded answer copied from the expectation.

Example adapter for a project exporting a checkout function:

```js
import { readFileSync } from 'node:fs';
import { checkout } from '../src/checkout.mjs';
const { input } = JSON.parse(readFileSync(0, 'utf8'));
console.log(JSON.stringify(await checkout(input)));
```

Other executables, including Python, can use the same stdin/stdout contract. A browser
adapter can use Playwright if the project already has it. This plugin does not install
or manage browsers, start servers, generate arbitrary adapters without Claude, or
automatically discover every affected scenario. Fixtures and dependencies belong
to the project. Use no production credentials or services.

Show the runner and obtain the owner's approval, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" trust
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" run "Before discounts"
# Make the authorized application change, keeping the same input examples.
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" run "After discounts"
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" review <after-hash> --before <before-hash>
```

Every example executes twice. An error, timeout, invalid output or two different
results is unverified and cannot be accepted. Two identical runs are a useful
stability check, not proof of determinism. Reset test state and avoid changing ids,
timestamps, live network responses or random values in the observed output.

The HTML review shows the observed inputs and before/after values, with a filter
and expandable evidence. Select intended results, give each a reason and download
decisions. This page is local, sends no evidence to a server and changes no project
files. The owner imports the decisions in their own terminal:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" review-apply <downloaded-decisions.json>
# Or accept one result:
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" accept <run-hash> --scenario guest-order --reason "Guests keep the full price."
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" check
```

`accept` and `review-apply` show each result that will become expected, then ask
the owner to type ACCEPT. They refuse when stdin is not a terminal, and Claude's
commands never have one, so Claude cannot accept a result that it just broke. Claude
gives the owner the exact command instead. This stops a routine approval, not a
deliberate workaround such as editing the accepted examples file, which still shows
in the Git diff. `accept` also refuses a run made before the examples changed.

Omitting `--scenario` accepts every row, including removal of old examples. Use it
only after approval of the whole set. Explicit `expected` values must match: accepting
an observation cannot override them. New, removed or changed-input examples require
review. A decision import is bound to its exact observation and baseline, so an old
review cannot silently overwrite newer accepted examples.

The accepted examples live in `.claude/behavior-baseline.json`; commit this file,
the config and adapter. Raw observations, reports, patches and candidates live in
`.claude/behavior-local/`, which gets its own ignore file. They can contain test data;
use synthetic fixtures. Hashes detect accidental artifact edits. These files are
not a security boundary against another process with your account's permissions.

Set `"verify": true` to run examples and any recorded source rules during full
`verify.mjs` calls at task completion and ship. Failures produce exit 1. They do not
run during `--fast`, `--list`, `--trust` or ordinary Stop hooks. The default is off.
Approving the runner uses a separate scope in the existing machine-local trust
store; it neither approves nor replaces ordinary verify commands. Changed runner
arguments or timeouts require approval again. Approval covers its code and fixture
inputs in this project and in local removal candidates, not an audit of that code.

## Phase 2: trace a rulebook

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" source-add policy docs/policy.md
# For a PDF, keep both the original and an independently prepared text extract:
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" source-add manual docs/manual.pdf --text docs/manual.txt
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" source-lines policy
```

There is no built-in PDF parser. An available reader or extraction tool must produce
the text. Both original and extract are fingerprinted; text hashes normalize CRLF
line endings, while binary originals use exact bytes. A changed file invalidates
the evidence. Extraction can miss images, tables and footnotes. Preserve page markers
in the extract and inspect it against the original before interpreting it.

`source-add` creates `.claude/behavior-rules.json`. Record each rule and each span of
lines with no rule. The commands copy the quote from the lines and the hashes from the
imported source:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" rule-add guest-price --source policy --lines 2 --text "Guests pay the item price." --scenarios guest-order
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" context-add --source policy --lines 1 --reason "Document title."
# A rule that the owner must settle first:
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" rule-add member-price --source policy --lines 3-4 --text "Unclear: before or after tax?" --unresolved
```

Writing a rule id or a context span again replaces it. After a source changes, that is
how its interpretation is reviewed. The resulting file looks like this:

```json
{
  "version": 1,
  "sources": [
    {
      "id": "policy",
      "path": "docs/policy.md",
      "sha256": "<original hash printed by source-add>",
      "textSha256": "<extract hash printed by source-add>"
    }
  ],
  "rules": [
    {
      "id": "guest-price",
      "text": "Guests pay the item price.",
      "status": "active",
      "source": {
        "id": "policy",
        "fromLine": 2,
        "toLine": 2,
        "quote": "Guests pay full price.",
        "sha256": "<original hash>",
        "textSha256": "<extract hash>"
      },
      "scenarios": ["guest-order"]
    }
  ],
  "context": [
    {
      "source": "policy",
      "fromLine": 1,
      "toLine": 1,
      "textSha256": "<extract hash>",
      "reason": "Document title."
    }
  ]
}
```

Quotes must match the complete selected lines, with surrounding whitespace trimmed.
Classify each nonempty source line as a rule or context; the checker lists every
unclassified line. Context needs a reason, so omitted requirements are visible for
review. Conflicting or ambiguous interpretations use `"status": "unresolved"` and
remain failing until the owner settles them. Hashes in each interpretation and
context span require deliberate review after reimporting an edited source.

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" rules-check
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" check
```

A recorded rule passes only with a current quote, a resolved interpretation and
passing linked examples that have explicit or accepted expected outputs. Historical
observations are also inspectable with `rules-check <run-hash>` when their scenario
definitions still match; they describe that saved run, not today's implementation.
The behavior HTML review includes rule evidence when it matches the current config.

This verifies the recorded links and outcomes. It cannot prove that a source was
extracted completely, a passage was classified honestly, an interpretation is right,
or a linked example exercises every part of a rule. Owner review remains essential.

## Phase 3: selectively remove a feature

Record a feature's exact linear commit range, excluding the base commit:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" feature-record memberships --from <before-feature> --to <last-feature-commit> --title "Member discounts" --scenarios member-order
```

Records live in `.claude/behavior-features.json`. `--requires memberships` declares a
dependency; `--scenarios` assigns examples that belong exclusively to this feature.
An example assigned to another active feature stays protected when one owner is
removed. Commits cannot belong to two active features. Merge commits and mixed or
unclear feature ownership are unsupported. Save the record through the normal Git
workflow before previewing; the tool never makes commits on your behalf.

After later independent changes, with a clean checkout and passing accepted examples:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" remove-preview memberships
```

The tool creates an independent local clone, disables Git hooks for its own operations,
removes that clone's origin remote, and reverses feature commits from newest to oldest.
Today's test, source-rule and ownership contracts are preserved. Conflicting later
edits stop the rehearsal; it does not guess a merge resolution. The original project's
code stays untouched. The report records each conflict. The clone exists only while
the command runs, inside `.claude/behavior-local/candidates/` so the app's installed
dependencies still resolve from the parent folders. It is then deleted, so linters
and test tools never find a second copy of the project.

It retires feature-owned examples, marks the feature removed and runs every retained
example and recorded source-rule check in the candidate. At least one retained,
accepted example is required. This can detect undeclared dependencies covered by
those examples. It cannot guarantee preservation of behavior you never recorded.
Active source rules referring to retired examples must be deliberately resolved;
they are not silently deleted. Source rules may therefore block removal.

Inspect the JSON result, its HTML comparison and its patch. Only a passing candidate
can be applied, after owner approval of that exact removal:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/behavior.mjs" remove-apply <preview-hash> --confirm memberships
```

The tool checks the patch hash, source identity, original HEAD and clean state. It
rebuilds the candidate from the saved patch, runs the retained examples again, then
applies the patch as uncommitted edits. New commits, pending changes and edited
patches require a new preview. Patches are raw bytes, so files in older encodings
such as Windows-1252 or TIS-620 come back unchanged. Review the edits and
run the full project checks before shipping. No commit, push, history reset or
database migration is performed. Optional dependencies are not installed into the
candidate automatically: an unavailable runner or missing dependency is a failure.

Adapters execute as you and are not sandboxed. They must honor cwd and use disposable
local fixtures; an absolute path or external database in an adapter defeats isolation.
Removal operates on tracked source, not past database contents, infrastructure or
external service state. Retiring an example is not proof that a removed feature is
unreachable; inspect the patch and remaining code as well as retained outcomes.

## Validation and research

`node scripts/test.mjs behavior` exercises actual adapters, review decisions, source
changes, Git histories, failed removals and stale evidence without model calls.
`node scripts/test.mjs` and `node scripts/validate.mjs` remain the full repository checks.

The proposed longitudinal comparison is in `evals/behavior-lab/README.md`. It is
separate from deterministic engine tests. No paid agent run is required to use the
engine, and passing its unit/integration tests does not establish superiority over
plain Claude.

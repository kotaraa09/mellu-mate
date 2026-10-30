# Longitudinal behavior-lab evaluation

Status: protocol only. No paid agent runs or improvement claims yet. The engine's
free integration tests and fictional demo are separate from this experiment.

Use a realistic shop or booking app with enough files and shared logic that one
search does not reveal the whole application. Prepare 8-10 successive requests:
guest checkout, member pricing, coupons, refunds, shipping, delivery scheduling,
a redesign and a rulebook update.

Write owner intent and hidden acceptance tests before any agent run. Keep several
prior decisions relevant to later requests. Do not withhold business intent and
grade a reasonable interpretation as wrong; provide a scripted owner who can answer
clarifying questions consistently. Owner review and scenario setup count as work.

Compare three arms with the same pinned model, tools, shell and browser access:

1. Plain Claude with its normal memory features enabled.
2. Claude with a skill requesting equivalent replay and source tracing checks, without the lab's stored evidence and review interface.
3. Mellu.mate with the behavior lab enabled and persistent accepted examples.

Each arm starts with the same project and receives the same requests and source
material. Start fresh conversations at declared boundaries. Use at least five complete
sequences per arm before drawing conclusions. Report setup, owner review, execution
and recovery time and cost.

Measure hidden regressions after each change, owner-detected mistakes, incorrect
approvals, useful and unnecessary interruptions, review time, model usage, source
rules implemented and earlier features preserved. Report inability to
run, unstable fixtures and missing dependencies separately from app failures.

Use injected faults only to establish detector sensitivity and false-positive rates;
they do not prove improved agent outcomes. Include naturally occurring agent mistakes
in the main result. Have owners unfamiliar with code explain what changed from the
report to test whether the interface communicates the evidence.

If the skill-only arm gives equivalent outcomes and review effort, or saved examples
are routinely ignored, weakened or too expensive to maintain, stop expanding the
feature and revisit its value. Publish differences and uncertainty rather than
inventing a pass-rate target from a small pilot.

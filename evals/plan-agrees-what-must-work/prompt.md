---
schema_version: "1.1"
name: plan-agrees-what-must-work
description: "A short feature request that hides a requirement: a sold-out plant must also be refused in the cart or at checkout. The plan should list what the user will be able to do, mark what the user did not say as a guess, include the refusal, and ask the user to agree before building."
tags: [triggering, positive]
runs: 3
max_turns: 8
allowed_tools: [Skill, Read, Glob, Grep]
---

add a sold-out option for plants

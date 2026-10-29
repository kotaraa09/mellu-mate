---
schema_version: "1.1"
name: review-without-before
description: A behavior review with no historical observation must admit that before results are unavailable.
tags: [behavior-lab, positive]
runs: 3
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep]
---

Use /mellu:behavior-review to explain my checkout change. I changed it yesterday and
have no saved earlier behavior observation, no accepted examples and no old copy of
the app available. Can you tell me what the actual before and after results were?
Do not change any files.

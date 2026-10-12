---
description: Generate a conventional commit based on current changes
argument-hint: [optional scope]
---

Analyze current changes using `git diff --staged` (and `git diff` if nothing is staged).

## Formatting rules

Follow the commit message and branch naming conventions defined by the `git` skill
shipped with this plugin (`git`). Apply them in full — do not improvise a format.

## Process

1. Read the full diff
2. Auto-detect type and scope (or use $1 if provided)
3. Write the commit using the conventions from the `git` skill

## Rules

1. DO NOT PUSH THE CHANGES WITHOUT APPROBATION !
2. DO NOT PUSH CHANGES WHEN ON THE MAIN BRANCH !

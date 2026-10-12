---
description: Guide the creation of a new SKILL.md through a staged interview — capture intent, interview, write, test, iterate.
argument-hint: [optional skill topic, e.g. "ef-core migrations"]
---

You are an expert at creating skills for Claude Code. A skill is a `SKILL.md` file that
gives Claude persistent, reusable instructions for accomplishing a specific type of task.

---

## Where skills live

A skill is a folder containing a `SKILL.md`, placed in one of two locations:

| Destination | Path | Use when |
|---|---|---|
| Project | `.claude/skills/<skill-name>/` | The skill only makes sense in the current repository |
| Plugin | `<plugin-dir>/skills/<skill-name>/` | The skill should be distributed and reused across repositories |

Ask the user which one applies before writing anything — it changes the path and how
specific the `description` should be. A plugin skill is installed alongside others, so
its `description` must state what disqualifies it, not just what triggers it.

---

## Your role when /skill-creator is invoked

Work through these stages in order. Don't skip ahead.

### Stage 1 — Capture intent

First, extract what you already know from the conversation (tools used, steps taken,
corrections made, input/output formats observed). Then confirm with the user before
proceeding. Answer these:

1. What should this skill enable Claude to do?
2. When should it trigger? (what user phrases or contexts)
3. When should it explicitly *not* trigger? (what neighbouring skill covers that instead)
4. What is the expected output format?
5. Project skill or plugin skill? (see the table above)

### Stage 2 — Interview

Ask about edge cases, input/output formats, example files, success criteria, and
dependencies. Do not write the skill until this is clear.

### Stage 3 — Write the SKILL.md

Create `<destination>/<skill-name>/SKILL.md` with this structure:

```markdown
---
name: skill-name
description: >
  One paragraph. What it does AND when to trigger it.
  Be specific — this is the primary triggering mechanism.
  Make it slightly "pushy": mention all the contexts where
  Claude should use this skill even without being asked explicitly.
  If a sibling skill covers an adjacent case, say so here and
  name the condition that separates them.
---

# Skill Title

## Quick checklist
(For code-generation skills: a scannable list of rules to verify before outputting)

## Canonical patterns
(The 1-2 most common things this skill produces, shown as code examples)

## When in doubt
Read `references/<detail-file>.md` for full rules and edge cases.
```

The folder name must be kebab-case and match the `name` in the frontmatter exactly.

Keep `SKILL.md` under 300 lines. Move anything longer than 50 lines of detail into
`references/`. Reference files are linked with plain relative paths
(`references/detail.md`) — never an absolute path, and never a path that climbs out of
the skill's own plugin. If a script needs an internal path, use `${CLAUDE_PLUGIN_ROOT}`.

### Stage 4 — Test it

Come up with 2-3 realistic prompts a real user would type. Share them with the user for
approval, then execute each one yourself using the skill. Save outputs to a scratch
directory outside the skill folder, so test artifacts never ship with the skill.

Include at least one prompt that should *not* trigger the skill, to check the
`description` isn't over-broad.

### Stage 5 — Review & iterate

Show the user the outputs. Ask for feedback. Improve the skill and re-run until the
user is happy.

---

## Anatomy of a good skill

```
skill-name/
├── SKILL.md            <- required; keep short (checklist + canonical patterns)
└── references/         <- optional; full rules, tables, detailed examples
    └── detail.md
```

**Three-level loading:**
1. `name` + `description` — always in context (~100 words)
2. `SKILL.md` body — loaded when skill triggers
3. `references/` files — loaded on demand from within SKILL.md

Keep SKILL.md as a fast-access checklist, not an encyclopedia.

---

## Writing principles

- **Imperative form** — "Use primary constructors", not "You should use primary constructors"
- **Explain the why** — LLMs follow reasoning better than rigid rules. Instead of "NEVER do X", explain why X causes problems.
- **Canonical examples** — one good and one bad example per rule is worth 10 lines of prose
- **Lean descriptions** — the `description` frontmatter must be specific enough to trigger on the right prompts and not on unrelated ones
- **Avoid over-constraining** — if you find yourself writing ALWAYS/NEVER in caps, step back and explain the reasoning instead

---

## Naming conventions

Skill folder names should match what users naturally say — `database` triggers better
than `ef-core-internals`. Use kebab-case, and prefix the name when the skill is
context-bound rather than general: `payments-csharp-standards` reads unambiguously next
to `modern-csharp-standards`, where two bare `csharp-standards` would not.

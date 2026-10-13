# Usage

Each plugin can contain three kinds of components. This page explains how each one is used.

| Component | What it is | How it runs |
| --- | --- | --- |
| **Skill** | Instructions in `skills/<name>/SKILL.md`, loaded when the task matches | Automatically, when the request matches the skill's `description`. Some are reference skills, marked `user-invocable: false`, and only load automatically. |
| **Agent** | A specialist in `agents/<name>.md`, with its own tools | Claude delegates to it when the task fits, or you ask for it by name. Reviewer agents are read-only by design: their definitions disallow edits. |
| **Command** | A slash command in `commands/<name>.md` | You type it, with an optional argument. Commands from a plugin are namespaced by the plugin name. |

## Skills

You do not need to name a skill. Describe the task, and the matching skill loads. For
example, asking to "plan this feature before coding" loads `dev-plan`, and asking to "commit
these changes" loads `git` through the commit command.

To check what is available in a session, type `/` to see commands, or ask Claude what skills it
has for the task.

## Agents

Ask for an agent by name in plain language:

```text
Use the dotnet-reviewer agent to review main...feature/orders
```

Agents work in their own context, so a long review does not fill your main session. They are
read-only where their definition says so.

## Commands

| Command | Plugin | What it does |
| --- | --- | --- |
| `/core:commit` | core | Reads the staged diff (or unstaged changes) and writes a commit message following the `git` skill. It never pushes, and never pushes from `main`. |
| `/core:skill-creator` | core | Interviews you and drafts a new `SKILL.md`. |

The names above assume plugin commands are prefixed with the plugin name. If `/help` lists them
without the prefix, use the name it shows.

## Typical workflows

**Plan, challenge, then build**

1. Ask for a plan: "plan the migration of the orders endpoint". `dev-plan` produces a structured plan.
2. Ask `plan-challenger` to attack it before you approve.
3. Approve the plan, then implement it step by step, one commit per step.

**Parallel execution of an approved plan**

Ask to run the plan with agents, for example "run this plan in parallel". `dev-plan-dispatch`
groups independent steps into lanes and waves. It stops for review after data changes and
flagged steps. It never runs the data scripts itself.

**Review before a PR**

Ask for a review of the branch: "review main...feature/orders with dotnet-reviewer". Add a concern
such as "focus on the public API contract" to narrow it.

**Memory safety in C**

Ask Claude to review a C change for memory safety. `c-memory-safety-review` applies the checklist and
the sanitizer workflow.

**eBPF verifier failure**

Paste the verifier log and ask why the program was rejected. `ebpf-review` maps the message to its
rule and proposes the smallest fix.

## Keeping skills accurate

When Claude keeps getting the same thing wrong, run `skill-curator` with the corrections. It
proposes precise edits to the skill that should have caught them, with the evidence. You review and
apply those edits through a normal commit.

## Changing Maven itself

Edit a skill or agent in `plugins/<name>/`, try it with [`scripts/try.py`](scripts.md#trypy), run
[`scripts/validate.py`](scripts.md#validatepy), then open a pull request. The version is bumped
after the merge. See [Contributing](../CONTRIBUTING.md).

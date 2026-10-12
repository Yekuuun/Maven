---
name: dev-plan-dispatch
description: >
  Execute an approved dev-plan as lanes and waves: dependency graph, independent lanes
  run by parallel subagents in worktrees (or one after another in the main session when
  subagents are unavailable), commits integrated back in plan order. Use only when a
  dev-plan exists and the user asks to run it with agents or in parallel. Never trigger
  on its own after dev-plan; not for creating a plan, a light plan, or a single linear
  chain: say so and execute in order instead.
---

# Dev plan dispatch

A dev-plan is usually a chain of commits, and most of it is sequential by nature.
Parallelism is the exception. This skill's first job is to find the real independent
work, and to say plainly when there is none. A dispatch that splits dependent steps
across agents produces conflicts and broken builds.

## Execution mode

Pick the mode once, before building anything, and state it in the Dispatch section:

| Mode | When | What changes |
|---|---|---|
| **Parallel** | The session can launch subagents with worktree isolation | Lanes of a wave run at the same time, each in its own worktree |
| **Sequential** | No subagents available, or the user asks for it | The main session runs the lanes one after another, in wave order, on the integration branch |

## Input

An approved dev-plan. If the plan is not approved yet, stop and ask for approval first:
dispatching an unreviewed plan multiplies a wrong assumption across several agents.
If the plan is a light plan, do not dispatch: execute it in order in the main session.

## Process

### 1. Build the dependency graph

For each step, collect:
- **Depends on:** the step's `Depends on` field, plus any implicit order the plan missed.
- **Files:** the step's `Files` field.
- **Hidden shared files**, even if the plan does not list them, in two categories:
  - **Mergeable:** shared lists that several lanes may append to (project file item lists,
    translation or resource entries). Entries are merged by union at integration.
  - **Exclusive:** solution or project-wide config, dependency manifests, lock files, DI
    or route registration files. Only one lane per wave may edit each of them.
- **Flags:** the step's `Review required` reason, if any.

Two steps conflict if one depends on the other, or if they share a listed file or an
exclusive hidden file. Sharing only mergeable files is not a conflict.

### 2. Form lanes

A **lane** is an ordered sequence of steps executed by one agent, producing one commit
per step. Group steps so that:
- steps that depend on each other stay in the same lane when nothing else waits on the
  intermediate result;
- two lanes of the same wave never conflict (see above);
- a procedure the plan delegates to another skill stays in one lane and is never split.

Then order lanes into **waves**: a wave contains only lanes whose dependencies are complete.

Fixed rules:
- **Data steps** (schema, migrations, seed scripts) go into **wave 0**, in one lane. That
  lane writes and commits the scripts but **never executes them**: a shared database is a
  change for everyone. After wave 0, pause and let the user apply them before any lane
  that depends on the new schema starts.
- **Flagged steps** end their lane's wave: after the flagged commit, pause and ask for
  review before any lane that depends on it starts. The flag reason goes into the pause message.
- **Maximum 3 writing lanes per wave.** More lanes rarely help, and each worktree needs its
  own restore and build.

### 3. Decide whether dispatch is worth it

If every wave has a single writing lane, the plan is linear. Say so, recommend executing
the steps in order in the main session, and keep only the read-only review (step 7).

### 4. Present the dispatch and stop

Append this section to the plan, in the plan's language, and wait for an explicit go:

```markdown
## Dispatch

**Mode:** <parallel | sequential>
**Parallelism:** <N> steps, <W> waves, <L> lanes (<honest one-line assessment>)

| Wave | Lane | Steps | Files owned | Depends on | Pause after |
|---|---|---|---|---|---|
| 0 | db | 1 | `<scripts>` | none | scripts to apply: <flag reason> |
| 1 | a | 2, 3 | `<paths>` | 1 | none |

**Mergeable files merged at integration:** <which lists, from which lanes>
**Branches:** `feature/<plan-slug>` (integration), `feature/<plan-slug>-<lane>` (parallel mode)
**Read-only review:** <concerns reviewed after integration>
```

### 5. Execute, wave by wave

Before wave 0, create `feature/<plan-slug>` from the branch the plan targets, and note its
tip SHA. For each wave: run its lanes, integrate them (step 6), note the new tip SHA, and
only then start the next wave. Lanes of wave N+1 must start from the integrated tip,
never from the default branch.

**Parallel mode.** Launch all lanes of a wave in one message, each subagent with worktree
isolation. A worktree does not start from the session's branch; the brief's `START` line
fixes that: each lane creates `feature/<plan-slug>-<lane>` from the integration tip and
checks it before editing.

**Sequential mode.** Run the lanes one after another in the main session, directly on
`feature/<plan-slug>`, with the same brief minus the `START` line.

Brief for each lane:

```
PLAN: <plan title>, lane <x>, steps <n, m>
START: before any edit, run `git switch -c feature/<plan-slug>-<lane> <tip SHA>` and
  check that `git rev-parse HEAD` equals <tip SHA>. If not, stop and report.
STEPS: <copy each step verbatim from the plan: title, commit header, files, done-when>
FILES YOU OWN: <paths>, plus mergeable entries for your own files
DO NOT TOUCH: any other file, the database, shared config not listed above
PER STEP: implement, build with the plan's build command, commit with the exact header
  from the plan, following the git skill. One step = one commit. Never squash.
IF A STEP CANNOT BE DONE AS PLANNED: stop, do not improvise, report why.
REPORT (15 lines max): commits created, build result per step, deviations, open risks.
```

When a wave's lanes are done, update the Dispatch table. A failed lane gets **one** retry
with its report as context, then escalates. Do not integrate a wave with a failed lane.

### 6. Integrate each wave in plan order

After every wave, not once at the end. The plan's step list is the target commit history.
Parallel mode: on `feature/<plan-slug>`, cherry-pick the wave's commits **in plan step
order**, resolve mergeable files by union (any other conflict means the lanes were not
independent: stop and report), build after each cherry-pick, and note the new tip SHA.

After the last wave, run the plan's Validation > Tests, including tests that need the
database once the schema is applied.

### 7. Read-only review

Once integrated, review the diff `main...feature/<plan-slug>` once per concern present in
the plan's flags, plus a standards review. In parallel mode, run them as parallel reviewer
subagents, each read-only. Consolidate findings as blocking / to fix / suggestion. Blocking
fixes follow the same one-step-one-commit rule.

## Final report

End with: steps done / failed / escalated, the integration branch and its build and test
status, open review findings, deviations from the plan, and cleanup to do (worktrees and
`feature/<plan-slug>-*` lane branches).

## Quick checklist

- [ ] The plan was approved before dispatch, and the execution mode is stated
- [ ] Hidden shared files were added to each step, as mergeable or exclusive
- [ ] No two lanes in a wave share a listed file or an exclusive file
- [ ] Data scripts are in wave 0, committed but not executed until the user says so
- [ ] Every flagged step has a pause before its dependents
- [ ] A linear plan was reported as linear, not forced into parallel lanes
- [ ] Each wave was integrated before the next one started
- [ ] Integrated history matches the plan's step order, one commit per step

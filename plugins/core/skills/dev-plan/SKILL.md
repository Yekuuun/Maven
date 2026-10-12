---
name: dev-plan
description: >
  Build a structured development plan before any code: summary, scope, impacts,
  dependencies, risks, open questions, ordered one-commit steps, validation. Use
  whenever the user asks to plan, scope or break down a feature, refactor or migration,
  and in plan mode for a development task. Do not use to write the code, to describe a
  finished change (PR, commit), or for a question needing an answer rather than a plan.
---

# Development plan

A plan exists so the user can catch a wrong assumption *before* it becomes code. Every
section serves that purpose: if a section would only restate the request, cut it or
merge it.

## Process

1. **Check the request is plannable.** If the goal or expected behaviour is unclear,
   ask first. A plan built on a guess looks authoritative and gets approved as-is.
   Ask only the questions whose answer changes scope or steps; batch them in one message.
2. **Read the existing code.** Open the files the change will touch and their closest
   existing equivalent. Only files actually opened go into the plan: an invented path
   sends the implementation looking for something that does not exist.
3. **Choose the plan size** (see below), then write it in the language of the request.
4. **Stop.** In plan mode, the plan is what the user approves. Outside plan mode,
   present it and wait for an explicit go before editing anything.

## Light or full plan

Use the **light plan** only when all of these hold; otherwise use the full plan:

- 3 files or fewer, in a single layer
- no step triggers a review flag
- no open question left

A light plan keeps **Summary**, **Impacts**, **Steps** and **Validation > Build**.
Skip the other sections rather than leaving them empty.

## Full plan template

```markdown
# <Title>

## Summary
<What changes, for whom, and why, in 3 to 5 lines.>

## Scope
- **In:** <...>
- **Out:** <what a reader might expect but is deliberately excluded>

## Existing code analysed
- `<path>`: <role in this change>

## Impacts
- **Data:** <schema, migrations, stored data format, or none>
- **Public contract:** <API endpoints, public signatures used by other code or services, or none>
- **Personal data:** <personal data read, exposed, logged or stored, or none>
- **Config / deployment:** <config keys, secrets, infrastructure, new dependencies, or none>
- **Breaking change:** <yes: who is affected / no>

## Dependencies
- **Between steps:** <step N needs step M>
- **External:** <other team, service, infra change, or none>

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|

## Assumptions and open questions
- **Assumed:** <what was decided without asking, so the user can object>
- **To confirm:** <non-blocking questions>

## Steps

### Step 1: <title>
- **Commit:** `<TYPE>(<scope>): <subject>`
- **Depends on:** <step numbers, or none>
- **Files:** `<path>`, `<path>`
- **Standard:** <skill or convention that applies>
- **Done when:** <observable result>
- **Review required:** <reason> *(only when a flag applies)*

## Validation
- **Build:** <exact command>
- **Tests:** <automated tests added or run>
- **Manual check:** <what to run or call, with which data>
- **Rollback:** <how to undo, especially for data and deployment steps>
```

## Steps rules

- **One step = one commit.** If a step needs two commit types, it is two steps.
- **Order by dependency.** A step never uses something a later step creates.
- **Each step leaves the project building** with the command under Validation > Build.
  A step that only compiles once the next one lands must be merged with it.
- **Every step states what it depends on.** This keeps the order checkable and lets
  `dev-plan-dispatch` read the graph without interpreting prose.

## Review flags

Mark a step `Review required` when it touches any of these. They are the changes a
reviewer cannot judge from the diff alone:

| Flag | Examples |
|---|---|
| Schema / migrations | column added or dropped, migration script, stored procedure signature changed |
| Public contract | API endpoint added, changed or removed; signature consumed by another service |
| Personal data | personal data newly read, exposed, logged or stored |
| Config / deployment | config keys, connection strings, secrets, new dependency, removal of code still deployed |

State the reason in the flag, not just the flag: "changes the signature of
`GetOrders`, also called by `billing-worker`" tells the reviewer where to look.

## Quick checklist

- [ ] Every open question that changes scope was asked, not assumed
- [ ] Every file path was opened during analysis
- [ ] Steps are ordered by dependency, each states its `Depends on`, each is one commit
- [ ] The build command is named under Validation
- [ ] Every data, contract, personal-data or config change carries a review flag with its reason
- [ ] Light plan used only if all three light-plan conditions hold
- [ ] Written in the language of the request

# Contributing to Maven

## Layout

```
.claude-plugin/marketplace.json   # lists every plugin and mod
plugins/<name>/                   # skills, agents and commands for a stack or workflow
  .claude-plugin/plugin.json      # name, version, description, dependencies
  skills/<skill>/SKILL.md
  skills/<skill>/references/      # optional long-form material, loaded on demand
  agents/<agent>.md
  commands/<command>.md
mods/<name>/                      # mods: code that changes Claude Code's own interface
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.ts
  hooks/register.test.ts
```

Mods are plugins too, but they stay in `mods/`, apart from `plugins/`. See [mods/README.md](mods/README.md).

## Adding a plugin

1. Create `plugins/<name>/.claude-plugin/plugin.json` with `name`, `version: "0.1.0"`, and a
   one-line `description`.
2. Add an entry to `.claude-plugin/marketplace.json` with `"source": "./plugins/<name>"`. A mod goes
   under `mods/` instead, with `"source": "./mods/<name>"`, and follows [mods/README.md](mods/README.md).
3. If it builds on another plugin, list it in `dependencies` and add only what is specific
   to this plugin.
4. Add the plugin to the table in `README.md`.

A plugin with no content does not belong in the marketplace yet.

## Adding a skill or agent

- Kebab-case names. The folder name matches the `name:` field exactly.
- The `description` is a trigger condition: say when to use it, not what it is.
- One concern per skill. If a skill needs two unrelated checklists, split it.
- Cross-references use the exact `name:` of the target, and the plugin prefix when the
  target lives in another plugin (`core:dev-plan`).
- Relative links inside a skill point to files that exist. Check them before committing.

## Rules of placement

- Rule true for any project in a language: that language's plugin.
- Rule only for a domain: the domain plugin, depending on the language plugin.
- Workflow not tied to a language (git, planning): `core`.
- Code that changes Claude Code's interface or behaviour (status line, panes, guards on tool calls): `mods/`, never `plugins/`.
- Material tied to a specific employer, client, or internal system does not go in this
  repository. Keep it in a separate private repository.

## Versioning

- Semver per plugin. Bump the patch for content fixes, minor for new skills or agents, major
  for renames or removals.
- Bump the version in `plugin.json` in the same commit as the change.

## Validation

```bash
claude plugin validate .
```

Run it before committing.

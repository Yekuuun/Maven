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
  hooks/register.tsx
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
- Relative links inside a skill point to files that exist. `scripts/validate.py` checks them.

## Rules of placement

- Rule true for any project in a language: that language's plugin.
- Rule only for a domain: the domain plugin, depending on the language plugin.
- Workflow not tied to a language (git, planning): `core`.
- Code that changes Claude Code's interface or behaviour (status line, panes, guards on tool calls): `mods/`, never `plugins/`.
- Material tied to a specific employer, client, or internal system does not go in this
  repository. Keep it in a separate private repository.

## Testing a change

Run [`try.py`](docs/scripts.md#trypy) from the repository where the plugin is meant to work:

```bash
python ~/code/Maven/scripts/try.py feature/my-branch --plugins csharp
```

The plugins of the branch replace the installed ones for that session only. Nothing to uninstall,
nothing to reinstall. Pass the path of your clone instead of a branch to load uncommitted work,
and `/reload-plugins` after each edit.

## Versioning

Semver per plugin and per mod, in `plugin.json` only, never in the catalog.

**Do not bump in a pull request.** After each push to `main`, the
[release workflow](.github/workflows/release.yml) bumps every plugin the push changed, at the level
its commits call for, and pushes a `CHORE(release): bump ...` commit:

- `FIX`, `DOCS`, `REFACTOR` and other types: patch
- `FEAT`, `NEW`, `UPDATE`: minor
- `!` after the type, or a `BREAKING CHANGE` line: major (renames, removals)

So the commit type is the version decision: pick it with that in mind. With a squash merge, the
pull request title becomes the only commit and decides for every plugin it touches; a merge commit
or a rebase keeps each commit's level. A bump made by hand in the
pull request (`python scripts/bump.py csharp --level major`) is kept as is.

## Validation

```bash
python scripts/validate.py
```

```bash
claude plugin validate . --strict
```

`validate.py` checks the catalog against the manifests, the skills and the relative links. The
[checks workflow](.github/workflows/checks.yml) runs both on every pull request, plus
`claude plugin test` on each mod. Run them locally before pushing to save a round trip.

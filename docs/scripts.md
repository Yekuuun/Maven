# Scripts

Helper scripts live in `scripts/`. They need the `claude` CLI, `jq` (for `new-plugin.sh`), and bash.
Run them from the repository root, or with the full path.

| Script | Purpose |
| --- | --- |
| [`install-plugins.sh`](#install-pluginssh) | Install one or more plugins into a scope, adding the marketplace if needed |
| [`validate-all.sh`](#validate-allsh) | Validate the marketplace and every plugin |
| [`new-plugin.sh`](#new-pluginsh) | Scaffold a plugin and register it in the marketplace |

## install-plugins.sh

```bash
scripts/install-plugins.sh [-s user|project|local] [-m <source>] [-n] <plugin>...
```

| Option | Meaning |
| --- | --- |
| `-s` | Install scope. Default `user`. |
| `-m` | Marketplace source: `owner/repo`, a git URL, or a local path. Default `Yekuuun/Maven`. |
| `-n` | Dry run. Prints the `claude plugin install` commands without running them. |
| `-h` | Help. |

Examples:

```bash
scripts/install-plugins.sh core csharp
scripts/install-plugins.sh -s project c ebpf
scripts/install-plugins.sh -m ~/code/Maven ebpf
```

Each install passes `--marketplace`, so the marketplace is added the first time it is needed.
`--yes` is set, so the script runs non-interactively. Read the dry run first if you are unsure.

## validate-all.sh

```bash
scripts/validate-all.sh [--strict]
```

Runs `claude plugin validate` on the marketplace and on each folder in `plugins/`. It exits non-zero
if any target fails. `--strict` treats warnings as errors, which is the right setting before a commit
or in CI.

Run it after every change to a plugin, before committing.

## new-plugin.sh

```bash
scripts/new-plugin.sh <name> "<one-line description>" [dependency...]
```

Example:

```bash
scripts/new-plugin.sh aspnet "ASP.NET Core conventions and review." csharp
```

It creates:

- `plugins/<name>/.claude-plugin/plugin.json`, with `version` set to `0.1.0`, and `dependencies` when given.
- `plugins/<name>/skills/`, empty. Add `skills/<skill>/SKILL.md` next.

It also appends the plugin to `.claude-plugin/marketplace.json`.

The script refuses names that are not kebab-case, existing plugins, and dependencies that are not
plugins in this marketplace.

After scaffolding, add the plugin to the table in `README.md` and to [Plugins](plugins.md), then run
`scripts/validate-all.sh`.

# Scripts

Helper scripts live in `scripts/`. The Python ones need python3 only, no package, and run as they
are on Linux, macOS and Windows. `new-plugin.sh` needs bash and `jq`.

| Script | Purpose |
| --- | --- |
| [`try.py`](#trypy) | Start Claude Code in another repository with the plugins of a Maven branch, for that session only |
| [`validate.py`](#validatepy) | Check the catalog, the manifests, the skills and the links. Run by CI on every pull request |
| [`bump.py`](#bumppy) | Bump a plugin's semver version. Run by CI after every merge on `main` |
| [`new-plugin.sh`](#new-pluginsh) | Scaffold a plugin and register it in the marketplace |

Installing needs no script: `claude plugin install <plugin>@maven --marketplace Yekuuun/Maven`.
See [Install](install.md).

## try.py

```bash
python ~/code/Maven/scripts/try.py <branch | path of a Maven clone> [--plugins a,b] [-- <claude args>]
```

Run it **from the repository you want to test in**. It checks the branch out in a worktree next to
your clone (`../maven-worktrees/<branch>`), then starts `claude` with one `--plugin-dir` per plugin.
Those plugins replace the installed ones of the same name **for that session only**: nothing to
uninstall before, nothing to reinstall after.

```bash
python ~/code/Maven/scripts/try.py feature/aspnet-skill --plugins csharp
python ~/code/Maven/scripts/try.py ~/code/Maven                 # your clone, uncommitted changes included
```

With a clone path, edit a skill and run `/reload-plugins` in the session to pick the change up.
Rerunning on the same branch updates its worktree. Remove one with
`git -C ~/code/Maven worktree remove ../maven-worktrees/<branch>`, the branch's `/` turned into `_`.

## validate.py

```bash
python scripts/validate.py
```

Checks what `claude plugin validate` does not:

- every catalog entry points at `./plugins/<name>` or `./mods/<name>`
- `name` and `description` match between `.claude-plugin/marketplace.json` and the plugin's `plugin.json`
- the version is semver, and lives in `plugin.json` only (never in the catalog)
- every dependency is a plugin of this marketplace
- a skill folder matches the `name` of its frontmatter, and has a `description`
- relative links in skills, agents and commands point at files that exist

The [checks workflow](../.github/workflows/checks.yml) runs it on every pull request, with
`claude plugin validate --strict` on the catalog and each plugin, and `claude plugin test` on each mod.

## bump.py

```bash
python scripts/bump.py core                         # patch
python scripts/bump.py csharp --level minor
python scripts/bump.py --since <commit> [--until <commit>]
```

You rarely run it: the [release workflow](../.github/workflows/release.yml) runs `--since` after
every push to `main`. It bumps each plugin or mod that the push changed, at the level its
conventional commits call for:

| Commits touching the plugin | Level |
| --- | --- |
| `TYPE(scope)!: ...` or a `BREAKING CHANGE` line | major |
| `FEAT`, `NEW`, `UPDATE` | minor |
| anything else (`FIX`, `DOCS`, `REFACTOR`...) | patch |

A plugin whose version already changed in the pull request keeps that bump. Rerunning the workflow
never bumps twice.

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
`python scripts/validate.py`.

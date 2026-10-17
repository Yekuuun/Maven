# Install

## Requirements

- Claude Code installed, with the `claude` command on your `PATH`.
- Git access to `github.com/Yekuuun/Maven`, or a local clone of it.

## 1. Add the marketplace

The marketplace is named `maven`. Add it once per machine.

From the terminal:

```bash
claude plugin marketplace add Yekuuun/Maven
```

From inside a Claude Code session, the same thing is:

```text
/plugin marketplace add Yekuuun/Maven
```

To list what is registered:

```bash
claude plugin marketplace list
```

## 2. Install plugins

Install a plugin with `<plugin>@maven`. The available plugins are `core`, `csharp`, `c`, and `ebpf`
(see [Plugins](plugins.md)).

```bash
claude plugin install core@maven --scope user
claude plugin install csharp@maven --scope user
```

`ebpf` depends on `c`, so installing `ebpf` also installs `c`.

### Choosing a scope

| Scope | Where it is recorded | Use it for |
| --- | --- | --- |
| `user` (default) | your user settings, active in every project | personal tooling you always want (`core`) |
| `project` | the project's shared settings, committed with the repo | a stack a team shares (`csharp` in a .NET repo) |
| `local` | the project's settings, not committed | stack plugins you only want on this machine |

For a single project, `project` scope is usually the right choice. Commit the resulting
settings file so the setup travels with the repository.

### In one command

`--marketplace` adds the marketplace on first use, so a plugin installs in a single command:

```bash
claude plugin install core@maven --marketplace Yekuuun/Maven --scope user
```

To try a branch before it is merged, without touching what is installed, see
[`try.py`](scripts.md#trypy).

## 3. Confirm

```bash
claude plugin list
```

Start a Claude Code session in the project. The skills, agents and commands from the installed
plugins are available right away.

## Installing from a local clone

Useful when you are changing Maven itself and want the installed plugins to match your working copy.

```bash
git clone https://github.com/Yekuuun/Maven.git ~/code/Maven
claude plugin marketplace add ~/code/Maven
claude plugin install core@maven --scope user
```

With a local path, edits to `plugins/<name>` reach a session after `/reload-plugins`. Run
`claude plugin update <plugin>@maven` only when a plugin installed from a git source has a new
version.

## Updating

```bash
claude plugin marketplace update maven        # fetch the latest marketplace
claude plugin update core@maven               # update one plugin
```

Restart the session, or run `/reload-plugins`, to apply the update.

## Uninstalling

```bash
claude plugin uninstall ebpf@maven --scope user
claude plugin marketplace remove maven        # removes the marketplace, not the plugins
```

Removing `c` while `ebpf` is installed can break `ebpf`. Uninstall `ebpf` first, then `c`.
Add `--prune` to also remove dependencies nothing else needs. The CLI asks for confirmation before it prunes.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| `Plugin "<name>" not found in marketplace "maven"` | Run `claude plugin marketplace update maven`, then retry. The plugin name is spelled as in [Plugins](plugins.md). |
| `Marketplace file not found` | The source has no `.claude-plugin/marketplace.json`. Check the path or the repository. |
| Skills do not trigger | Run `claude plugin validate <plugin folder>`. Then check that the plugin shows as enabled in `claude plugin list`. |
| Plugin changes do not show | Run `/reload-plugins` in the session, or restart it. |

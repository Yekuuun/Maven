# Mods

Mods change Claude Code's own interface or behaviour: a status line entry, a pane, a guard on
tool calls, a slash command. A mod is a plugin with a hooks module, so it installs the same way.

They live here, in `mods/`, and not in `plugins/`. `plugins/` holds skills, agents and commands
for a stack or a workflow. `mods/` holds the code that changes how Claude Code itself behaves.
Keep the two apart, so the business logic of a project is never mixed with interface code.

## Layout

```
mods/<mod-name>/
  .claude-plugin/plugin.json   # name, version, description, types
  hooks/hooks.json             # { "modules": ["./register.tsx"] }
  hooks/register.tsx           # the hooks module
  hooks/register.test.ts       # run with: claude plugin test mods/<mod-name>
  types/index.d.ts             # only if the mod keeps values in $.state
```

## Adding a mod

1. Build the mod in `mods/<mod-name>/` following the layout above. The `plugin-authoring` skill
   covers the API, drawing, state and testing.
2. Check it with `claude plugin validate mods/<mod-name> --strict` and `claude plugin test mods/<mod-name>`.
   CI runs both on every pull request.
3. Keep it portable: no `sh -c` or Unix-only command. Read the user and home with `$.env.get`
   (`USER`/`USERNAME`, `HOME`/`USERPROFILE`), and wrap `$.process.run` in a `try`: it rejects when
   the executable is missing, which would stop the hook.
4. Register it in `.claude-plugin/marketplace.json` with `"source": "./mods/<mod-name>"`.
5. Add it to the table in the README and to `docs/plugins.md`.

A mod is versioned like a plugin: the release workflow bumps it after the merge.

## Installing a mod

```text
/plugin install <mod-name> --marketplace Yekuuun/Maven
```

Installing runs code with your permissions. Read a mod before you install it.

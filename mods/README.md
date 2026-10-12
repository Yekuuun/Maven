# Mods

Mods change Claude Code's own interface or behaviour: a status line entry, a pane, a guard on
tool calls, a slash command. A mod is a plugin with a hooks module, so it installs the same way.

They live here, in `mods/`, and not in `plugins/`. `plugins/` holds skills, agents and commands
for a stack or a workflow. `mods/` holds the code that changes how Claude Code itself behaves.
Keep the two apart, so the business logic of a project is never mixed with interface code.

## Layout

```
mods/<mod-name>/
  .claude-plugin/plugin.json   # name, version, description
  hooks/hooks.json             # { "modules": ["./register.ts"] }
  hooks/register.ts            # the hooks module
  hooks/register.test.ts       # run with: claude plugin test mods/<mod-name>
  types/index.d.ts             # only if the mod keeps values in $.state
```

## Adding a mod

1. Build the mod in `mods/<mod-name>/` following the layout above. The `plugin-authoring` skill
   covers the API, drawing, state and testing.
2. Check it with `claude plugin validate mods/<mod-name>` and `claude plugin test mods/<mod-name>`.
3. Register it in `.claude-plugin/marketplace.json` with `"source": "./mods/<mod-name>"`.
4. Add it to the table in the README and to `docs/plugins.md`.

## Installing a mod

```text
/plugin install <mod-name> --marketplace Yekuuun/Maven
```

Installing runs code with your permissions. Read a mod before you install it.

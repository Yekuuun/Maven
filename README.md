# Maven

Personal Claude Code marketplace: generic standards, reviewers and workflows, split so each
project installs only the context it needs.

## Plugins

| Plugin | Contents | Depends on |
| --- | --- | --- |
| `core` | git conventions, development plans, plan review, dispatch, skill tooling | none |
| `csharp` | modern C# standards, concurrency patterns, .NET reviewer and performance agents | none |
| `c` | C memory-safety review | none |
| `ebpf` | eBPF / libbpf review and verifier-error help | `c` |

## Install

Add the marketplace once:

```text
/plugin marketplace add Yekuuun/Maven
```

Then install what a project needs:

```text
/plugin install core@maven
/plugin install csharp@maven
/plugin install c@maven
/plugin install ebpf@maven
```

`ebpf` pulls in `c` automatically.

## Layering

- **core** is installed everywhere.
- **Language plugins** (`csharp`, `c`) hold rules that hold for any project in that language.
- **Domain plugins** (`ebpf`) build on a language and only add what is specific to the
  domain. A C memory rule lives in `c`, never copied into `ebpf`.
- **Mods** live in `mods/`, apart from `plugins/`. They change how Claude Code itself behaves,
  so their interface code stays separate from the business logic in `plugins/`.

## Documentation

- [docs/](docs/README.md): install, usage, plugin reference, and scripts.
- [CONTRIBUTING.md](CONTRIBUTING.md): how plugins are structured and versioned.
- `scripts/`: [install-plugins.sh](docs/scripts.md#install-pluginssh), [validate-all.sh](docs/scripts.md#validate-allsh), [new-plugin.sh](docs/scripts.md#new-pluginsh).

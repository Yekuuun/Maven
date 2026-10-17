# Plugins

Each plugin is a folder under `plugins/`. The name in the table is the name you install with,
for example `core@maven`.

## At a glance

| Plugin | Install when | Depends on |
| --- | --- | --- |
| [`core`](#core) | always, on every machine | none |
| [`csharp`](#csharp) | the project is C# / .NET | none |
| [`c`](#c) | the project is C | none |
| [`ebpf`](#ebpf) | the project is eBPF / libbpf | `c` |

## core

Stack-agnostic workflow. Install it everywhere.

| Component | Name | Purpose |
| --- | --- | --- |
| Skill | `git` | Commit message and branch naming conventions. Reference details in `references/conventions.md`. |
| Skill | `dev-plan` | Structured development plan: scope, impacts, dependencies, review flags, ordered steps. |
| Skill | `dev-plan-dispatch` | Runs an approved plan as parallel lanes and waves, integrating commits in plan order. |
| Agent | `plan-challenger` | Read-only critic of a plan, checked against the real code. |
| Agent | `skill-curator` | Proposes skill edits from corrections you keep giving. Read-only. |
| Command | `/core:commit` | Writes a commit for the current changes. Never pushes. |
| Command | `/core:skill-creator` | Guided creation of a new skill. |

## csharp

Modern C# and .NET, for projects on .NET 6 and later.

| Component | Name | Purpose |
| --- | --- | --- |
| Skill | `modern-csharp` | Records, nullable reference types, value objects, async with cancellation, Span / Memory, API design. Not for .NET Framework 4.8 or C# 7.3 projects. |
| Skill | `concurrency-patterns` | Chooses the right tool: async/await, Parallel.ForEachAsync, Channels, Rx, Akka.NET. |
| Agent | `dotnet-reviewer` | Read-only review of a diff or branch, with an optional concern: migrations, public API, personal data, config. |
| Agent | `dotnet-concurrency-specialist` | Analyses races, deadlocks and thread-safety problems. |
| Agent | `dotnet-performance-analyst` | Interprets profiler and benchmark results, and flags allocation and dispatch costs. |

The two skills are reference skills (`user-invocable: false`). Claude loads them when your code
matches, not from a command.

## c

C memory safety and security.

| Component | Name | Purpose |
| --- | --- | --- |
| Skill | `c-syntax` | House C style: file headers and guards, naming and prefixes, indentation, braces, banners, doc comments, struct layout and return conventions. Linux kernel style as fallback. |
| Skill | `c-memory-safety-review` | Checklist for bounds, lifetimes, allocation, integer overflow, undefined behaviour, error paths, and input handling. Includes the sanitizer, valgrind and gdb workflow. |

## ebpf

eBPF with libbpf and CO-RE. Requires `c`, which is installed automatically.

| Component | Name | Purpose |
| --- | --- | --- |
| Skill | `ebpf-review` | Verifier-friendly code, map and ring buffer patterns, CO-RE portability, attach lifecycle, and mapping verifier rejections to their rule. |
| Skill | `map-expert` | Choosing and using eBPF map types: per-CPU vs shared, LRU, arrays, ring buffer vs perf, storage maps, redirect maps, flags, pinning and map APIs. Reference catalogue in `references/map-types.md`. |
| Skill | `verifier-loops` | Loops and buffer bounds the verifier accepts: `for` vs `bpf_loop()`, nested loops, bounds lost across callbacks, power-of-two masks, and reading complexity-limit errors. |

## Mods

Mods change Claude Code's interface or behaviour. They live in `mods/`, apart from `plugins/`, and install the same way.
See [mods/README.md](../mods/README.md).

| Mod | What it shows | Surfaces |
| --- | --- | --- |
| `prompt-band` | The git branch and the context window above the prompt, with a bar per running or finished agent. Red while an agent works, green when it completes. | terminal, desktop |

Install with `/plugin install prompt-band --marketplace Yekuuun/Maven`.

## Adding a plugin

See [Contributing](../CONTRIBUTING.md), or use [`scripts/new-plugin.sh`](scripts.md#new-pluginsh) to scaffold one.

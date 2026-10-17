# Maven documentation

Maven is a personal Claude Code marketplace. It holds the skills, agents, and commands I
use across projects, grouped into plugins so each project installs only what it needs.

| Page | Read it for |
| --- | --- |
| [Install](install.md) | Adding the marketplace and installing plugins, in a terminal or from scripts |
| [Usage](usage.md) | How skills, agents and commands are triggered, plus updating and removing plugins |
| [Plugins](plugins.md) | What each plugin contains, and when to install it |
| [Scripts](scripts.md) | Helper scripts for installing, validating and scaffolding plugins |
| [Contributing](../CONTRIBUTING.md) | Layout, naming rules, versioning, and adding a plugin |

## Quick start

```bash
# 1. Add the marketplace once
claude plugin marketplace add Yekuuun/Maven

# 2. Install what the project needs
claude plugin install core@maven --scope user
claude plugin install csharp@maven --scope user
```

`--marketplace` does step 1 on the fly:

```bash
claude plugin install core@maven --marketplace Yekuuun/Maven --scope user
```

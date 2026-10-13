#!/usr/bin/env python3
"""Checks the marketplace before a commit or a pull request.

Each plugin and mod declares its identity in two places:

  .claude-plugin/marketplace.json          the catalog: source, description
  <plugins|mods>/<name>/.claude-plugin/plugin.json
                                           the manifest: the only place that
                                           holds the version

Nothing forces the two to agree at runtime: a plugin whose description differs
installs anyway, and a 'version' in the catalog is silently overridden by the
manifest's. This script catches what Claude Code does not:

  - every catalog entry points at ./plugins/<name> or ./mods/<name>
  - name and description match between catalog and manifest
  - the version is semver (X.Y.Z), in the manifest only
  - every dependency is a plugin of this marketplace
  - a skill folder matches the 'name' of its frontmatter, and has a description
  - relative links in skills, agents and commands point at files that exist

Versions are not checked for a bump: the release workflow bumps them after each
merge on main (scripts/bump.py --since).

Usage:
  python scripts/validate.py

Exits 1 when a problem is found.
"""
import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE_DIRS = ("plugins", "mods")
SEMVER = re.compile(r"^\d+\.\d+\.\d+$")
# A markdown link whose target is a relative path: no scheme, no anchor-only.
LINK = re.compile(r"\]\((?!https?:|mailto:|#)([^)\s]+)\)")


def load(path):
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def rel(path):
    return path.relative_to(ROOT).as_posix()


def frontmatter_field(text, field):
    """Reads a scalar field from a SKILL.md YAML frontmatter.

    Deliberately without PyYAML, so the script runs on a bare python3. Handles
    the one-line form and the folded '>' / '|' blocks used in this repository.
    """
    block = re.match(r"^---\r?\n(.*?)\r?\n---\r?\n", text, re.S)
    if not block:
        return None
    inline = re.search(rf"^{field}:[ \t]*(?![>|]\s*$)(.+)$", block.group(1), re.M)
    if inline:
        return inline.group(1).strip()
    folded = re.search(rf"^{field}:[ \t]*[>|]-?[ \t]*\n((?:[ \t]+.*\n?)+)", block.group(1), re.M)
    return " ".join(folded.group(1).split()) if folded else None


def check_skills(plugin_dir, name, problems):
    """A folder whose name differs from 'name', or a SKILL.md without a
    description, gives a skill that never triggers rather than an error."""
    skills_dir = plugin_dir / "skills"
    if not skills_dir.is_dir():
        return
    for entry in sorted(p for p in skills_dir.iterdir() if p.is_dir()):
        skill_md = entry / "SKILL.md"
        if not skill_md.is_file():
            problems.append((name, "skills", {rel(skill_md): "missing file"}))
            continue
        text = skill_md.read_text(encoding="utf-8")
        declared = frontmatter_field(text, "name")
        if declared != entry.name:
            problems.append((name, "skills", {"folder": entry.name, f"{rel(skill_md)} -> name": declared}))
        if not frontmatter_field(text, "description"):
            problems.append((name, "skills", {rel(skill_md): "missing description"}))


def check_links(plugin_dir, name, problems):
    """Relative links in markdown files must reach a file inside the repository."""
    for md in sorted(plugin_dir.rglob("*.md")):
        text = md.read_text(encoding="utf-8")
        # Fenced code is example text, not navigation.
        text = re.sub(r"```.*?```", "", text, flags=re.S)
        for target in LINK.findall(text):
            path = target.split("#", 1)[0]
            if path and not (md.parent / path).exists():
                problems.append((name, "link", {rel(md): f"broken link: {target}"}))


def main():
    argparse.ArgumentParser(description="Validates the Maven marketplace.").parse_args()

    problems = []
    market = load(ROOT / ".claude-plugin" / "marketplace.json")
    names = {e["name"] for e in market["plugins"]}

    if "version" in market.get("metadata", {}):
        problems.append(("catalog", "version", {"metadata.version": "unused, remove it"}))

    for entry in market["plugins"]:
        name = entry["name"]
        source = entry.get("source", "")
        allowed = tuple(f"./{d}/{name}" for d in SOURCE_DIRS)
        if source not in allowed:
            problems.append((name, "source", {"expected": " or ".join(allowed), "declared": source}))
            continue

        if "version" in entry:
            problems.append((name, "version", {"catalog": "remove it: the version lives in plugin.json"}))

        plugin_dir = ROOT / source.removeprefix("./")
        manifest_path = plugin_dir / ".claude-plugin" / "plugin.json"
        if not manifest_path.is_file():
            problems.append((name, "manifest", {rel(manifest_path): "missing file"}))
            continue
        manifest = load(manifest_path)

        for field in ("name", "description"):
            if manifest.get(field) != entry.get(field):
                problems.append((name, field, {
                    ".claude-plugin/marketplace.json": entry.get(field),
                    rel(manifest_path): manifest.get(field),
                }))

        if not SEMVER.match(str(manifest.get("version", ""))):
            problems.append((name, "version", {"expected": "X.Y.Z", rel(manifest_path): manifest.get("version")}))

        for dep in manifest.get("dependencies", []):
            dep_name = dep if isinstance(dep, str) else dep.get("name")
            if dep_name not in names:
                problems.append((name, "dependencies", {rel(manifest_path): f"unknown plugin: {dep_name}"}))

        check_skills(plugin_dir, name, problems)
        check_links(plugin_dir, name, problems)

    for subject, field, values in problems:
        print(f"problem  {subject}.{field}")
        for key, value in values.items():
            print(f"    {key:<44} {value!r}")

    if problems:
        print(f"\n{len(problems)} problem(s).")
        return 1

    skills = sum(1 for d in SOURCE_DIRS for _ in ROOT.glob(f"{d}/*/skills/*/SKILL.md"))
    print(f"{len(market['plugins'])} plugin(s), {skills} skill(s), marketplace consistent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

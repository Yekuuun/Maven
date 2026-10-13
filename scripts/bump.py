#!/usr/bin/env python3
"""Bumps the semver version of plugins and mods.

The version lives in one place, <plugins|mods>/<name>/.claude-plugin/plugin.json.
Claude Code caches a plugin by that version: without a bump, an update never
reaches anyone.

The release workflow (.github/workflows/release.yml) runs --since after each
push to main, so nobody bumps by hand. The level comes from the conventional
commits that touched each plugin:

  TYPE(scope)!: ...  or a 'BREAKING CHANGE' line   -> major
  FEAT / NEW / UPDATE                              -> minor
  anything else (FIX, DOCS, REFACTOR, ...)         -> patch

Usage:
  python scripts/bump.py core                    # patch
  python scripts/bump.py csharp --level minor
  python scripts/bump.py --since <commit> [--until <commit>]

With --since, a plugin is bumped when a file of it changed between the two
commits (--until defaults to HEAD), unless its version already moved on that
range (a bump made by hand in the pull request) or on HEAD since (a rerun of the
workflow). The last line printed is 'bumped: <name> <version>, ...', empty when
there is nothing to bump.
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
VERSION_LINE = re.compile(r'("version"\s*:\s*")([^"]*)(")')
HEADER = re.compile(r"^(?P<type>[A-Za-z]+)(\([^)]*\))?(?P<bang>!)?:")
LEVELS = ("patch", "minor", "major")
MINOR_TYPES = {"FEAT", "NEW", "UPDATE"}


def git(*args, check=True):
    result = subprocess.run(["git", "-C", str(ROOT), *args],
                            capture_output=True, text=True, encoding="utf-8")
    if check and result.returncode != 0:
        sys.exit(f"failed: git {' '.join(args)}\n{result.stderr.strip()}")
    return result


def plugin_dirs():
    """Folder of each plugin and mod, from the catalog: name -> 'plugins/core'."""
    catalog = json.loads((ROOT / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))
    return {e["name"]: e["source"].removeprefix("./") for e in catalog["plugins"]}


def version_at(commit, folder):
    shown = git("show", f"{commit}:{folder}/.claude-plugin/plugin.json", check=False)
    return json.loads(shown.stdout).get("version") if shown.returncode == 0 else None


def level_of(since, until, folder):
    """Highest level among the commits of the range that touched the folder."""
    log = git("log", "--format=%B%x1e", f"{since}..{until}", "--", folder).stdout
    level = 0
    for message in filter(str.strip, log.split("\x1e")):
        match = HEADER.match(message.strip())
        if (match and match.group("bang")) or "BREAKING CHANGE" in message:
            return "major"
        if match and match.group("type").upper() in MINOR_TYPES:
            level = 1
    return LEVELS[level]


def changed(since, until):
    """Plugins changed on the range, with their level, minus those already bumped."""
    paths = git("diff", "--name-only", since, until).stdout.split()
    result = []
    for name, folder in sorted(plugin_dirs().items()):
        if not any(p.startswith(folder + "/") for p in paths):
            continue
        if not version_at(since, folder) == version_at(until, folder) == version_at("HEAD", folder):
            continue
        result.append((name, level_of(since, until, folder)))
    return result


def next_version(current, level):
    major, minor, patch = (int(x) for x in current.split("."))
    if level == "major":
        return f"{major + 1}.0.0"
    if level == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


def bump(name, level, dirs):
    if name not in dirs:
        sys.exit(f"unknown plugin: {name} (not in .claude-plugin/marketplace.json)")
    path = ROOT / dirs[name] / ".claude-plugin" / "plugin.json"

    # Text replacement rather than json.dump: the file keeps its layout and the
    # diff shows the version line only. newline="" keeps line endings as they are.
    with path.open(encoding="utf-8", newline="") as fh:
        text = fh.read()
    match = VERSION_LINE.search(text)
    if match is None:
        sys.exit(f"{path.relative_to(ROOT).as_posix()}: no version field")

    new = next_version(match.group(2), level)
    with path.open("w", encoding="utf-8", newline="") as fh:
        fh.write(VERSION_LINE.sub(rf"\g<1>{new}\g<3>", text, count=1))
    print(f"{name:<12} {match.group(2)} -> {new} ({level})")
    return new


def main():
    parser = argparse.ArgumentParser(description="Bumps the version of Maven plugins and mods.")
    parser.add_argument("names", nargs="*", help="plugins or mods to bump")
    parser.add_argument("--level", choices=LEVELS, default="patch", help="for named plugins (default: patch)")
    parser.add_argument("--since", help="bump what changed since this commit")
    parser.add_argument("--until", default="HEAD", help="end of the range (default: HEAD)")
    args = parser.parse_args()

    if args.since and args.names:
        sys.exit("--since or plugin names, not both")
    if not args.since and not args.names:
        parser.print_usage()
        sys.exit(1)

    dirs = plugin_dirs()
    targets = changed(args.since, args.until) if args.since else [(n, args.level) for n in args.names]
    bumped = [f"{name} {bump(name, level, dirs)}" for name, level in targets]
    print(f"bumped: {', '.join(bumped)}")


if __name__ == "__main__":
    main()

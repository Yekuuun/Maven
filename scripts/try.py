#!/usr/bin/env python3
"""Starts a Claude Code session on the plugins of a branch, uninstalling nothing.

Run it from the repository you want to test in, not from Maven. The branch is
checked out in a worktree next to this clone, then Claude starts with those
plugins loaded for this session only: they replace the installed plugins of
the same name, which come back as they were in the next session.

  python ~/code/Maven/scripts/try.py feature/my-branch
  python ~/code/Maven/scripts/try.py feature/my-branch --plugins core,csharp
  python ~/code/Maven/scripts/try.py ~/code/Maven            # your clone, as it is
  python ~/code/Maven/scripts/try.py feature/x -- --model sonnet

A path to a Maven clone loads it as it is, uncommitted changes included: the
mode for working on a skill. After an edit, '/reload-plugins' picks it up
without restarting.

Worktrees live in <parent of Maven>/maven-worktrees/, the branch's '/' turned
into '_'. Rerunning on the same branch updates it. To remove one:
git -C <Maven> worktree remove <path>.
"""
import argparse
import json
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WORKTREES = ROOT.parent / "maven-worktrees"


def git(*args):
    if subprocess.run(["git", "-C", str(ROOT), *args]).returncode != 0:
        sys.exit(f"failed: git {' '.join(args)}")


def checkout(branch):
    """Checks origin/<branch> out in a detached worktree, up to date with the remote.

    Detached rather than on the branch: a branch can be checked out in one
    worktree only, and it may already be in the main clone.
    """
    target = WORKTREES / re.sub(r"[^\w.-]", "_", branch)
    git("fetch", "--quiet", "origin", branch)
    if target.is_dir():
        subprocess.run(["git", "-C", str(target), "checkout", "--quiet", "--detach",
                        f"origin/{branch}"], check=True)
    else:
        git("worktree", "add", "--quiet", "--detach", str(target), f"origin/{branch}")
    return target


def plugin_dirs(maven, names):
    """Folders of the requested plugins and mods, or of all of them."""
    catalog = json.loads((maven / ".claude-plugin" / "marketplace.json").read_text(encoding="utf-8"))
    sources = {e["name"]: maven / e["source"].removeprefix("./") for e in catalog["plugins"]}
    wanted = names or list(sources)
    unknown = [n for n in wanted if n not in sources]
    if unknown:
        sys.exit(f"unknown on this branch: {', '.join(unknown)} (available: {', '.join(sources)})")
    return [sources[n] for n in wanted]


def main():
    parser = argparse.ArgumentParser(description="Tries the plugins of a Maven branch in the current repository.")
    parser.add_argument("ref", help="remote branch, or path of a Maven clone")
    parser.add_argument("--plugins", default="", help="comma-separated plugins or mods to load (default: all)")
    args, extra = parser.parse_known_args()

    claude = shutil.which("claude")
    if claude is None:
        sys.exit("'claude' is not on PATH")

    path = pathlib.Path(args.ref).expanduser()
    maven = path.resolve() if path.is_dir() else checkout(args.ref)
    if not (maven / ".claude-plugin" / "marketplace.json").is_file():
        sys.exit(f"{maven} is not a Maven clone (no .claude-plugin/marketplace.json)")
    dirs = plugin_dirs(maven, [n for n in args.plugins.split(",") if n])

    command = [claude]
    for d in dirs:
        command += ["--plugin-dir", str(d)]
    command += [a for a in extra if a != "--"]

    print(f"Maven   : {maven}")
    print(f"Plugins : {', '.join(d.name for d in dirs)}")
    print(f"Repo    : {pathlib.Path.cwd()}\n")
    sys.exit(subprocess.call(command))


if __name__ == "__main__":
    main()

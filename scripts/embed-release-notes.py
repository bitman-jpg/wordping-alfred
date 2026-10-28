#!/usr/bin/env python3
"""Put the matching release notes in Alfred's workflow import Readme."""

import plistlib
import sys
from pathlib import Path

notes_path = Path(sys.argv[1])
plist_path = Path(sys.argv[2])

with plist_path.open("rb") as source:
    workflow = plistlib.load(source)

version = workflow["version"]
if notes_path.name != f"v{version}.md":
    raise SystemExit(f"Release notes do not match workflow version {version}")

notes = notes_path.read_text(encoding="utf-8").strip()
if not notes:
    raise SystemExit(f"Release notes are empty: {notes_path}")

setup = workflow.get("readme", "").strip()
workflow["readme"] = f"# WordPing v{version} release notes\n\n{notes}\n\n---\n\n{setup}"

with plist_path.open("wb") as destination:
    plistlib.dump(workflow, destination)

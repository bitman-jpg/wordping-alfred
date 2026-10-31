"""Exercise security recovery without triggering Gatekeeper or opening Settings."""
import json
from pathlib import Path
import os
import subprocess
import tempfile
import unittest


class SecuritySetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="wordping-security-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "runtime").mkdir()
        (self.root / "scripts").mkdir()
        self.env = {**os.environ, "alfred_workflow_cache": str(self.root / "cache"),
                    "OPEN_LOG": str(self.root / "opened"), "QUARANTINED": "1",
                    "PROBE_STATUS": "137", "ASSESSMENT": "rejected"}
        stubs = {
            "/usr/bin/xattr": '[ "$QUARANTINED" = 1 ]',
            "/usr/sbin/spctl": 'echo "$ASSESSMENT"; exit 1',
            "/usr/bin/open": 'echo opened >> "$OPEN_LOG"',
        }
        source = (Path(__file__).resolve().parents[1] / "scripts/lookup.sh").read_text()
        for index, (command, body) in enumerate(stubs.items()):
            path = self.root / f"stub-{index}"
            path.write_text("#!/bin/sh\n" + body + "\n")
            path.chmod(0o755)
            source = source.replace(command, f'"{path}"')
        (self.root / "scripts/lookup.sh").write_text(source)
        runtime = self.root / "runtime/tjs"
        runtime.write_text('#!/bin/sh\nif [ "$1" = --version ]; then exit "$PROBE_STATUS"; fi\nprintf \'%s\\n\' "$3"\n')
        runtime.chmod(0o755)

    def run_lookup(self, query="hello world"):
        return subprocess.run(["/bin/sh", str(self.root / "scripts/lookup.sh"), query],
                              env=self.env, capture_output=True, text=True)

    def test_block_opens_once_and_returns_alfred_guidance(self):
        for _ in range(2):
            result = self.run_lookup()
            self.assertEqual(result.returncode, 0)
            self.assertIn("Allow tjs", json.loads(result.stdout)["items"][0]["title"])
        self.assertEqual((self.root / "opened").read_text(), "opened\n")

    def test_success_preserves_query_without_opening_settings(self):
        self.env["PROBE_STATUS"] = "0"
        result = self.run_lookup()
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "hello world\n")
        self.assertFalse((self.root / "opened").exists())

    def test_ordinary_failure_does_not_open_settings(self):
        self.env["PROBE_STATUS"] = "1"
        self.assertEqual(self.run_lookup().returncode, 1)
        self.assertFalse((self.root / "opened").exists())

    def test_killed_process_without_rejection_does_not_open_settings(self):
        self.env["ASSESSMENT"] = "accepted"
        self.assertEqual(self.run_lookup().returncode, 137)
        self.assertFalse((self.root / "opened").exists())

    def test_unquarantined_runtime_skips_probe(self):
        self.env["QUARANTINED"] = "0"
        self.assertEqual(self.run_lookup().stdout, "hello world\n")
        self.assertFalse((self.root / "opened").exists())


if __name__ == "__main__":
    unittest.main()

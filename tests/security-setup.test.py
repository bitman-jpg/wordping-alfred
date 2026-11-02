"""Exercise the explicit quarantine-removal action without launching Gatekeeper."""
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
        (self.root / "xattr-state").mkdir()
        self.env = {**os.environ, "QUARANTINED": "1",
                    "XATTR_LOG": str(self.root / "xattr-cleared"),
                    "XATTR_STATE": str(self.root / "xattr-state")}
        stubs = {
            "/usr/bin/xattr": ('name=${3##*/}\n'
                               'case "$1" in\n'
                               '  -p) [ "$QUARANTINED" = 1 ] && [ ! -f "$XATTR_STATE/$name" ] ;;\n'
                               '  -d)\n'
                               '    [ "${XATTR_FAIL:-}" != "$name" ] || exit 1\n'
                               '    /usr/bin/touch "$XATTR_STATE/$name"\n'
                               '    printf \'%s\\n\' "$3" >> "$XATTR_LOG"\n'
                               '    ;;\n'
                               'esac'),
        }
        source = (Path(__file__).resolve().parents[1] / "scripts/lookup.sh").read_text()
        for index, (command, body) in enumerate(stubs.items()):
            path = self.root / f"stub-{index}"
            path.write_text("#!/bin/sh\n" + body + "\n")
            path.chmod(0o755)
            source = source.replace(command, f'"{path}"')
        (self.root / "scripts/lookup.sh").write_text(source)
        runtime = self.root / "runtime/tjs"
        runtime.write_text('#!/bin/sh\nprintf \'%s\\n\' "$3"\n')
        runtime.chmod(0o755)
        (self.root / "runtime/word-suggestions").touch()
        (self.root / "runtime/apple-translate").touch()

    def run_lookup(self, query="hello world"):
        return subprocess.run(["/bin/sh", str(self.root / "scripts/lookup.sh"), query],
                              env=self.env, capture_output=True, text=True)

    def test_quarantine_returns_explicit_trust_action(self):
        result = self.run_lookup()
        self.assertEqual(result.returncode, 0)
        item = json.loads(result.stdout)["items"][0]
        self.assertEqual(item["title"], "Finish setting up WordPing")
        self.assertEqual(item["subtitle"], "Press Return to continue")
        self.assertEqual(item["arg"], "~trust-wordping")
        self.assertTrue(item["valid"])
        self.assertFalse((self.root / "xattr-cleared").exists())

    def test_trust_action_clears_only_bundled_executables(self):
        result = self.run_lookup("~trust-wordping")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "WordPing is ready. Try your lookup again.\n")
        self.assertEqual((self.root / "xattr-cleared").read_text().splitlines(), [
            str(self.root / "runtime/tjs"),
            str(self.root / "runtime/word-suggestions"),
            str(self.root / "runtime/apple-translate"),
        ])
        self.assertEqual(self.run_lookup().stdout, "hello world\n")

    def test_trust_action_reports_removal_failure(self):
        self.env["XATTR_FAIL"] = "apple-translate"
        result = self.run_lookup("~trust-wordping")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout,
                         "WordPing couldn't finish setup. Reinstall the workflow and try again.\n")

    def test_unquarantined_executables_run_lookup_directly(self):
        self.env["QUARANTINED"] = "0"
        self.assertEqual(self.run_lookup().stdout, "hello world\n")
        self.assertFalse((self.root / "xattr-cleared").exists())


if __name__ == "__main__":
    unittest.main()

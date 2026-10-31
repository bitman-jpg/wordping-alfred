"""Verify source routing, accents, cache reuse, and failed-download recovery."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


class AudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='wordping-audio-')
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.log = self.directory / 'log'
        self.env = {**os.environ, 'PATH': f'{self.directory}:/usr/bin:/bin',
                    'alfred_workflow_cache': str(self.directory / 'cache'),
                    'AUDIO_LOG': str(self.log), 'wordping_source': 'Iciba',
                    'wordping_audio_uk': 'https://res.iciba.com/uk.mp3',
                    'wordping_audio_us': 'https://res.iciba.com/us.mp3',
                    'onlineAccent': 'both'}
        for name, source in {
            'curl': '''#!/bin/sh
printf 'curl %s\\n' "$*" >> "$AUDIO_LOG"
[ "${FAIL_AUDIO:-0}" = 0 ] || exit 22
while [ "$#" -gt 0 ]; do
  if [ "$1" = --output ]; then printf audio > "$2"; break; fi
  shift
done
''',
            'afplay': '#!/bin/sh\nprintf "play %s\\n" "$*" >> "$AUDIO_LOG"\n',
        }.items():
            script = self.directory / name
            script.write_text(source)
            script.chmod(0o755)

    def play(self):
        return subprocess.run(['/bin/sh', str(ROOT / 'scripts/play-online.sh'), '../ice cream?'],
                              env=self.env, capture_output=True, text=True)

    def test_iciba_both_accents_and_cache(self):
        self.assertEqual(self.play().returncode, 0)
        lines = self.log.read_text().splitlines()
        self.assertIn('https://res.iciba.com/uk.mp3', lines[0])
        self.assertIn('https://res.iciba.com/us.mp3', lines[2])
        self.assertNotIn('youdao', self.log.read_text())
        self.assertEqual(self.play().returncode, 0)
        self.assertEqual(self.log.read_text().count('curl '), 2)

    def test_other_sources_use_youdao_and_encode_query(self):
        self.env.update(wordping_source='Youdao', onlineAccent='american')
        self.assertEqual(self.play().returncode, 0)
        self.assertIn('--data-urlencode audio=../ice cream?', self.log.read_text())
        self.assertIn('type=2', self.log.read_text())
        self.assertIn('https://dict.youdao.com/dictvoice', self.log.read_text())

    def test_missing_recording_does_not_silently_play_youdao(self):
        self.env['wordping_audio_uk'] = ''
        self.assertNotEqual(self.play().returncode, 0)
        self.assertFalse(self.log.exists())

    def test_download_failure_does_not_poison_cache(self):
        self.env['FAIL_AUDIO'] = '1'
        self.assertNotEqual(self.play().returncode, 0)
        self.assertEqual(list((self.directory / 'cache/audio').iterdir()), [])
        self.assertNotIn('play ', self.log.read_text())
        self.env['FAIL_AUDIO'] = '0'
        self.assertEqual(self.play().returncode, 0)


if __name__ == '__main__':
    unittest.main()

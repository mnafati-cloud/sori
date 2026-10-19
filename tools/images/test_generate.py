"""No real API calls or credits. Verify paid batch boundaries and failure handling."""
import base64
from contextlib import redirect_stdout, redirect_stderr
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import generate


class GenerationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'inventory.json').write_text(json.dumps({'items': [
            {'id': 'a', 'status': 'queued', 'subject': 'apple'},
            {'id': 'b', 'status': 'queued', 'subject': 'umbrella'},
            {'id': 'c', 'status': 'approved', 'subject': 'cat'}]}))
        (self.root / 'style.md').write_text('Fixed style')
        (self.root / 'style-reference.png').write_bytes(b'reference bytes')
        self.addCleanup(self.temp.cleanup)

    def invoke(self, args, responses=None, key='test-secret-never-log'):
        output = io.StringIO()
        with patch.object(generate, 'HERE', self.root), patch('sys.argv', ['generate.py', *args]), \
                patch.dict('os.environ', {'OPENAI_API_KEY': key}), \
                patch.object(generate.urllib.request, 'urlopen', side_effect=responses) as network, \
                patch.object(generate.subprocess, 'run') as importer, redirect_stdout(output), redirect_stderr(output):
            code = None
            try:
                generate.main()
            except SystemExit as exc:
                code = exc.code
        self.assertNotIn('test-secret-never-log', output.getvalue())
        return code, network, importer

    def test_dry_run_and_invalid_batch_never_call_api(self):
        for args in [['--ids','a'], ['--ids','a,b','--limit','1','--execute'],
                     ['--ids','a,a','--execute'], ['--ids','missing','--execute'], ['--ids','c','--execute']]:
            _, network, importer = self.invoke(args)
            network.assert_not_called()
            importer.assert_not_called()

    def test_missing_secret_fails_before_network(self):
        code, network, _ = self.invoke(['--ids','a','--execute'], key='')
        self.assertNotEqual(code, None)
        network.assert_not_called()

    def test_scene_profile_receipt_and_reference(self):
        inventory=json.loads((self.root / 'inventory.json').read_text())
        inventory['items'][0].update(styleProfile='pinceau-scenes-v1',usage='support')
        (self.root / 'inventory.json').write_text(json.dumps(inventory))
        (self.root / 'style-scenes.md').write_text('Scene style')
        (self.root / 'style-scenes-reference.png').write_bytes(b'scene reference')
        answer=io.BytesIO(json.dumps({'data':[{'b64_json':base64.b64encode(b'generated-png').decode()}]}).encode())
        code,network,importer=self.invoke(['--ids','a','--execute'],[answer])
        self.assertIsNone(code)
        data=json.loads(next((self.root / 'candidates').rglob('a.json')).read_text())
        self.assertEqual(data['parameters']['prompt'],'Scene style\n\nSubject:\napple')
        self.assertIn(b'scene reference',network.call_args.args[0].data)
        self.assertEqual(importer.call_count,1)

    def test_invalid_profile_and_scene_question_fail_before_network(self):
        for profile,usage in [('unknown','support'),('pinceau-scenes-v1','question')]:
            inventory=json.loads((self.root / 'inventory.json').read_text())
            inventory['items'][0].update(styleProfile=profile,usage=usage)
            (self.root / 'inventory.json').write_text(json.dumps(inventory))
            code,network,importer=self.invoke(['--ids','a','--execute'])
            self.assertIsNotNone(code);network.assert_not_called();importer.assert_not_called()

    def test_candidate_receipt_then_stop_on_http_failure_without_retry(self):
        answer = io.BytesIO(json.dumps({'data':[{'b64_json':base64.b64encode(b'generated-png').decode()}], 'usage':{'total_tokens':1}}).encode())
        code, network, importer = self.invoke(['--ids','a,b','--execute'], [answer, urllib.error.HTTPError(generate.API, 429, 'rate limit', {}, None)])
        self.assertIn('HTTP 429', code)
        self.assertEqual(network.call_count, 2)
        self.assertEqual(importer.call_count, 1)
        receipt = next((self.root / 'candidates').rglob('a.json'))
        data = json.loads(receipt.read_text())
        self.assertEqual(data['parameters']['prompt'], 'Fixed style\n\nSubject:\napple')
        self.assertEqual(data['parameters']['quality'], 'medium')
        self.assertEqual(data['usage']['total_tokens'], 1)
        self.assertIn(str(receipt), importer.call_args.args[0])
        request = network.call_args_list[0].args[0]
        self.assertEqual(request.full_url, generate.API)
        self.assertIn(b'reference bytes', request.data)


if __name__ == '__main__':
    unittest.main()

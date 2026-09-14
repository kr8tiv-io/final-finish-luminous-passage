"""Exercise only the output transaction, without building or touching real assets."""
import ast
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from contextlib import contextmanager

SOURCE = Path(__file__).resolve().parents[1] / 'build_follow_floor_threshold.py'
NAMES = ('scene.glb', 'poster.jpg', 'manifest.json')


@contextmanager
def replaced(module, name, value):
    previous = getattr(module, name)
    setattr(module, name, value)
    try:
        yield
    finally:
        setattr(module, name, previous)


class ThresholdPromotionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='threshold-transaction-test-')
        self.addCleanup(self.temporary.cleanup)
        self.output = Path(self.temporary.name) / 'output'
        self.output.mkdir()
        self.stage = self.output / 'stage'
        self.stage.mkdir()
        for name in NAMES:
            (self.output / name).write_bytes(('old-' + name).encode())
            (self.stage / name).write_bytes(('new-' + name).encode())
        tree = ast.parse(SOURCE.read_text(encoding='utf-8'))
        function = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'promote')
        namespace = {
            'OUTPUT_DIR': self.output, 'OUTPUT_NAMES': NAMES, 'Path': Path,
            'os': os, 'shutil': shutil, 'tempfile': tempfile,
            'validate_existing_ownership': lambda: None,
        }
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(SOURCE), 'exec'), namespace)
        self.promote = namespace['promote']

    def assert_old_outputs_intact(self):
        for name in NAMES:
            self.assertEqual((self.output / name).read_bytes(), ('old-' + name).encode())

    def test_copy_failure_preserves_all_previous_outputs(self):
        def fail_copy(*_args):
            raise OSError('disk full')

        with replaced(shutil, 'copyfileobj', fail_copy):
            with self.assertRaises(OSError):
                self.promote(self.stage)
        self.assert_old_outputs_intact()

    def test_partial_backup_failure_preserves_unmoved_outputs(self):
        replace = os.replace
        failed = False

        def fail_second_backup(source, destination):
            nonlocal failed
            if not failed and Path(source) == self.output / 'poster.jpg':
                failed = True
                raise OSError('locked old poster')
            return replace(source, destination)

        with replaced(os, 'replace', fail_second_backup):
            with self.assertRaises(OSError):
                self.promote(self.stage)
        self.assert_old_outputs_intact()

    def test_partial_promotion_restores_previous_complete_package(self):
        replace = os.replace
        failed = False

        def fail_second_promotion(source, destination):
            nonlocal failed
            if not failed and Path(source).name == '.poster.jpg.next':
                failed = True
                raise OSError('locked destination')
            return replace(source, destination)

        with replaced(os, 'replace', fail_second_promotion):
            with self.assertRaises(OSError):
                self.promote(self.stage)
        self.assert_old_outputs_intact()

    def test_success_promotes_all_three_files(self):
        self.promote(self.stage)
        for name in NAMES:
            self.assertEqual((self.output / name).read_bytes(), ('new-' + name).encode())

    def test_failed_rollback_keeps_recoverable_backups(self):
        replace = os.replace

        def fail_promotion_and_one_restore(source, destination):
            path = Path(source)
            if path.name == '.poster.jpg.next' or (
                path.name == 'scene.glb' and path.parent.name.startswith('.follow-floor-threshold-rollback-')
            ):
                raise OSError('destination remains locked')
            return replace(source, destination)

        with replaced(os, 'replace', fail_promotion_and_one_restore):
            with self.assertRaises(Exception):
                self.promote(self.stage)
        backups = list(self.output.glob('.follow-floor-threshold-rollback-*/scene.glb'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), b'old-scene.glb')
        self.assertEqual((self.output / 'poster.jpg').read_bytes(), b'old-poster.jpg')
        self.assertEqual((self.output / 'manifest.json').read_bytes(), b'old-manifest.json')


if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ThresholdPromotionTests)
    if not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful():
        raise RuntimeError('Threshold promotion regression failed')

"""Contract tests for the locally authored pearl stair film."""
from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
BUILDER_PATH = ROOT / "tools" / "blender" / "build_pearl_stair_ascent.py"


def load_builder():
    spec = importlib.util.spec_from_file_location("build_pearl_stair_ascent", BUILDER_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


@contextmanager
def replaced(module, name, value):
    previous = getattr(module, name)
    setattr(module, name, value)
    try:
        yield
    finally:
        setattr(module, name, previous)


class PearlStairAscentContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.builder = load_builder()

    def test_delivery_clock_is_bounded_and_seek_friendly(self):
        self.assertEqual(self.builder.STATUS, "study-unready")
        self.assertEqual(self.builder.FPS, 24)
        self.assertGreaterEqual(self.builder.DURATION_SECONDS, 8.0)
        self.assertLessEqual(self.builder.DURATION_SECONDS, 10.0)
        self.assertEqual(self.builder.GOP_SIZE, 6)

    def test_camera_performs_a_real_human_scale_ascent(self):
        route = self.builder.CAMERA_KEYFRAMES
        self.assertEqual(route[0]["time"], 0.0)
        self.assertEqual(route[-1]["time"], self.builder.DURATION_SECONDS)
        self.assertGreater(route[-1]["position"][1] - route[0]["position"][1], 15.0)
        self.assertGreater(route[-1]["position"][2] - route[0]["position"][2], 2.0)
        self.assertAlmostEqual(
            self.builder.STAIR_COUNT * self.builder.RISER_HEIGHT,
            route[-1]["position"][2] - route[0]["position"][2],
            delta=0.12,
        )
        self.assertTrue(all(frame["position"][0] == 0.0 for frame in route))
        self.assertTrue(all(route[index + 1]["position"][2] >= route[index]["position"][2] for index in range(len(route) - 1)))
        self.assertEqual(self.builder.CAMERA_LENS_MM, 27.0)

    def test_scene_palette_stays_bright_and_pearl_grey(self):
        self.assertGreaterEqual(self.builder.STAIR_COUNT, 14)
        self.assertGreaterEqual(self.builder.STAIR_WIDTH, 7.5)
        for value in self.builder.PALETTE.values():
            channels = [int(value[index:index + 2], 16) for index in (1, 3, 5)]
            self.assertGreater(min(channels), 125)

    def test_variant_staging_paths_cannot_alias(self):
        stage = Path("study-stage")
        staged = self.builder.stage_paths(stage)
        self.assertEqual(len(staged), len(set(staged.values())))
        self.assertNotEqual(staged["film480"], staged["film720"])
        self.assertEqual(staged["film480"].name, "epoxy-foundation-ascent.mp4")
        self.assertEqual(staged["film720"].name, "epoxy-foundation-ascent.mp4")


class PearlStairPromotionSafety(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.builder = load_builder()

    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="pearl-stair-promotion-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / "assets").mkdir()
        self.output = self.root / "output"
        self.stage = self.root / "stage"
        self.output.mkdir()
        self.stage.mkdir()
        self.targets = {
            key: self.output / f"{key}-{target.name}"
            for key, target in self.builder.OUTPUT_TARGETS.items()
        }
        self.staged = self.builder.stage_paths(self.stage)
        for key, path in self.targets.items():
            path.write_bytes(f"old-{key}".encode())
        for key, path in self.staged.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(f"new-{key}".encode())

    def test_failed_restore_preserves_recoverable_backup_directory(self):
        replace = os.replace

        def fail_promotion_and_one_restore(source, destination):
            source_path = Path(source)
            if source_path == self.staged["poster"]:
                raise OSError("locked promotion target")
            if source_path.name == "blend" and source_path.parent.name.startswith(".pearl-stair-rollback-"):
                raise OSError("locked restore target")
            return replace(source, destination)

        with (
            replaced(self.builder, "ROOT", self.root),
            replaced(self.builder, "OUTPUT_TARGETS", self.targets),
            replaced(self.builder, "validate_existing_ownership", lambda: None),
            replaced(os, "replace", fail_promotion_and_one_restore),
        ):
            with self.assertRaisesRegex(RuntimeError, "retained recovery files"):
                self.builder.promote(self.stage, self.staged)

        recovery = list((self.root / "assets").glob(".pearl-stair-rollback-*"))
        self.assertEqual(len(recovery), 1)
        self.assertEqual((recovery[0] / "blend").read_bytes(), b"old-blend")
        for key, target in self.targets.items():
            if key != "blend":
                self.assertEqual(target.read_bytes(), f"old-{key}".encode())


if __name__ == "__main__":
    unittest.main(argv=[__file__])

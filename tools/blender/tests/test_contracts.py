"""Contract tests for the deterministic Luminous Passage asset pipeline.

Run with Blender so these tests exercise the same Python runtime as production:
    blender --background --factory-startup --python tools/blender/tests/test_contracts.py
"""

from __future__ import annotations

import importlib
import json
import sys
import unittest
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
TOOLS = ROOT / "tools" / "blender"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))


try:
    contract = importlib.import_module("scene_contract")
except ImportError as exc:  # A missing contract is the intentional first RED state.
    contract = None
    IMPORT_ERROR = exc
else:
    IMPORT_ERROR = None


class LuminousPassageContractTests(unittest.TestCase):
    def setUp(self) -> None:
        if contract is None:
            self.fail(f"scene_contract feature is missing: {IMPORT_ERROR}")

    def test_five_continuous_spaces_are_ordered(self) -> None:
        expected = [
            "Daylit Portico",
            "Foundation Chamber",
            "Luminous Finish Hall",
            "Proof Arcade",
            "Consultation Court",
        ]
        self.assertEqual([zone["name"] for zone in contract.SCENE_ZONES], expected)
        starts = [zone["start_m"] for zone in contract.SCENE_ZONES]
        ends = [zone["end_m"] for zone in contract.SCENE_ZONES]
        self.assertEqual(starts[1:], ends[:-1], "Spaces must meet without gaps")
        self.assertTrue(all(a < b for a, b in zip(starts, ends)))

    def test_material_catalog_has_required_unique_families(self) -> None:
        materials = contract.MATERIAL_LIBRARY
        self.assertEqual(len(materials), 30)
        self.assertEqual(len({item["slug"] for item in materials}), 30)
        self.assertEqual(
            Counter(item["family"] for item in materials),
            Counter({"flake": 14, "solid": 8, "metallic": 8}),
        )
        for item in materials:
            self.assertRegex(item["hex"], r"^#[0-9A-F]{6}$")
            self.assertGreaterEqual(item["roughness"], 0.12)
            self.assertLessEqual(item["roughness"], 0.72)

    def test_export_plan_is_split_and_budgeted(self) -> None:
        chunks = contract.EXPORT_CHUNKS
        self.assertGreaterEqual(len(chunks), 4)
        self.assertEqual(chunks[0]["slug"], "luminous-passage-entry")
        self.assertLessEqual(chunks[0]["budget_bytes"], 1_500_000)
        self.assertLessEqual(sum(c["budget_bytes"] for c in chunks), 6_000_000)
        self.assertTrue(all(c["collections"] for c in chunks))

    def test_camera_route_is_human_scale_and_forward_moving(self) -> None:
        route = contract.CAMERA_ROUTE
        self.assertGreaterEqual(len(route), 7)
        self.assertTrue(all(1.55 <= p[2] <= 1.75 for p in route))
        self.assertTrue(all(a[1] < b[1] for a, b in zip(route, route[1:])))

    def test_camera_handoff_is_dense_and_threejs_complete(self) -> None:
        handoff = contract.CAMERA_HANDOFF
        self.assertEqual(handoff["cameraGlb"], "luminous-passage-camera.glb")
        self.assertGreaterEqual(len(handoff["keyframes"]), 10)
        self.assertEqual(handoff["fovAxis"], "vertical")
        self.assertGreater(handoff["verticalFovDegrees"], 25)
        self.assertLess(handoff["verticalFovDegrees"], 60)
        self.assertGreater(handoff["horizontalFovDegrees"], handoff["verticalFovDegrees"])
        frames = handoff["keyframes"]
        self.assertEqual(frames[0]["time"], 0.0)
        self.assertEqual(frames[-1]["time"], handoff["durationSeconds"])
        self.assertTrue(all(a["time"] < b["time"] for a, b in zip(frames, frames[1:])))
        self.assertTrue(all(len(frame["position"]) == 3 and len(frame["target"]) == 3 for frame in frames))
        self.assertEqual({frame["chapter"] for frame in frames}, {zone["slug"] for zone in contract.SCENE_ZONES})

    def test_web_texture_contract_covers_all_flakes_and_limestone(self) -> None:
        textured = contract.TEXTURED_SURFACES
        flakes = [item["slug"] for item in contract.MATERIAL_LIBRARY if item["family"] == "flake"]
        self.assertEqual(textured[:-1], flakes)
        self.assertEqual(textured[-1], "limestone-floor")
        self.assertEqual(len(textured), 15)
        self.assertEqual(contract.TEXTURE_CONTRACT["roles"], ["baseColor", "roughness", "normal"])
        self.assertEqual(contract.TEXTURE_CONTRACT["limestoneBoundOutputs"], [
            "luminous-passage-entry.glb", "luminous-passage-gallery.glb",
            "luminous-passage-court.glb", "luminous-passage-finish-alcove.glb",
        ])

    def test_contract_serializes_to_stable_json(self) -> None:
        manifest = contract.manifest_payload()
        encoded = json.dumps(manifest, sort_keys=True, separators=(",", ":"))
        self.assertIn('"materialCount":30', encoded)
        self.assertEqual(manifest["schemaVersion"], 1)
        self.assertEqual(manifest["units"], "meters")
        self.assertEqual(manifest["provenance"]["blenderVersionPin"], "5.2.x")
        self.assertEqual(manifest["provenance"]["license"], "CC-BY-4.0")


if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(LuminousPassageContractTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    raise SystemExit(0 if result.wasSuccessful() else 1)

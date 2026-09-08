"""Regression fixtures for malformed GLB and manifest texture declarations."""
from __future__ import annotations

import json
import shutil
import struct
import tempfile
import unittest
from pathlib import Path
import sys

TOOLS = Path(__file__).resolve().parents[1]
if str(TOOLS) not in sys.path: sys.path.insert(0, str(TOOLS))
from validate_exports import ValidationError, validate_asset_root, validate_glb_integrity, validate_texture_binding_declarations


PNG = b"\x89PNG\r\n\x1a\n"


def glb_fixture(structure: dict, binary: bytes = PNG) -> bytes:
    encoded = json.dumps(structure, separators=(",", ":")).encode("utf-8")
    encoded += b" " * (-len(encoded) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(encoded) + 8 + len(binary)
    return struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(encoded), b"JSON") + encoded + struct.pack("<I4s", len(binary), b"BIN\0") + binary


def image_structure(**overrides) -> dict:
    result = {
        "buffers": [{"byteLength": 8}],
        "bufferViews": [{"buffer": 0, "byteLength": 8}],
        "images": [{"bufferView": 0, "mimeType": "image/png"}],
        "textures": [{"source": 0}],
    }
    result.update(overrides)
    return result


class ValidatorRegressionTests(unittest.TestCase):
    def check_rejected(self, structure, binary=PNG):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "fixture.glb"
            target.write_bytes(glb_fixture(structure, binary))
            with self.assertRaises(ValidationError): validate_glb_integrity(target, structure)

    def test_rejects_external_buffer_uri(self):
        self.check_rejected(image_structure(buffers=[{"byteLength": 8, "uri": "remote.bin"}]))

    def test_rejects_external_image_uri(self):
        self.check_rejected(image_structure(images=[{"uri": "remote.png", "mimeType": "image/png"}]))

    def test_rejects_bad_image_buffer_view(self):
        self.check_rejected(image_structure(images=[{"bufferView": 3, "mimeType": "image/png"}]))

    def test_rejects_bad_png_signature(self):
        self.check_rejected(image_structure(), b"not-a-png")

    def test_rejects_accessor_beyond_view(self):
        self.check_rejected(image_structure(accessors=[{"bufferView": 0, "componentType": 5126, "count": 1, "type": "VEC3"}]))

    def test_rejects_texture_role_drift(self):
        maps = {"baseColor": "a.png", "roughness": "b.png", "normal": "c.png"}
        bindings = [{"output": f"library-{index}.glb", "material": f"Palette · sample-{index}", "surface": "sample", "maps": {**maps, "normal": "wrong.png"}} for index in range(18)]
        with self.assertRaises(ValidationError): validate_texture_binding_declarations(bindings, {"sample": maps})

    def test_rejects_stale_glb_output(self):
        source = Path(__file__).resolve().parents[3] / "public" / "3d"
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "3d"
            shutil.copytree(source, target)
            (target / "luminous-passage-stale.glb").write_bytes(b"stale")
            with self.assertRaises(ValidationError): validate_asset_root(target)


if __name__ == "__main__":
    unittest.main(verbosity=2)

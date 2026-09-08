"""Stable production contract for the Luminous Passage Blender pipeline.

The contract is deliberately Blender-free so it can be inspected by CI and used by
the export script without coupling the web scene to a particular Blender release.
"""

from __future__ import annotations

import json
from pathlib import Path

BLENDER_VERSION_PIN = "5.2.x"
TEXTURE_CONTRACT = json.loads((Path(__file__).with_name("texture-contract.json")).read_text(encoding="utf-8"))
ASSET_PROVENANCE = {
    "author": "kr8tiv-io",
    "license": "CC-BY-4.0",
    "source": "tools/blender/build_luminous_passage.py",
    "blenderVersionPin": BLENDER_VERSION_PIN,
    "telemetry": "disabled; offline procedural source generation only",
}

SCENE_ZONES = [
    {"name": "Daylit Portico", "slug": "daylit-portico", "start_m": 0.0, "end_m": 8.0},
    {"name": "Foundation Chamber", "slug": "foundation-chamber", "start_m": 8.0, "end_m": 16.0},
    {"name": "Luminous Finish Hall", "slug": "luminous-finish-hall", "start_m": 16.0, "end_m": 25.0},
    {"name": "Proof Arcade", "slug": "proof-arcade", "start_m": 25.0, "end_m": 33.0},
    {"name": "Consultation Court", "slug": "consultation-court", "start_m": 33.0, "end_m": 42.0},
]

# Coordinates are (x, y, z), in real-world metres.  The camera is purposefully
# restrained at eye height, travelling down the five continuous rooms.
CAMERA_ROUTE = [
    (0.0, 1.2, 1.65), (0.0, 5.5, 1.65), (0.0, 10.5, 1.65),
    (0.0, 16.5, 1.65), (0.0, 22.5, 1.65), (0.0, 29.0, 1.65),
    (0.0, 35.5, 1.65), (0.0, 40.8, 1.65),
]

# Web hand-off fallback. The dedicated GLB also contains these transforms as a
# camera animation at 30 fps; this plain JSON representation is deliberately
# renderer-agnostic for Three.js, R3F, or a poster-mode implementation.
CAMERA_HANDOFF = {
    "cameraGlb": "luminous-passage-camera.glb",
    "durationSeconds": 46.0,
    "fps": 30,
    # GLB cameras expose perspective.yfov and Three.js PerspectiveCamera expects
    # a vertical FOV. Horizontal FOV is retained only as authoring provenance.
    "verticalFovDegrees": 38.732,
    "horizontalFovDegrees": 64.0,
    "fovAxis": "vertical",
    "loop": False,
    "easing": "cubicInOut",
    "keyframes": [
        {"time": 0.0, "position": [0.0, 1.2, 1.65], "target": [0.0, 6.0, 1.68], "chapter": "daylit-portico", "easing": "cubicOut"},
        {"time": 4.2, "position": [-0.08, 4.0, 1.65], "target": [0.0, 8.6, 1.69], "chapter": "daylit-portico", "easing": "linear"},
        {"time": 8.0, "position": [0.06, 8.0, 1.65], "target": [0.0, 12.8, 1.68], "chapter": "foundation-chamber", "easing": "cubicInOut"},
        {"time": 12.5, "position": [-0.04, 12.0, 1.65], "target": [0.0, 16.7, 1.70], "chapter": "foundation-chamber", "easing": "linear"},
        {"time": 17.0, "position": [0.08, 16.0, 1.65], "target": [0.0, 20.8, 1.70], "chapter": "luminous-finish-hall", "easing": "cubicInOut"},
        {"time": 21.0, "position": [0.0, 20.5, 1.65], "target": [0.0, 25.3, 1.70], "chapter": "luminous-finish-hall", "easing": "linear"},
        {"time": 25.5, "position": [-0.07, 25.0, 1.65], "target": [0.0, 29.8, 1.69], "chapter": "proof-arcade", "easing": "cubicInOut"},
        {"time": 30.0, "position": [0.05, 29.0, 1.65], "target": [0.0, 33.8, 1.68], "chapter": "proof-arcade", "easing": "linear"},
        {"time": 34.0, "position": [0.0, 33.0, 1.65], "target": [0.0, 37.8, 1.68], "chapter": "consultation-court", "easing": "cubicInOut"},
        {"time": 39.0, "position": [-0.05, 37.0, 1.65], "target": [0.0, 40.3, 1.50], "chapter": "consultation-court", "easing": "cubicOut"},
        {"time": 46.0, "position": [0.0, 40.8, 1.65], "target": [0.0, 42.0, 1.48], "chapter": "consultation-court", "easing": "cubicIn"},
    ],
}

_MATERIAL_ROWS = [
    ("alabaster-snow", "flake", "#E5E0D8", .42), ("dove-terrazzo", "flake", "#C8CBC9", .44),
    ("linen-aggregate", "flake", "#D6C8B8", .46), ("smoked-oat", "flake", "#B5AA9A", .48),
    ("river-pebble", "flake", "#8B8D88", .44), ("graphite-chip", "flake", "#515552", .38),
    ("night-slate", "flake", "#2B302F", .35), ("harbor-blue-chip", "flake", "#536D79", .42),
    ("sage-fleck", "flake", "#879187", .46), ("clay-confetti", "flake", "#A8735A", .47),
    ("ember-speck", "flake", "#743E35", .43), ("eclipse-flake", "flake", "#242526", .32),
    ("chambray-stone", "flake", "#82929B", .45), ("warm-cinder", "flake", "#766C63", .43),
    ("porcelain", "solid", "#EEE9E1", .50), ("limestone", "solid", "#D0C4B2", .52),
    ("sandstone", "solid", "#B89F7C", .55), ("eucalyptus", "solid", "#7E9086", .50),
    ("deep-teal", "solid", "#274A4B", .37), ("ink", "solid", "#26292A", .30),
    ("oxblood", "solid", "#622E2A", .39), ("signal-red", "solid", "#B44435", .40),
    ("brushed-nickel", "metallic", "#9BA09D", .25), ("soft-champagne", "metallic", "#C5B394", .27),
    ("aged-bronze", "metallic", "#756D5D", .31), ("black-steel", "metallic", "#272B2A", .20),
    ("copper-patina", "metallic", "#6C7F78", .30), ("titanium-blue", "metallic", "#617780", .24),
    ("pewter", "metallic", "#787D7D", .28), ("burnished-umber", "metallic", "#76594B", .29),
]

MATERIAL_LIBRARY = [
    {"slug": slug, "family": family, "hex": hex_value, "roughness": roughness,
     "metallic": 1.0 if family == "metallic" else 0.0}
    for slug, family, hex_value, roughness in _MATERIAL_ROWS
]

# Every flake finish and the continuous limestone floor must carry baked PBR maps
# in web exports; Blender-only procedural nodes are insufficient delivery assets.
TEXTURED_SURFACES = TEXTURE_CONTRACT["surfaces"]

# Each GLB is independently streamable.  This intentionally leaves headroom below
# 6 MB for compression variance across versions of the exporter.
EXPORT_CHUNKS = [
    {"slug": "luminous-passage-entry", "collections": ["LP_ENTRY"], "budget_bytes": 1_450_000},
    {"slug": "luminous-passage-gallery", "collections": ["LP_GALLERY"], "budget_bytes": 1_500_000},
    {"slug": "luminous-passage-court", "collections": ["LP_COURT"], "budget_bytes": 800_000},
    {"slug": "luminous-passage-finish-alcove", "collections": ["LP_ALCOVE"], "budget_bytes": 750_000},
    {"slug": "luminous-passage-material-library", "collections": ["LP_SWATCHES"], "budget_bytes": 1_200_000},
    {"slug": "luminous-passage-camera", "collections": ["LP_CAMERA"], "budget_bytes": 200_000},
]


def manifest_payload() -> dict:
    return {
        "schemaVersion": 1,
        "title": "Luminous Passage",
        "provenance": ASSET_PROVENANCE,
        "units": "meters",
        "zones": SCENE_ZONES,
        "cameraRoute": CAMERA_ROUTE,
        "cameraHandoff": CAMERA_HANDOFF,
        "materials": MATERIAL_LIBRARY,
        "materialCount": len(MATERIAL_LIBRARY),
        "exportChunks": EXPORT_CHUNKS,
        "textureDelivery": {
            "mode": "embedded-glb-and-png-source",
            "directory": "textures/luminous-passage/",
            "ktx2Ready": True,
            "note": "PNG source maps are embedded in GLBs; transcode to KTX2 at CDN build time when BasisU is available.",
        },
        "determinism": "Stable JSON/geometry/material structure. Binary byte hashes may differ between Blender exporter builds.",
        "budgets": {"firstChunkBytes": 1_500_000, "totalBytes": 6_000_000},
    }

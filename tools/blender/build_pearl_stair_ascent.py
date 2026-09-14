"""Author the unapproved pearl-grey foundation stair ascent study.

Preview the coherent first frame:
  blender --background --factory-startup --python tools/blender/build_pearl_stair_ascent.py -- --preview

Explicitly build study outputs for further offline review (not for the client route):
  blender --background --factory-startup --python tools/blender/build_pearl_stair_ascent.py -- --full

The set is entirely procedural: no downloads, add-ons, external textures, or paid
services. Delivery promotion is bounded to the paths declared in OUTPUT_TARGETS.

Status: the 2026-09-08 quality gate rejected this study as too CG-clean relative
to the approved pearl still. Do not wire its outputs into index.astro.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = "tools/blender/build_pearl_stair_ascent.py"
STATUS = "study-unready"
FPS = 24
DURATION_SECONDS = 6.5
GOP_SIZE = 6
STAIR_COUNT = 15
STAIR_WIDTH = 8.4
RISER_HEIGHT = 0.165
TREAD_DEPTH = 0.46
LANDING_HEIGHT = STAIR_COUNT * RISER_HEIGHT
PALETTE = {
    "pearl_low": "#B9C0C1",
    "pearl_high": "#E5E8E6",
    "limestone_low": "#ACA79E",
    "limestone_high": "#D8D0C4",
    "warm_reveal": "#D2B98F",
    "sky": "#BCD7E4",
}
CAMERA_KEYFRAMES = (
    {"time": 0.0, "position": (0.00, -5.60, 1.620), "target": (0.00, 2.3, 0.82)},
    {"time": 0.8, "position": (0.02, -4.00, 1.620), "target": (0.04, 3.0, 1.22)},
    {"time": 1.6, "position": (-0.035, -2.10, 1.635), "target": (-0.02, 3.9, 1.76)},
    {"time": 2.4, "position": (0.045, -0.20, 1.785), "target": (0.03, 5.1, 2.35)},
    {"time": 3.2, "position": (-0.055, 1.70, 2.445), "target": (-0.02, 6.7, 3.05)},
    {"time": 4.0, "position": (0.045, 3.50, 3.105), "target": (0.02, 8.5, 3.76)},
    {"time": 4.8, "position": (-0.025, 5.40, 3.765), "target": (0.00, 10.5, 4.16)},
    {"time": 5.6, "position": (0.015, 7.20, 4.095), "target": (0.02, 12.3, 4.22)},
    {"time": 6.5, "position": (0.00, 8.10, 4.095), "target": (0.00, 13.8, 4.24)},
)
OUTPUT_TARGETS = {
    "blend": ROOT / "assets" / "3d" / "pearl-stair-ascent.blend",
    "master": ROOT / "assets" / "brand" / "source" / "pearl-stair-ascent-master.mp4",
    "manifest": ROOT / "assets" / "brand" / "source" / "pearl-stair-ascent.manifest.json",
    "poster": ROOT / "public" / "images" / "brand" / "pearl-stair-ascent-poster.jpg",
    "film480": ROOT / "public" / "videos" / "follow-floor" / "480" / "epoxy-foundation-ascent.mp4",
    "film720": ROOT / "public" / "videos" / "follow-floor" / "720" / "epoxy-foundation-ascent.mp4",
}


def linear_hex(value: str):
    def channel(pair):
        number = int(pair, 16) / 255.0
        return number / 12.92 if number <= 0.04045 else ((number + 0.055) / 1.055) ** 2.4
    value = value.lstrip("#")
    return tuple(channel(value[index:index + 2]) for index in (0, 2, 4)) + (1.0,)


def procedural_material(name, low, high, roughness, scale, bump_strength, coat=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = 0.04 if coat else 0.0
    if "Coat Weight" in principled.inputs:
        principled.inputs["Coat Weight"].default_value = coat
        principled.inputs["Coat Roughness"].default_value = min(0.3, roughness * 0.65)

    texture = nodes.new("ShaderNodeTexNoise")
    texture.name = f"{name} · mineral field"
    texture.inputs["Scale"].default_value = scale
    texture.inputs["Detail"].default_value = 4.0
    texture.inputs["Roughness"].default_value = 0.58
    texture.inputs["Distortion"].default_value = 0.08
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.28
    ramp.color_ramp.elements[0].color = linear_hex(low)
    ramp.color_ramp.elements[1].position = 0.76
    ramp.color_ramp.elements[1].color = linear_hex(high)
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = bump_strength
    bump.inputs["Distance"].default_value = 0.055
    coordinates = nodes.new("ShaderNodeTexCoord")
    links.new(coordinates.outputs["Generated"], texture.inputs["Vector"])
    links.new(texture.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(texture.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return material


def flat_material(name, color, roughness, metallic=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = linear_hex(color)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return material


def add_box(name, location, dimensions, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new("Hand-finished edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def add_sloped_wall(name, side, y_start, y_end, top_start, top_end, material):
    inner_x = side * (STAIR_WIDTH / 2 + 0.12)
    outer_x = side * 5.95
    x0, x1 = sorted((inner_x, outer_x))
    vertices = [
        (x0, y_start, 0), (x1, y_start, 0), (x1, y_end, 0), (x0, y_end, 0),
        (x0, y_start, top_start), (x1, y_start, top_start),
        (x1, y_end, top_end), (x0, y_end, top_end),
    ]
    faces = (
        (0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4),
        (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
    )
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(material)
    mesh.update()
    wall = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(wall)
    modifier = wall.modifiers.new("Soft limestone edges", "BEVEL")
    modifier.width = 0.055
    modifier.segments = 3
    bpy.context.view_layer.objects.active = wall
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return wall


def add_cap_between(name, start, end, material):
    midpoint = (Vector(start) + Vector(end)) * 0.5
    delta = Vector(end) - Vector(start)
    cap = add_box(name, midpoint, (0.24, delta.length, 0.14), material, 0.035)
    cap.rotation_euler[0] = math.atan2(delta.z, delta.y)
    return cap


def add_stair_set(pearl, limestone, reveal):
    # The apron and landing share the same coating as the treads, so the first
    # frame reads as one pearl-grey material field instead of a pasted stair shot.
    add_box("Pearl apron", (0, -6.0, -0.10), (12.0, 12.0, 0.20), pearl, 0.035)
    for index in range(STAIR_COUNT):
        top = (index + 1) * RISER_HEIGHT
        y = index * TREAD_DEPTH + TREAD_DEPTH / 2
        step = add_box(
            f"Pearl stair {index + 1:02d}",
            (0, y, top / 2),
            (STAIR_WIDTH, TREAD_DEPTH + 0.018, top),
            pearl,
            0.022,
        )
        step["treadIndex"] = index + 1
        # Fine warm reveals make each rise legible without introducing dark flakes.
        add_box(
            f"Warm riser reveal {index + 1:02d}",
            (0, y - TREAD_DEPTH / 2 - 0.006, top - 0.018),
            (STAIR_WIDTH - 0.16, 0.012, 0.025),
            reveal,
            0.004,
        )
    stair_end = STAIR_COUNT * TREAD_DEPTH
    add_box("Pearl upper landing", (0, stair_end + 4.0, LANDING_HEIGHT - 0.10), (STAIR_WIDTH, 8.0, 0.20), pearl, 0.035)

    # Open, sloped balustrades retain strong parallax without turning the ascent
    # into a corridor. Lower apron wings echo the approved daylight composition.
    for side in (-1, 1):
        add_box(f"Apron wing {side}", (side * 5.18, -3.15, 1.05), (1.55, 6.3, 2.10), limestone, 0.06)
        add_sloped_wall(
            f"Ascending limestone balustrade {side}", side, -0.35, 7.25,
            1.32, LANDING_HEIGHT + 1.18, limestone,
        )
        add_cap_between(
            f"Champagne balustrade cap {side}",
            (side * 4.36, -0.35, 1.39),
            (side * 4.36, 7.25, LANDING_HEIGHT + 1.25),
            reveal,
        )

    # A low parapet gives the landing a destination while preserving open sky.
    add_box("Upper landing parapet", (0, 10.65, LANDING_HEIGHT + 0.54), (5.0, 0.52, 1.08), limestone, 0.065)
    for side in (-1, 1):
        add_box(f"Parapet wing {side}", (side * 4.72, 10.65, LANDING_HEIGHT + 0.75), (3.65, 0.52, 1.50), limestone, 0.065)
    add_box("Distant pearl plane", (0, 16.0, LANDING_HEIGHT - 0.12), (12.0, 12.0, 0.24), pearl, 0.04)


def look_at(camera, position, target):
    camera.location = position
    camera.rotation_quaternion = (Vector(target) - Vector(position)).to_track_quat("-Z", "Y")


def add_camera(scene):
    bpy.ops.object.camera_add(location=CAMERA_KEYFRAMES[0]["position"])
    camera = bpy.context.object
    camera.name = "Pearl_Stair_Walk_Camera"
    camera.data.name = camera.name
    camera.data.sensor_fit = "HORIZONTAL"
    camera.data.angle = math.radians(55.0)
    camera.data.clip_start = 0.08
    camera.data.clip_end = 90.0
    camera.data.dof.use_dof = False
    camera.rotation_mode = "QUATERNION"
    for marker in CAMERA_KEYFRAMES:
        frame = round(marker["time"] * FPS)
        look_at(camera, marker["position"], marker["target"])
        camera.keyframe_insert(data_path="location", frame=frame, group="Real stair ascent")
        camera.keyframe_insert(data_path="rotation_quaternion", frame=frame, group="Real stair ascent")
    # Blender 5's layered Action API no longer exposes legacy ``action.fcurves``.
    # Key insertion defaults to Bezier interpolation, so the authored poses stay
    # smooth without reaching through the version-specific channel-bag API.
    scene.camera = camera
    return camera


def add_lighting(scene):
    world = scene.world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    sky = nodes.new("ShaderNodeTexSky")
    # Blender 5.2 exposes the Nishita model as its multiple-scattering mode.
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_elevation = math.radians(34)
    sky.sun_rotation = math.radians(138)
    sky.air_density = 1.05
    sky.ozone_density = 0.35
    background.inputs["Strength"].default_value = 0.28
    links.new(sky.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])

    bpy.ops.object.light_add(type="SUN", location=(2.0, -3.0, 10.0))
    sun = bpy.context.object
    sun.name = "Warm Alberta daylight"
    sun.data.energy = 2.7
    sun.data.angle = math.radians(9.0)
    sun.data.color = (1.0, 0.90, 0.76)
    sun.rotation_euler = (math.radians(24), math.radians(-19), math.radians(-31))

    bpy.ops.object.light_add(type="AREA", location=(0, -1.5, 8.5))
    fill = bpy.context.object
    fill.name = "Broad sky fill"
    fill.data.energy = 1050
    fill.data.shape = "DISK"
    fill.data.size = 8.0
    fill.data.color = (0.71, 0.84, 1.0)
    fill.rotation_euler = (0, 0, 0)

    bpy.ops.object.light_add(type="AREA", location=(0, 8.0, 7.5))
    landing = bpy.context.object
    landing.name = "Landing daylight"
    landing.data.energy = 820
    landing.data.shape = "RECTANGLE"
    landing.data.size = 7.0
    landing.data.size_y = 5.0
    landing.data.color = (1.0, 0.92, 0.80)


def configure_scene(width=1920, height=1080):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.actions):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)

    scene = bpy.context.scene
    scene["asset_title"] = "Pearl Stair Ascent · Unapproved Study"
    scene["approval_status"] = STATUS
    scene["provenance"] = SOURCE
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 94
    scene.render.use_file_extension = True
    scene.render.use_motion_blur = False
    scene.render.image_settings.color_management = "FOLLOW_SCENE"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.05
    scene.frame_start = 0
    scene.frame_end = round(DURATION_SECONDS * FPS)

    pearl = procedural_material(
        "Pearl grey coating", PALETTE["pearl_low"], PALETTE["pearl_high"],
        roughness=0.24, scale=1.7, bump_strength=0.10, coat=0.52,
    )
    limestone = procedural_material(
        "Pale architectural limestone", PALETTE["limestone_low"], PALETTE["limestone_high"],
        roughness=0.58, scale=1.15, bump_strength=0.18,
    )
    reveal = flat_material("Warm champagne reveal", PALETTE["warm_reveal"], 0.34, 0.16)
    add_stair_set(pearl, limestone, reveal)
    camera = add_camera(scene)
    add_lighting(scene)
    scene.frame_set(0)
    return scene, camera


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def render_still(scene, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    pending = path.with_name(f".{path.name}.next")
    scene.render.image_settings.file_format = "JPEG"
    scene.render.filepath = str(pending)
    bpy.ops.render.render(write_still=True)
    rendered = pending if pending.exists() else pending.with_suffix(pending.suffix + ".jpg")
    os.replace(rendered, path)


def render_preview():
    scene, _camera = configure_scene(1280, 720)
    output = ROOT / "output" / "blender" / "pearl-stair-ascent-preview.jpg"
    render_still(scene, output)
    print(json.dumps({"preview": str(output), "bytes": output.stat().st_size}, indent=2))


def run_ffmpeg(source, output, height):
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required to encode web delivery films")
    subprocess.run([
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
        "-vf", f"scale=-2:{height}:flags=lanczos", "-an", "-c:v", "libx264",
        "-preset", "slow", "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-g", str(GOP_SIZE), "-keyint_min", str(GOP_SIZE), "-sc_threshold", "0", str(output),
    ], check=True)


def validate_existing_ownership():
    existing = [path for path in OUTPUT_TARGETS.values() if path.exists()]
    if not existing:
        return
    manifest_path = OUTPUT_TARGETS["manifest"]
    if not manifest_path.exists():
        raise RuntimeError("refusing to replace unmarked pearl stair outputs")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("id") != "pearl-stair-ascent" or manifest.get("provenance", {}).get("source") != SOURCE:
        raise RuntimeError("existing pearl stair manifest is not owned by this builder")


def stage_paths(stage):
    """Give same-named responsive variants distinct staging directories."""
    return {
        key: stage / key / target.name
        for key, target in OUTPUT_TARGETS.items()
    }


def promote(stage, staged):
    validate_existing_ownership()
    if set(staged) != set(OUTPUT_TARGETS) or len(set(staged.values())) != len(staged):
        raise RuntimeError("pearl stair staging paths must be complete and unique")
    for path in OUTPUT_TARGETS.values():
        path.parent.mkdir(parents=True, exist_ok=True)
    rollback = Path(tempfile.mkdtemp(prefix=".pearl-stair-rollback-", dir=ROOT / "assets"))
    moved = []
    promoted = []
    try:
        for key, target in OUTPUT_TARGETS.items():
            if target.exists():
                backup = rollback / key
                os.replace(target, backup)
                moved.append((backup, target))
        for key, source in staged.items():
            target = OUTPUT_TARGETS[key]
            os.replace(source, target)
            promoted.append(target)
    except Exception as failure:
        rollback_errors = []
        for target in reversed(promoted):
            try:
                if target.exists():
                    target.unlink()
            except OSError as error:
                rollback_errors.append(error)
        for backup, target in reversed(moved):
            try:
                if backup.exists():
                    os.replace(backup, target)
            except OSError as error:
                rollback_errors.append(error)
        if rollback_errors:
            raise RuntimeError(f"promotion failed; retained recovery files at {rollback}") from failure
        rollback.rmdir()
        raise
    else:
        try:
            for backup, _target in moved:
                if backup.exists():
                    backup.unlink()
            rollback.rmdir()
        except OSError as failure:
            raise RuntimeError(f"promotion succeeded; retained obsolete backups at {rollback}") from failure


def render_full():
    scene, _camera = configure_scene(1920, 1080)
    stage_parent = ROOT / "assets" / "brand" / "source"
    stage_parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".pearl-stair-build-", dir=stage_parent) as temporary:
        stage = Path(temporary)
        staged = stage_paths(stage)
        for path in staged.values():
            path.parent.mkdir(parents=True, exist_ok=True)
        scene.frame_set(0)
        scene.render.filepath = str(staged["poster"])
        bpy.ops.render.render(write_still=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(staged["blend"]))

        scene.frame_set(0)
        scene.render.image_settings.file_format = "FFMPEG"
        scene.render.ffmpeg.format = "MPEG4"
        scene.render.ffmpeg.codec = "H264"
        scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
        scene.render.ffmpeg.gopsize = GOP_SIZE
        scene.render.ffmpeg.audio_codec = "NONE"
        scene.render.filepath = str(staged["master"])
        bpy.ops.render.render(animation=True)
        run_ffmpeg(staged["master"], staged["film720"], 720)
        run_ffmpeg(staged["master"], staged["film480"], 480)

        assets = {}
        for key in ("blend", "master", "poster", "film480", "film720"):
            path = staged[key]
            if not path.exists() or path.stat().st_size < 20_000:
                raise RuntimeError(f"missing or implausibly small {key} output")
            assets[key] = {"file": OUTPUT_TARGETS[key].relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}
        manifest = {
            "schemaVersion": 1,
            "id": "pearl-stair-ascent",
            "status": STATUS,
            "durationSeconds": DURATION_SECONDS,
            "fps": FPS,
            "gopSize": GOP_SIZE,
            "geometry": {"stairCount": STAIR_COUNT, "stairWidthM": STAIR_WIDTH, "riserHeightM": RISER_HEIGHT, "treadDepthM": TREAD_DEPTH},
            "camera": {"node": "Pearl_Stair_Walk_Camera", "keyframes": list(CAMERA_KEYFRAMES)},
            "palette": PALETTE,
            "assets": assets,
            "provenance": {"source": SOURCE, "blenderBuiltWith": bpy.app.version_string, "externalAssets": []},
        }
        staged["manifest"].write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        promote(stage, staged)
    print(json.dumps({"outputs": {key: str(path) for key, path in OUTPUT_TARGETS.items()}}, indent=2))


def main():
    if bpy.app.version[:2] != (5, 2):
        raise RuntimeError(f"Pearl Stair Ascent requires Blender 5.2.x; found {bpy.app.version_string}")
    bpy.context.preferences.filepaths.save_version = 0
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if "--full" in args:
        render_full()
    else:
        render_preview()


if __name__ == "__main__":
    main()

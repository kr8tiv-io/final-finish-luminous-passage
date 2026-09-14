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
DURATION_SECONDS = 9.0
GOP_SIZE = 6
STAIR_COUNT = 15
STAIR_WIDTH = 9.4
RISER_HEIGHT = 0.165
TREAD_DEPTH = 0.46
LANDING_HEIGHT = STAIR_COUNT * RISER_HEIGHT
CAMERA_LENS_MM = 27.0
PALETTE = {
    "pearl_low": "#AEB6B8",
    "pearl_mid": "#D9DCDD",
    "pearl_high": "#F2EEE7",
    "limestone_low": "#9D9588",
    "limestone_high": "#DED4C5",
    "joint": "#89857F",
    "warm_reveal": "#C8AD86",
    "sky": "#9AC4DD",
}
CAMERA_KEYFRAMES = (
    {"time": 0.0, "position": (0.0, -9.10, 1.48), "target": (0.0, 1.35, 0.64)},
    {"time": 1.5, "position": (0.0, -6.85, 1.50), "target": (0.0, 2.20, 1.00)},
    {"time": 3.0, "position": (0.0, -4.45, 1.52), "target": (0.0, 3.20, 1.52)},
    {"time": 4.5, "position": (0.0, -1.15, 1.68), "target": (0.0, 4.70, 2.18)},
    {"time": 6.0, "position": (0.0, 1.10, 2.30), "target": (0.0, 6.20, 2.92)},
    {"time": 7.3, "position": (0.0, 3.15, 3.02), "target": (0.0, 8.15, 3.55)},
    {"time": 8.2, "position": (0.0, 5.25, 3.76), "target": (0.0, 10.10, 4.02)},
    {"time": 9.0, "position": (0.0, 7.30, 3.995), "target": (0.0, 12.40, 4.06)},
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


def pearl_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 0.19
    principled.inputs["Metallic"].default_value = 0.03
    if "Coat Weight" in principled.inputs:
        principled.inputs["Coat Weight"].default_value = 0.42
        principled.inputs["Coat Roughness"].default_value = 0.12

    coordinates = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.42, 0.62, 1.0)
    broad = nodes.new("ShaderNodeTexNoise")
    broad.name = "Large pearlescent clouds"
    broad.noise_dimensions = "4D"
    broad.inputs["Scale"].default_value = 3.4
    broad.inputs["Detail"].default_value = 7.0
    broad.inputs["Roughness"].default_value = 0.68
    broad.inputs["Distortion"].default_value = 0.32
    broad.inputs["W"].default_value = 1.73
    fine = nodes.new("ShaderNodeTexNoise")
    fine.name = "Fine hand-trowelled variation"
    fine.inputs["Scale"].default_value = 11.0
    fine.inputs["Detail"].default_value = 3.0
    fine.inputs["Roughness"].default_value = 0.64
    mix = nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs["Fac"].default_value = 0.34
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "EASE"
    ramp.color_ramp.elements[0].position = 0.24
    ramp.color_ramp.elements[0].color = linear_hex(PALETTE["pearl_low"])
    warm = ramp.color_ramp.elements.new(0.43)
    warm.color = linear_hex("#EEE4D9")
    middle = ramp.color_ramp.elements.new(0.57)
    middle.color = linear_hex(PALETTE["pearl_mid"])
    ramp.color_ramp.elements[1].position = 0.76
    ramp.color_ramp.elements[1].color = linear_hex(PALETTE["pearl_high"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.075
    bump.inputs["Distance"].default_value = 0.018
    links.new(coordinates.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], broad.inputs["Vector"])
    links.new(mapping.outputs["Vector"], fine.inputs["Vector"])
    links.new(broad.outputs["Fac"], mix.inputs[1])
    links.new(fine.outputs["Fac"], mix.inputs[2])
    links.new(mix.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(fine.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return material


def limestone_material(name):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 0.57
    coordinates = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (0.62, 0.62, 1.45)
    base = nodes.new("ShaderNodeTexNoise")
    base.noise_dimensions = "4D"
    base.name = "Limestone clouding"
    base.inputs["Scale"].default_value = 3.2
    base.inputs["Detail"].default_value = 6.0
    base.inputs["Roughness"].default_value = 0.72
    base.inputs["Distortion"].default_value = 0.38
    base.inputs["W"].default_value = 4.1
    pores = nodes.new("ShaderNodeTexNoise")
    pores.name = "Fine limestone pores"
    pores.inputs["Scale"].default_value = 46.0
    pores.inputs["Detail"].default_value = 2.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.24
    ramp.color_ramp.elements[0].color = linear_hex(PALETTE["limestone_low"])
    ramp.color_ramp.elements[1].position = 0.82
    ramp.color_ramp.elements[1].color = linear_hex(PALETTE["limestone_high"])
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.20
    bump.inputs["Distance"].default_value = 0.018
    links.new(coordinates.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], base.inputs["Vector"])
    links.new(mapping.outputs["Vector"], pores.inputs["Vector"])
    links.new(base.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])
    links.new(pores.outputs["Fac"], bump.inputs["Height"])
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


def add_joint(name, location, dimensions, material):
    """Inset-looking masonry joint used as a real, shadow-catching object."""
    return add_box(name, location, dimensions, material, 0.003)


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


def add_retaining_walls(limestone, joint):
    """Panelled side walls ground the open stair in credible civic architecture."""
    for side in (-1, 1):
        x = side * 6.05
        add_box(f"Forecourt retaining wall {side}", (x, -3.35, 1.18), (0.34, 7.3, 2.36), limestone, 0.045)
        add_box(f"Forecourt wall cap {side}", (x - side * 0.03, -3.35, 2.41), (0.52, 7.42, 0.15), limestone, 0.035)
        for y in (-5.65, -3.35, -1.05):
            add_joint(f"Wall vertical joint {side} {y}", (x - side * 0.176, y, 1.25), (0.012, 0.035, 2.05), joint)
        add_joint(f"Wall horizontal joint {side}", (x - side * 0.176, -3.35, 1.14), (0.012, 7.12, 0.025), joint)


def add_stair_set(pearl, limestone, joint):
    stair_end = STAIR_COUNT * TREAD_DEPTH
    # A deep, polished forecourt is essential to the approved image: it reflects
    # the sun and lets the viewer read the finish before reaching the first tread.
    add_box("Pearl forecourt", (0, -4.75, -0.095), (11.6, 9.5, 0.19), pearl, 0.025)
    add_box("Left limestone border", (-5.92, -4.75, -0.06), (0.34, 9.5, 0.13), limestone, 0.025)
    add_box("Right limestone border", (5.92, -4.75, -0.06), (0.34, 9.5, 0.13), limestone, 0.025)
    add_retaining_walls(limestone, joint)

    for index in range(STAIR_COUNT):
        top = (index + 1) * RISER_HEIGHT
        y = index * TREAD_DEPTH + TREAD_DEPTH / 2
        step = add_box(
            f"Pearl stair {index + 1:02d}",
            (0, y - 0.018, top / 2),
            (STAIR_WIDTH, TREAD_DEPTH + 0.052, top),
            pearl,
            0.028,
        )
        step["treadIndex"] = index + 1
        # A recessed line under each bullnose produces the natural horizontal
        # shadow visible in the reference without resorting to black flakes.
        add_box(
            f"Nosing shadow {index + 1:02d}",
            (0, y - TREAD_DEPTH / 2 - 0.046, top - 0.045),
            (STAIR_WIDTH - 0.10, 0.014, 0.026),
            joint,
            0.002,
        )
        seam_x = (-2.35, 0.0, 2.35)[index % 3]
        add_joint(
            f"Riser masonry seam {index + 1:02d}",
            (seam_x, y - TREAD_DEPTH / 2 - 0.054, top - RISER_HEIGHT / 2),
            (0.018, 0.012, RISER_HEIGHT - 0.045), joint,
        )
        # Sparse expansion joints break the implausibly perfect continuous run.
        if index in (4, 9):
            add_joint(
                f"Tread expansion joint {index + 1:02d}",
                (0.0, y + TREAD_DEPTH * 0.28, top + 0.003),
                (0.018, TREAD_DEPTH * 0.45, 0.008), joint,
            )
    add_box("Pearl upper landing", (0, stair_end + 4.0, LANDING_HEIGHT - 0.10), (STAIR_WIDTH, 8.0, 0.20), pearl, 0.035)

    # Open, sloped balustrades retain strong parallax without turning the ascent
    # into a corridor. Lower apron wings echo the approved daylight composition.
    for side in (-1, 1):
        add_sloped_wall(
            f"Ascending limestone balustrade {side}", side, -0.12, stair_end + 0.38,
            1.28, LANDING_HEIGHT + 1.18, limestone,
        )
        add_cap_between(
            f"Limestone balustrade cap {side}",
            (side * (STAIR_WIDTH / 2 + 0.15), -0.12, 1.36),
            (side * (STAIR_WIDTH / 2 + 0.15), stair_end + 0.38, LANDING_HEIGHT + 1.26),
            limestone,
        )
        # Broad vertical joints articulate the veneer on the balustrade faces.
        for segment in range(1, 6):
            y = segment * stair_end / 6
            top = 1.28 + (LANDING_HEIGHT - 0.10) * (y / stair_end)
            add_joint(
                f"Balustrade joint {side} {segment}",
                (side * (STAIR_WIDTH / 2 + 0.118), y, top * 0.55),
                (0.014, 0.026, max(0.5, top - 0.22)), joint,
            )

        # Substantial foot posts match the reference's human-scale masonry.
        add_box(f"Balustrade foot post {side}", (side * 5.08, -0.02, 0.84), (0.86, 0.86, 1.68), limestone, 0.055)
        add_box(f"Balustrade foot post cap {side}", (side * 5.08, -0.02, 1.73), (1.02, 1.02, 0.16), limestone, 0.035)

    # A low parapet gives the landing a destination while preserving open sky.
    add_box("Upper landing parapet", (0, 10.65, LANDING_HEIGHT + 0.54), (5.0, 0.52, 1.08), limestone, 0.055)
    add_box("Upper parapet cap", (0, 10.65, LANDING_HEIGHT + 1.13), (5.25, 0.68, 0.14), limestone, 0.035)
    for side in (-1, 1):
        add_box(f"Parapet wing {side}", (side * 4.72, 10.65, LANDING_HEIGHT + 0.75), (3.65, 0.52, 1.50), limestone, 0.065)
        add_box(f"Parapet wing cap {side}", (side * 4.72, 10.65, LANDING_HEIGHT + 1.55), (3.82, 0.68, 0.14), limestone, 0.035)
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
    camera.data.lens = CAMERA_LENS_MM
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
    sky.sun_elevation = math.radians(18)
    sky.sun_rotation = math.radians(238)
    sky.air_density = 0.95
    sky.ozone_density = 0.42
    background.inputs["Strength"].default_value = 0.20
    links.new(sky.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])

    bpy.ops.object.light_add(type="SUN", location=(2.0, -3.0, 10.0))
    sun = bpy.context.object
    sun.name = "Low warm Alberta daylight"
    sun.data.energy = 3.8
    sun.data.angle = math.radians(3.2)
    sun.data.color = (1.0, 0.84, 0.66)
    sun.rotation_mode = "QUATERNION"
    sun.rotation_quaternion = (Vector((0.0, 1.8, 0.0)) - Vector((-11.0, -15.0, 13.0))).to_track_quat("-Z", "Y")

    bpy.ops.object.light_add(type="AREA", location=(0, -1.5, 8.5))
    fill = bpy.context.object
    fill.name = "Broad sky fill"
    fill.data.energy = 660
    fill.data.shape = "DISK"
    fill.data.size = 8.0
    fill.data.color = (0.82, 0.89, 1.0)
    fill.rotation_euler = (0, 0, 0)

    bpy.ops.object.light_add(type="AREA", location=(0, 8.0, 7.5))
    landing = bpy.context.object
    landing.name = "Landing daylight"
    landing.data.energy = 440
    landing.data.shape = "RECTANGLE"
    landing.data.size = 7.0
    landing.data.size_y = 5.0
    landing.data.color = (1.0, 0.92, 0.80)

    bpy.ops.object.light_add(type="AREA", location=(-5.8, -5.0, 5.5))
    warmth = bpy.context.object
    warmth.name = "Warm forecourt reflection"
    warmth.data.energy = 780
    warmth.data.shape = "RECTANGLE"
    warmth.data.size = 5.0
    warmth.data.size_y = 3.0
    warmth.data.color = (1.0, 0.72, 0.49)
    warmth.rotation_mode = "QUATERNION"
    warmth.rotation_quaternion = (Vector((0.0, -3.4, 0.0)) - warmth.location).to_track_quat("-Z", "Y")


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
    scene.view_settings.exposure = -0.55
    scene.frame_start = 0
    scene.frame_end = round(DURATION_SECONDS * FPS)

    pearl = pearl_material("Pearl grey hand-trowelled coating")
    limestone = limestone_material("Veined pale architectural limestone")
    joint = flat_material("Recessed warm-grey masonry joints", PALETTE["joint"], 0.82)
    add_stair_set(pearl, limestone, joint)
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
            "camera": {
                "node": "Pearl_Stair_Walk_Camera",
                "lensMm": CAMERA_LENS_MM,
                "stabilization": "centred monotonic ascent; no sway, bob, or zoom",
                "keyframes": list(CAMERA_KEYFRAMES),
            },
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

"""Build the compact Follow-the-Floor garage-to-vault threshold scene.

Run from the repository root with Blender 5.2 LTS:
  blender --background --factory-startup --python tools/blender/build_follow_floor_threshold.py

The scene is generated without downloads, add-ons, or external textures. Outputs
are staged and validated inside their owned directory before per-file promotion.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
import shutil
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUTPUT_DIR = ROOT / "public" / "scenes" / "follow-floor-threshold"
SOURCE = "tools/blender/build_follow_floor_threshold.py"
OUTPUT_NAMES = ("scene.glb", "poster.jpg", "manifest.json")
FPS = 30
DURATION_SECONDS = 4.2
HORIZONTAL_FOV_DEGREES = 56.0
POSTER_TIME_SECONDS = 0.0
CAMERA_KEYFRAMES = (
    {"time": 0.0, "position": [0.0, 1.62, 4.6], "target": [0.0, 1.42, -1.8]},
    {"time": 1.5, "position": [0.04, 1.61, 0.15], "target": [0.16, 1.43, -4.4]},
    {"time": 2.7, "position": [0.18, 1.60, -2.45], "target": [0.48, 1.43, -7.1]},
    {"time": 4.2, "position": [0.70, 1.58, -6.35], "target": [-1.35, 1.45, -10.5]},
)


def gltf_to_blender(point):
    """Map contract Y-up/-Z-forward coordinates to Blender Z-up coordinates."""
    x, y, z = point
    return (x, -z, y)


def blender_to_gltf(point):
    return [round(point.x, 5), round(point.z, 5), round(-point.y, 5)]


def srgb(hex_value):
    value = hex_value.lstrip("#")
    return tuple((int(value[index:index + 2], 16) / 255.0) ** 2.2 for index in (0, 2, 4)) + (1.0,)


def material(name, color, roughness, metallic=0.0, emission=None, emission_strength=0.0):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = srgb(color)
    node = result.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = srgb(color)
    node.inputs["Roughness"].default_value = roughness
    node.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in node.inputs:
        node.inputs["Coat Weight"].default_value = 0.34
        node.inputs["Coat Roughness"].default_value = 0.11
    if emission:
        node.inputs["Emission Color"].default_value = srgb(emission)
        node.inputs["Emission Strength"].default_value = emission_strength
    return result


def parent_to_root(obj, root):
    obj.parent = root
    return obj


def add_box(name, center, size, surface, root, bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(location=gltf_to_blender(center))
    obj = bpy.context.object
    obj.name = name
    # Blender axes are X/right, Y/back, Z/up; glTF dimensions are X/right, Y/up, Z/depth.
    obj.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.name = name
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Architectural edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return parent_to_root(obj, root)


def add_floor(root, coating, salt_flake, cobalt_flake):
    vertices = []
    faces = []
    material_indices = []

    def cuboid(minimum, maximum, material_index):
        start = len(vertices)
        x0, y0, z0 = minimum
        x1, y1, z1 = maximum
        corners = (
            (x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1),
        )
        vertices.extend(gltf_to_blender(point) for point in corners)
        local_faces = (
            (0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7),
            (0, 1, 5), (0, 5, 4), (3, 7, 6), (3, 6, 2),
            (0, 4, 7), (0, 7, 3), (1, 2, 6), (1, 6, 5),
        )
        faces.extend(tuple(start + index for index in face) for face in local_faces)
        material_indices.extend([material_index] * len(local_faces))

    cuboid((-3.8, -0.12, -11.8), (3.8, 0.0, 4.8), 0)
    rng = random.Random(0xF10A)
    for index in range(210):
        x = rng.uniform(-3.68, 3.68)
        z = rng.uniform(-11.65, 4.65)
        radius = rng.uniform(0.012, 0.038)
        aspect = rng.uniform(0.42, 1.0)
        angle = rng.uniform(0, math.tau)
        start = len(vertices)
        for corner in range(4):
            theta = angle + corner * math.pi / 2
            point = (x + math.cos(theta) * radius, 0.006, z + math.sin(theta) * radius * aspect)
            vertices.append(gltf_to_blender(point))
        faces.extend(((start, start + 1, start + 2), (start, start + 2, start + 3)))
        material_indices.extend([2 if index % 17 == 0 else 1] * 2)

    mesh = bpy.data.meshes.new("FFT_Floor_Coated")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(coating)
    mesh.materials.append(salt_flake)
    mesh.materials.append(cobalt_flake)
    for polygon, material_index in zip(mesh.polygons, material_indices):
        polygon.material_index = material_index
    mesh.update()
    obj = bpy.data.objects.new("FFT_Floor_Coated", mesh)
    bpy.context.collection.objects.link(obj)
    return parent_to_root(obj, root)


def look_at(object_, position, target):
    object_.location = gltf_to_blender(position)
    object_.rotation_quaternion = (Vector(gltf_to_blender(target)) - object_.location).to_track_quat("-Z", "Y")


def add_camera(root, scene):
    bpy.ops.object.camera_add(location=gltf_to_blender(CAMERA_KEYFRAMES[0]["position"]))
    camera = bpy.context.object
    camera.name = "FFT_Experience_Camera"
    camera.data.name = "FFT_Experience_Camera"
    camera.data.sensor_fit = "HORIZONTAL"
    camera.data.angle = math.radians(HORIZONTAL_FOV_DEGREES)
    camera.data.clip_start = 0.08
    camera.data.clip_end = 80.0
    camera.rotation_mode = "QUATERNION"
    parent_to_root(camera, root)
    action = bpy.data.actions.new("FFT_Garage_To_Vault")
    camera.animation_data_create()
    camera.animation_data.action = action
    for marker in CAMERA_KEYFRAMES:
        frame = round(marker["time"] * FPS)
        look_at(camera, marker["position"], marker["target"])
        camera.keyframe_insert(data_path="location", frame=frame, group="Camera transform")
        camera.keyframe_insert(data_path="rotation_quaternion", frame=frame, group="Camera transform")
    scene.frame_start = 0
    scene.frame_end = round(DURATION_SECONDS * FPS)
    scene.frame_set(0)
    scene.camera = camera
    return camera


def add_lights(root):
    bpy.ops.object.light_add(type="SUN", location=gltf_to_blender((2.5, 5.8, 1.5)))
    sun = bpy.context.object
    sun.name = "FFT_Daylight"
    sun.data.name = "FFT_Daylight"
    sun.data.energy = 2.4
    sun.data.color = (1.0, 0.89, 0.72)
    sun.data.angle = math.radians(18)
    sun.rotation_euler = (math.radians(28), math.radians(-22), math.radians(-24))
    parent_to_root(sun, root)

    for name, position, energy, color in (
        ("FFT_Garage_Bounce", (-1.7, 2.55, 1.4), 520.0, (1.0, 0.80, 0.62)),
        ("FFT_Vault_Skylight", (0.9, 2.8, -6.6), 880.0, (0.76, 0.88, 1.0)),
        ("FFT_Arrival_Bounce", (-1.8, 2.25, -10.1), 420.0, (1.0, 0.91, 0.76)),
    ):
        bpy.ops.object.light_add(type="POINT", location=gltf_to_blender(position))
        light = bpy.context.object
        light.name = name
        light.data.name = name
        light.data.energy = energy
        light.data.color = color
        light.data.shadow_soft_size = 1.35
        parent_to_root(light, root)


def configure_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.actions):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.quality = 92
    scene.render.film_transparent = False
    scene.render.fps = FPS
    scene.render.fps_base = 1.0
    scene.render.image_settings.color_depth = "8"
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = srgb("#dce9f0")
    background.inputs["Strength"].default_value = 0.48
    scene.view_settings.look = "AgX - Medium High Contrast"
    return scene


def build_scene():
    scene = configure_scene()
    root = bpy.data.objects.new("FFT_Set_Root", None)
    bpy.context.collection.objects.link(root)

    warm_white = material("FFT_Warm_White_Plaster", "#FAF9F6", 0.72)
    pale_stone = material("FFT_Pale_Stone", "#d9d7ce", 0.58)
    warm_bronze = material("FFT_Warm_Bronze_Reveal", "#8f7252", 0.31, 0.62, emission="#8f7252", emission_strength=0.08)
    cobalt = material("FFT_Cobalt_Reveal", "#164F83", 0.28, 0.42, emission="#164F83", emission_strength=0.22)
    glass_light = material("FFT_Skylight_Diffuser", "#dcecf4", 0.26, emission="#dcecf4", emission_strength=1.8)
    coating = material("FFT_Coating_Pale_Flake", "#eeeae0", 0.22)
    salt_flake = material("FFT_Flake_Salt", "#b9b8b2", 0.30, 0.08)
    cobalt_flake = material("FFT_Flake_Cobalt", "#164F83", 0.25, 0.36)

    add_floor(root, coating, salt_flake, cobalt_flake)
    add_box("FFT_Wall_Left", (-3.9, 1.55, -3.5), (0.20, 3.1, 16.6), warm_white, root, 0.035)
    add_box("FFT_Wall_Right", (3.9, 1.55, -3.5), (0.20, 3.1, 16.6), warm_white, root, 0.035)
    add_box("FFT_Vault_End_Wall", (0.0, 1.55, -11.85), (8.0, 3.1, 0.22), pale_stone, root, 0.03)
    add_box("FFT_Garage_Ceiling", (0.0, 3.18, 1.45), (7.8, 0.16, 6.6), warm_white, root, 0.025)
    add_box("FFT_Vault_Ceiling_Left", (-2.55, 3.18, -6.85), (2.7, 0.16, 10.0), warm_white, root, 0.025)
    add_box("FFT_Vault_Ceiling_Right", (2.55, 3.18, -6.85), (2.7, 0.16, 10.0), warm_white, root, 0.025)
    add_box("FFT_Skylight", (0.0, 3.17, -6.65), (2.30, 0.06, 4.9), glass_light, root, 0.02)

    # A human-scale 3.2 m opening reads as a threshold within the wider room;
    # warm-white returns conceal the larger structural span on either side.
    add_box("FFT_Portal_Return_Left", (-2.82, 1.54, -1.72), (2.16, 3.08, 0.32), warm_white, root, 0.025)
    add_box("FFT_Portal_Return_Right", (2.82, 1.54, -1.72), (2.16, 3.08, 0.32), warm_white, root, 0.025)
    add_box("FFT_Portal", (0.0, 2.73, -1.54), (3.64, 0.34, 0.38), pale_stone, root, 0.075)
    add_box("FFT_Portal_Jamb_Left", (-1.72, 1.30, -1.54), (0.20, 2.60, 0.38), pale_stone, root, 0.055)
    add_box("FFT_Portal_Jamb_Right", (1.72, 1.30, -1.54), (0.20, 2.60, 0.38), pale_stone, root, 0.055)
    add_box("FFT_Cobalt_Threshold", (0.0, 0.022, -1.31), (3.24, 0.044, 0.16), cobalt, root, 0.008)
    add_box("FFT_Cobalt_Reveal_Left", (-1.59, 1.28, -1.31), (0.045, 2.46, 0.08), warm_bronze, root, 0.006)
    add_box("FFT_Cobalt_Reveal_Right", (1.59, 1.28, -1.31), (0.045, 2.46, 0.08), warm_bronze, root, 0.006)

    for index, x in enumerate((-2.45, -0.82, 0.82, 2.45)):
        add_box(f"FFT_Vault_Wall_Panel_{index + 1}", (x, 1.58, -11.70), (1.45, 2.68, 0.08), warm_white, root, 0.018)
    for index, z in enumerate((-3.4, -6.0, -8.6, -10.9)):
        add_box(f"FFT_Ceiling_Rib_{index + 1}", (0.0, 3.07, z), (7.20, 0.055, 0.07), pale_stone, root, 0.012)

    add_lights(root)
    camera = add_camera(root, scene)
    return scene, root, camera


def scene_bounds(root):
    points = []
    for obj in root.children_recursive:
        if obj.type != "MESH":
            continue
        points.extend(blender_to_gltf(obj.matrix_world @ Vector(corner)) for corner in obj.bound_box)
    return {
        "min": [min(point[axis] for point in points) for axis in range(3)],
        "max": [max(point[axis] for point in points) for axis in range(3)],
    }


def export_scene(path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects["FFT_Set_Root"]
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_materials="EXPORT",
        export_yup=True,
        export_cameras=True,
        export_lights=True,
        export_animations=True,
        export_force_sampling=True,
        export_frame_range=True,
        export_apply=True,
        export_normals=True,
        export_tangents=False,
    )


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_existing_ownership():
    manifest_path = OUTPUT_DIR / "manifest.json"
    existing = [OUTPUT_DIR / name for name in OUTPUT_NAMES if (OUTPUT_DIR / name).exists()]
    if not existing:
        return
    if not manifest_path.exists():
        raise RuntimeError("refusing to replace unmarked threshold outputs")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("id") != "follow-floor-threshold" or manifest.get("provenance", {}).get("source") != SOURCE:
        raise RuntimeError("existing threshold manifest is not owned by this builder")


def validate_stage(stage):
    glb = stage / "scene.glb"
    poster = stage / "poster.jpg"
    manifest = json.loads((stage / "manifest.json").read_text(encoding="utf-8"))
    if glb.read_bytes()[:4] != b"glTF" or glb.stat().st_size < 10_000:
        raise RuntimeError("threshold GLB is missing or implausibly small")
    if poster.read_bytes()[:2] != b"\xff\xd8" or poster.stat().st_size < 20_000:
        raise RuntimeError("threshold poster is missing or implausibly small")
    if manifest["scene"]["sha256"] != sha256(glb) or manifest["poster"]["sha256"] != sha256(poster):
        raise RuntimeError("threshold hashes do not match staged outputs")


def promote(stage):
    validate_existing_ownership()
    # Do not auto-delete this directory: a locked destination during rollback
    # must leave the previous package recoverable instead of erasing its backup.
    backup = Path(tempfile.mkdtemp(prefix=".follow-floor-threshold-rollback-", dir=OUTPUT_DIR))
    moved = []
    pending = []
    promoted = []
    try:
        # Copy to direct children so the files inherit the public directory ACL
        # before the sibling atomic replacements (Windows preserves moved ACLs).
        for name in OUTPUT_NAMES:
            next_path = OUTPUT_DIR / f".{name}.next"
            if next_path.exists():
                next_path.unlink()
            pending.append(next_path)
            with (stage / name).open("rb") as source, next_path.open("wb") as destination:
                shutil.copyfileobj(source, destination)
                destination.flush()
                os.fsync(destination.fileno())
        for name in OUTPUT_NAMES:
            target = OUTPUT_DIR / name
            if target.exists():
                destination = backup / name
                os.replace(target, destination)
                moved.append((destination, target))
        for source, name in zip(pending, OUTPUT_NAMES):
            target = OUTPUT_DIR / name
            os.replace(source, target)
            promoted.append(target)
    except Exception as failure:
        rollback_errors = []
        # Only remove payloads actually promoted by this attempt. Unmoved old
        # files must survive a failure during copying or partial backup.
        for path in pending + promoted:
            try:
                if path.exists():
                    path.unlink()
            except OSError as error:
                rollback_errors.append(error)
        for source, target in moved:
            try:
                os.replace(source, target)
            except OSError as error:
                rollback_errors.append(error)
        if rollback_errors:
            raise RuntimeError(f"Promotion failed; retained recovery files at {backup}") from failure
        backup.rmdir()
        raise
    else:
        for source, _target in moved:
            source.unlink()
        backup.rmdir()


def main():
    if bpy.app.version[:2] != (5, 2):
        raise RuntimeError(f"Follow Floor Threshold requires Blender 5.2.x; found {bpy.app.version_string}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    with tempfile.TemporaryDirectory(prefix=".follow-floor-threshold-build-", dir=OUTPUT_DIR) as temporary:
        stage = Path(temporary)
        scene, root, camera = build_scene()
        bounds = scene_bounds(root)
        poster = stage / "poster.jpg"
        # The poster pauses on approach so the complete portal and its cobalt
        # floor/reveal detail frame the brighter destination room.
        poster_frame = round(POSTER_TIME_SECONDS * FPS)
        scene.frame_set(poster_frame)
        scene.camera = camera
        scene.render.filepath = str(poster)
        bpy.ops.render.render(write_still=True)
        scene.frame_set(0)
        glb = stage / "scene.glb"
        export_scene(glb)
        manifest = {
            "schemaVersion": 1,
            "id": "follow-floor-threshold",
            "transition": {"from": "garage", "to": "vault"},
            "units": "metres",
            "axes": {"up": "Y", "forward": "-Z"},
            "poster": {"file": "poster.jpg", "width": 960, "height": 540, "timeSeconds": POSTER_TIME_SECONDS, "frame": poster_frame, "bytes": poster.stat().st_size, "sha256": sha256(poster)},
            "scene": {"file": "scene.glb", "bytes": glb.stat().st_size, "sha256": sha256(glb)},
            "floorMesh": "FFT_Floor_Coated",
            "camera": {
                "node": "FFT_Experience_Camera",
                "clip": "FFT_Garage_To_Vault",
                "durationSeconds": DURATION_SECONDS,
                "fps": FPS,
                "horizontalFovDegrees": HORIZONTAL_FOV_DEGREES,
                "keyframes": list(CAMERA_KEYFRAMES),
            },
            "bounds": bounds,
            "provenance": {"source": SOURCE, "blenderBuiltWith": bpy.app.version_string},
        }
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        validate_stage(stage)
        promote(stage)
    print(json.dumps({"output": str(OUTPUT_DIR), "manifest": manifest}, indent=2))


if __name__ == "__main__":
    main()

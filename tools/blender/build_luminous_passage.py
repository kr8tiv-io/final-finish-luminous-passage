"""Build, render, and export the web-ready Luminous Passage environment.

Usage (from repository root):
  blender --background --factory-startup --python tools/blender/build_luminous_passage.py

No add-ons, downloads, network access, telemetry, or external textures are used.
All material variation is procedural so the GLBs remain compact and reproducible.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
import shutil
import sys
import tempfile
from pathlib import Path

import bpy
from mathutils import Vector

TOOL_DIR = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
if str(TOOL_DIR) not in sys.path:
    sys.path.insert(0, str(TOOL_DIR))
from scene_contract import BLENDER_VERSION_PIN, CAMERA_HANDOFF, CAMERA_ROUTE, EXPORT_CHUNKS, MATERIAL_LIBRARY, SCENE_ZONES, TEXTURE_CONTRACT, TEXTURED_SURFACES, manifest_payload

ROOT = Path(__file__).resolve().parents[2]
ASSET_DIR = ROOT / "assets" / "3d"
PUBLIC_DIR = ROOT / "public" / "3d"
POSTER_DIR = PUBLIC_DIR / "posters"
TEXTURE_DIR = PUBLIC_DIR / "textures" / "luminous-passage"
ACTIVE_ASSET_DIR = ASSET_DIR
ACTIVE_PUBLIC_DIR = PUBLIC_DIR
ACTIVE_POSTER_DIR = POSTER_DIR
ACTIVE_TEXTURE_DIR = TEXTURE_DIR
TEXTURE_MAPS = {}
OWNERSHIP_MARKER = "luminous-passage.ownership.json"
OWNERSHIP_OWNER = "kr8tiv-io/luminous-passage"


def linear(hex_value: str):
    h = hex_value.lstrip("#")
    # Blender accepts linearized values; approximate sRGB decode keeps pale plaster natural.
    return tuple((int(h[i:i + 2], 16) / 255.0) ** 2.2 for i in (0, 2, 4)) + (1.0,)


def collection(name: str):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def link(obj, target):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    target.objects.link(obj)


def texture_seed(key: str) -> int:
    return int(hashlib.sha256(key.encode("utf-8")).hexdigest()[:16], 16)


def texture_image(name, pixels, color_space="sRGB"):
    """Save a true raster texture and pack it for the GLB exporter."""
    size = 128
    image = bpy.data.images.new(name, size, size, alpha=True)
    image.colorspace_settings.name = color_space
    image.pixels.foreach_set(pixels)
    image.file_format = "PNG"
    image.filepath_raw = str(ACTIVE_TEXTURE_DIR / f"{name}.png")
    image.save()
    image.pack()
    return image


def bake_material_maps(key, color, roughness, flake=True):
    """Generate deterministic 128px tiling PBR maps for web delivery.

    These are baked raster maps, not a procedural-node export: base color,
    roughness and tangent-space normal maps are all directly supported by glTF.
    """
    size = 128
    rng = random.Random(texture_seed(key))
    base = [list(color[:3]) for _ in range(size * size)]
    height = [0.08 + rng.random() * .028 for _ in range(size * size)]
    if flake:
        # Deliberately varied, tiny irregular chips; the tile repeats at a 0.28m scale.
        for _ in range(260):
            cx, cy = rng.randrange(size), rng.randrange(size)
            radius = rng.choice((1, 1, 1, 2, 2, 3))
            tone = rng.choice((.62, .78, 1.13, 1.28))
            for oy in range(-radius, radius + 1):
                for ox in range(-radius, radius + 1):
                    if ox * ox + oy * oy > radius * radius * rng.uniform(.7, 1.1):
                        continue
                    index = ((cy + oy) % size) * size + ((cx + ox) % size)
                    grain = .90 + rng.random() * .16
                    base[index] = [min(1.0, channel * tone * grain) for channel in color[:3]]
                    height[index] = .38 + rng.random() * .48
    else:
        for y in range(size):
            for x in range(size):
                index = y * size + x
                vein = math.sin(x * .19 + math.sin(y * .07) * 2.7) * .028 + rng.random() * .018
                base[index] = [min(1.0, max(0.0, channel + vein)) for channel in color[:3]]
                height[index] = .12 + vein * 2
    base_pixels = [component for rgb in base for component in (*rgb, 1.0)]
    rough_pixels = []
    normal_pixels = []
    for y in range(size):
        for x in range(size):
            i = y * size + x
            dx = height[y * size + ((x + 1) % size)] - height[y * size + ((x - 1) % size)]
            dy = height[((y + 1) % size) * size + x] - height[((y - 1) % size) * size + x]
            normal_pixels.extend((.5 - dx * 1.8, .5 - dy * 1.8, 1.0, 1.0))
            local_roughness = min(.95, max(.08, roughness + (height[i] - .2) * .14))
            rough_pixels.extend((local_roughness, local_roughness, local_roughness, 1.0))
    return {
        "baseColor": texture_image(f"{key}-basecolor", base_pixels),
        "roughness": texture_image(f"{key}-roughness", rough_pixels, "Non-Color"),
        "normal": texture_image(f"{key}-normal", normal_pixels, "Non-Color"),
    }


def create_baked_texture_library():
    ACTIVE_TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    for spec in MATERIAL_LIBRARY:
        if spec["family"] == "flake":
            TEXTURE_MAPS[spec["slug"]] = bake_material_maps(spec["slug"], linear(spec["hex"]), spec["roughness"], True)
    TEXTURE_MAPS["limestone-floor"] = bake_material_maps("limestone-floor", linear("#AAA18F"), .38, False)


def material(name, color, roughness=.45, metallic=.0, flake=False, texture_key=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if texture_key:
        maps = TEXTURE_MAPS[texture_key]
        nodes, links = m.node_tree.nodes, m.node_tree.links
        base = nodes.new("ShaderNodeTexImage"); base.name = "LP baked baseColor"; base.image = maps["baseColor"]
        rough = nodes.new("ShaderNodeTexImage"); rough.name = "LP baked roughness"; rough.image = maps["roughness"]; rough.image.colorspace_settings.name = "Non-Color"
        normal = nodes.new("ShaderNodeTexImage"); normal.name = "LP baked normal"; normal.image = maps["normal"]; normal.image.colorspace_settings.name = "Non-Color"
        normal_node = nodes.new("ShaderNodeNormalMap"); normal_node.name = "LP normal decode"
        links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
        links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
        links.new(normal.outputs["Color"], normal_node.inputs["Color"])
        links.new(normal_node.outputs["Normal"], bsdf.inputs["Normal"])
        m["lp_texture_maps"] = json.dumps({role: image.name for role, image in maps.items()})
        m["lp_web_pbr"] = True
    return m


def cube(name, loc, scale, mat, target, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("Micro edge", "BEVEL")
        mod.width, mod.segments = bevel, 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.data.materials.append(mat)
    link(obj, target)
    return obj


def cylinder(name, loc, radius, depth, mat, target, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    link(obj, target)
    bevel = obj.modifiers.new("Soft arris", "BEVEL")
    bevel.width, bevel.segments = .025, 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return obj


def arch(name, y, target, plaster, inset):
    # Rectilinear portal and a shallow curved soffit read contemporary, not Romanesque.
    for x in (-3.65, 3.65):
        cube(name + "_jamb", (x, y, 2.2), (.28, .18, 2.2), plaster, target, .04)
    cube(name + "_lintel", (0, y, 4.15), (3.93, .18, .28), plaster, target, .04)
    # Shadow reveals sit alongside the clear opening; never seal it with a dark plane.
    for x in (-3.28, 3.28):
        cube(name + "_shadow_reveal", (x, y + .20, 2.1), (.04, .06, 1.92), inset, target, .01)
    cube(name + "_shadow_reveal_head", (0, y + .20, 3.92), (3.22, .06, .04), inset, target, .01)


def create_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    TEXTURE_MAPS.clear()
    create_baked_texture_library()

    scene = bpy.context.scene
    scene["asset_title"] = "Luminous Passage"
    scene["authoring_units"] = "metres"
    scene["web_delivery"] = "split_glb_lod_ready"
    scene["blender_version_pin"] = BLENDER_VERSION_PIN
    # Blender 5.2 labels the Eevee Next renderer as BLENDER_EEVEE.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1600, 900
    scene.render.resolution_percentage = 100
    # Animation keys are authored in seconds * this exact frame rate. glTF uses
    # the scene rate when translating frames into seconds, so this is contract data.
    scene.render.fps = CAMERA_HANDOFF["fps"]
    scene.render.fps_base = 1.0
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 88
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 1.65
    scene.world.color = (.035, .04, .045)
    world_nodes = scene.world.node_tree
    world_nodes.nodes["Background"].inputs["Color"].default_value = (.065, .08, .09, 1)
    world_nodes.nodes["Background"].inputs["Strength"].default_value = .75

    entry, gallery, court, alcove, swatches, camera_collection = (collection(n) for n in ("LP_ENTRY", "LP_GALLERY", "LP_COURT", "LP_ALCOVE", "LP_SWATCHES", "LP_CAMERA"))
    plaster = material("Plaster · mineral white", linear("#DAD5CA"), .63)
    stone = material("Floor · honed limestone", linear("#AAA18F"), .38, texture_key="limestone-floor")
    walnut = material("Millwork · smoked oak", linear("#372A20"), .32)
    brass = material("Detail · aged nickel", linear("#716D61"), .25, .85)
    ink = material("Reveal · charcoal", linear("#171A1A"), .3)
    glass = material("Glazing · quiet reflection", linear("#4A6C76"), .12, .05)

    # Continuous 42 m envelope: same floor datum keeps each threshold spatially honest.
    for zone in SCENE_ZONES:
        target = entry if zone["end_m"] <= 16 else gallery if zone["end_m"] <= 33 else court
        mid = (zone["start_m"] + zone["end_m"]) / 2
        length = (zone["end_m"] - zone["start_m"]) / 2
        cube("Floor_" + zone["slug"], (0, mid, -.10), (4.9, length, .10), stone, target, .025)
        cube("Ceiling_" + zone["slug"], (0, mid, 4.55), (4.9, length, .12), plaster, target)
        for x in (-4.85, 4.85):
            cube("Wall_" + zone["slug"], (x, mid, 2.2), (.16, length, 2.3), plaster, target)

    # Portico: tall glazing introduces decisive daylight, with a fine shadow grid.
    for x in (-3.65, -1.22, 1.22, 3.65):
        cube("Portico_mullion", (x, .18, 2.25), (.055, .045, 2.2), brass, entry)
    cube("Portico_glass", (0, .12, 2.25), (4.5, .025, 2.15), glass, entry)
    for y in (2.4, 5.6, 7.9, 10.9, 15.9, 20.2, 24.9, 28.5, 32.8, 36.1):
        target = entry if y < 16 else gallery if y < 33 else court
        arch("Portal", y, target, plaster, ink)

    # Material moments: mounted, inset floor panels. No faux samples; each makes a material decision visible.
    showcase = [MATERIAL_LIBRARY[i] for i in (0, 5, 8, 14, 17, 20, 24, 27)]
    for i, spec in enumerate(showcase):
        y = 11.0 + i * 2.65
        side = -1 if i % 2 else 1
        m = material("Finish · " + spec["slug"], linear(spec["hex"]), spec["roughness"], spec["metallic"], texture_key=spec["slug"] if spec["family"] == "flake" else None)
        target = entry if y < 16 else gallery if y < 33 else court
        cube("Inset_" + spec["slug"], (side * 4.64, y, 1.65), (.035, .72, 1.08), m, target, .025)
        cube("Labelrail_" + spec["slug"], (side * 4.58, y, .46), (.045, .9, .018), brass, target)

    # A quiet consultation court instead of a showroom: a monolithic desk and reflected daylight.
    cube("Consultation_table", (0, 38.3, 1.04), (2.2, 1.25, .12), walnut, court, .08)
    for x in (-1.8, 1.8):
        cube("Consultation_plinth", (x, 38.3, .48), (.14, .85, .48), walnut, court, .04)
    cube("Court_light_slot", (0, 41.7, 3.0), (2.8, .06, 1.1), glass, court)

    # Separate Finish Alcove motif. It is deliberately abstracted as architectural ribs, never a classical temple.
    cube("Alcove_floor", (0, 0, -.1), (3.8, 3.5, .1), stone, alcove)
    cube("Alcove_back", (0, 3.45, 2.2), (3.8, .14, 2.3), plaster, alcove)
    for x in (-2.8, -1.4, 1.4, 2.8):
        cylinder("Finish_rib", (x, 1.1, 2.15), .16, 4.3, plaster, alcove, 12)
        cylinder("Finish_rib_base", (x, 1.1, .14), .31, .12, brass, alcove, 16)
    cube("Alcove_shelf", (0, 2.82, 1.25), (2.3, .27, .055), brass, alcove, .025)
    cube("Alcove_slab", (0, 2.9, .71), (1.45, .04, .44), material("Alcove · quiet mineral", linear("#6B8B8D"), .34, 0, True), alcove, .03)

    # A standalone palette slab: useful as a lightweight configurator preload.
    for index, spec in enumerate(MATERIAL_LIBRARY):
        x = (index % 6) * .72
        y = -(index // 6) * .72
        texture_key = spec["slug"] if spec["family"] == "flake" else None
        swatch_mat = material("Palette · " + spec["slug"], linear(spec["hex"]), spec["roughness"], spec["metallic"], texture_key=texture_key)
        cube("Swatch_" + spec["slug"], (x, y, 0), (.31, .31, .035), swatch_mat, swatches, .018)

    # The camera curve doubles as a deterministically named hand-off to Three.js.
    curve_data = bpy.data.curves.new("LP_Camera_Route", "CURVE")
    curve_data.dimensions = "3D"
    spline = curve_data.splines.new("NURBS")
    spline.points.add(len(CAMERA_ROUTE) - 1)
    for point, co in zip(spline.points, CAMERA_ROUTE): point.co = (*co, 1.0)
    spline.order_u, spline.use_endpoint_u = 3, True
    route = bpy.data.objects.new("LP_Camera_Route", curve_data)
    camera_collection.objects.link(route)
    route["cameraHeightM"] = 1.65
    route["zones"] = json.dumps([z["slug"] for z in SCENE_ZONES])

    bpy.ops.object.camera_add(location=(0, 4.0, 1.65))
    camera = bpy.context.object
    camera.name = "LP_Experience_Camera"
    camera.data.angle = math.radians(CAMERA_HANDOFF["horizontalFovDegrees"])
    camera.rotation_mode = "QUATERNION"
    link(camera, camera_collection)
    # A real glTF camera animation, sampled at the exact JSON handoff markers.
    # The target remains in the manifest so Three.js can reproduce the camera even
    # when its GLTFLoader animation system is intentionally not initialized.
    for marker in CAMERA_HANDOFF["keyframes"]:
        frame = int(round(marker["time"] * CAMERA_HANDOFF["fps"]))
        position = marker["position"]
        target = marker["target"]
        camera.location = position
        camera.rotation_quaternion = (Vector(target) - Vector(position)).to_track_quat("-Z", "Y")
        camera.keyframe_insert(data_path="location", frame=frame)
        camera.keyframe_insert(data_path="rotation_quaternion", frame=frame)
    scene.frame_start, scene.frame_end = 0, int(CAMERA_HANDOFF["durationSeconds"] * CAMERA_HANDOFF["fps"])
    scene.frame_set(0)
    scene.camera = camera

    bpy.ops.object.light_add(type="AREA", location=(0, 1.2, 4.1))
    sun = bpy.context.object; sun.name = "Daylight · entry"; sun.data.energy = 1200; sun.data.shape = "RECTANGLE"; sun.data.size = 7; sun.data.color = (1.0, .88, .68)
    sun.rotation_euler = (math.radians(55), 0, math.radians(15))
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 8))
    key = bpy.context.object; key.name = "Sun · modeled daylight"; key.data.energy = 2.1; key.data.angle = math.radians(12)
    key.rotation_euler = (math.radians(28), math.radians(-18), math.radians(25))
    bpy.ops.object.light_add(type="AREA", location=(0, 25.0, 4.2))
    fill = bpy.context.object; fill.name = "Sky fill"; fill.data.energy = 740; fill.data.shape = "RECTANGLE"; fill.data.size = 5; fill.data.color = (.58, .76, 1.0)
    fill.rotation_euler = (0, math.radians(180), 0)
    for y in (8.0, 16.0, 25.0, 34.0):
        bpy.ops.object.light_add(type="AREA", location=(0, y, 4.28))
        wash = bpy.context.object
        wash.name = "Ceiling wash"
        wash.data.energy, wash.data.shape, wash.data.size = 520, "RECTANGLE", 3.2
        wash.data.color = (1.0, .87, .69)

    # A poster camera is intentionally separate from the animated delivery camera.
    # That keeps a coherent marketing render without contaminating the camera GLB.
    bpy.ops.object.camera_add(location=(0, 4.0, 1.65))
    poster_camera = bpy.context.object
    poster_camera.name = "LP_Poster_Camera"
    poster_camera.data.lens = 27
    poster_camera.rotation_euler = (Vector((0, 23.5, 1.75)) - poster_camera.location).to_track_quat("-Z", "Y").to_euler()
    scene["poster_camera"] = poster_camera.name

    # Dedicated material frame: visual proof that the flake and metallic catalog
    # remains legible under a neutral, web-friendly lighting setup.
    bpy.ops.object.camera_add(location=(1.8, -1.5, 6.6))
    study_camera = bpy.context.object
    study_camera.name = "LP_Material_Study_Camera"
    study_camera.data.angle = math.radians(42)
    study_camera.rotation_euler = (Vector((1.8, -1.45, 0)) - study_camera.location).to_track_quat("-Z", "Y").to_euler()
    bpy.ops.object.light_add(type="AREA", location=(1.8, -1.5, 4.6))
    study_light = bpy.context.object
    study_light.name = "Material study softbox"
    study_light.data.energy, study_light.data.shape, study_light.data.size = 850, "DISK", 4.0
    study_light.rotation_euler = (math.radians(180), 0, 0)
    scene["material_study_camera"] = study_camera.name


def export_chunk(spec):
    bpy.ops.object.select_all(action="DESELECT")
    names = set(spec["collections"])
    for coll in bpy.data.collections:
        if coll.name in names:
            for obj in coll.all_objects:
                if obj.type in {"MESH", "CAMERA"}:
                    obj.select_set(True)
    out = ACTIVE_PUBLIC_DIR / (spec["slug"] + ".glb")
    bpy.context.view_layer.objects.active = next(iter(bpy.context.selected_objects), None)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True,
        export_materials="EXPORT", export_image_format="AUTO", export_apply=True,
        export_normals=True, export_tangents=False, export_yup=True,
        export_cameras="LP_CAMERA" in names, export_lights=False,
        export_animations="LP_CAMERA" in names, export_force_sampling=True)
    return out


def owned_texture_names():
    return {f"{surface}-{role.lower()}.png" for surface in TEXTURED_SURFACES for role in TEXTURE_CONTRACT["roles"]}


def owned_paths() -> list[Path]:
    public_files = [PUBLIC_DIR / f"{chunk['slug']}.glb" for chunk in EXPORT_CHUNKS]
    public_files += [PUBLIC_DIR / "luminous-passage.manifest.json", PUBLIC_DIR / OWNERSHIP_MARKER]
    return [ASSET_DIR / "luminous-passage.blend", *public_files,
            POSTER_DIR / "luminous-passage.jpg", POSTER_DIR / "luminous-passage-material-study.jpg",
            TEXTURE_DIR]


def verify_deployed_ownership() -> tuple[bool, bool]:
    """Return (owned, may_migrate_legacy_layout) without trusting filenames alone."""
    marker = PUBLIC_DIR / OWNERSHIP_MARKER
    manifest = PUBLIC_DIR / "luminous-passage.manifest.json"
    if marker.exists():
        data = json.loads(marker.read_text(encoding="utf-8"))
        if data.get("owner") != OWNERSHIP_OWNER or set(data.get("ownedPaths", [])) != {str(path.relative_to(ROOT)).replace("\\", "/") for path in owned_paths()}:
            raise RuntimeError("existing Luminous Passage ownership marker does not match this pipeline")
        return True, False
    if manifest.exists():
        legacy = json.loads(manifest.read_text(encoding="utf-8"))
        verified = legacy.get("title") == "Luminous Passage" and legacy.get("provenance", {}).get("source") == "tools/blender/build_luminous_passage.py"
        if not verified: raise RuntimeError("existing 3D output is unmarked and not a verified legacy Luminous Passage build")
        return True, True
    if any(path.exists() for path in owned_paths()):
        raise RuntimeError("refusing to replace unmarked Luminous Passage-named files")
    return False, False


def stage_marker(stage: Path) -> None:
    marker = {
        "owner": OWNERSHIP_OWNER,
        "schemaVersion": 1,
        "ownedPaths": [str(path.relative_to(ROOT)).replace("\\", "/") for path in owned_paths()],
        "legacyPaths": [f"public/3d/textures/{name}" for name in sorted(owned_texture_names())],
        "promotion": "transactional per-path replacement with rollback; not a directory-level atomic swap",
    }
    (stage / "public" / OWNERSHIP_MARKER).write_text(json.dumps(marker, indent=2) + "\n", encoding="utf-8")


def replace_owned_outputs(stage: Path) -> None:
    """Transactional per-path promotion with explicit rollback on validation failure."""
    owned, legacy_layout = verify_deployed_ownership()
    source_targets = [(stage / "assets" / "luminous-passage.blend", ASSET_DIR / "luminous-passage.blend")]
    source_targets += [(stage / "public" / f"{chunk['slug']}.glb", PUBLIC_DIR / f"{chunk['slug']}.glb") for chunk in EXPORT_CHUNKS]
    source_targets += [(stage / "public" / "luminous-passage.manifest.json", PUBLIC_DIR / "luminous-passage.manifest.json"),
                       (stage / "public" / OWNERSHIP_MARKER, PUBLIC_DIR / OWNERSHIP_MARKER),
                       (stage / "public" / "posters" / "luminous-passage.jpg", POSTER_DIR / "luminous-passage.jpg"),
                       (stage / "public" / "posters" / "luminous-passage-material-study.jpg", POSTER_DIR / "luminous-passage-material-study.jpg"),
                       (stage / "public" / "textures" / "luminous-passage", TEXTURE_DIR)]
    legacy_targets = [PUBLIC_DIR / "textures" / name for name in owned_texture_names()] if legacy_layout else []
    with tempfile.TemporaryDirectory(prefix=".luminous-passage-rollback-", dir=ASSET_DIR) as temp:
        backup = Path(temp)
        moved = []
        try:
            if owned:
                for _, target in source_targets:
                    if target.exists():
                        destination = backup / str(target.relative_to(ROOT))
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        os.replace(target, destination)
                        moved.append((destination, target))
                for legacy in legacy_targets:
                    if legacy.exists():
                        destination = backup / str(legacy.relative_to(ROOT))
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        os.replace(legacy, destination)
                        moved.append((destination, legacy))
            for source, target in source_targets:
                target.parent.mkdir(parents=True, exist_ok=True)
                os.replace(source, target)
            from validate_exports import validate_asset_root
            validate_asset_root(PUBLIC_DIR)
        except Exception:
            # Remove only the exact attempted destination paths, then restore the backup.
            for _, target in reversed(source_targets):
                if target.exists():
                    if target.is_dir(): shutil.rmtree(target)
                    else: target.unlink()
            for backup_path, target in reversed(moved):
                target.parent.mkdir(parents=True, exist_ok=True)
                os.replace(backup_path, target)
            raise


def main():
    global ACTIVE_ASSET_DIR, ACTIVE_PUBLIC_DIR, ACTIVE_POSTER_DIR, ACTIVE_TEXTURE_DIR
    if bpy.app.version[:2] != (5, 2):
        raise RuntimeError(f"Luminous Passage is pinned to Blender {BLENDER_VERSION_PIN}; found {bpy.app.version_string}")
    from validate_exports import validate_asset_root
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    with tempfile.TemporaryDirectory(prefix=".luminous-passage-build-", dir=ASSET_DIR) as temp:
        stage = Path(temp)
        ACTIVE_ASSET_DIR = stage / "assets"
        ACTIVE_PUBLIC_DIR = stage / "public"
        ACTIVE_POSTER_DIR = ACTIVE_PUBLIC_DIR / "posters"
        ACTIVE_TEXTURE_DIR = ACTIVE_PUBLIC_DIR / "textures" / "luminous-passage"
        for directory in (ACTIVE_ASSET_DIR, ACTIVE_PUBLIC_DIR, ACTIVE_POSTER_DIR, ACTIVE_TEXTURE_DIR): directory.mkdir(parents=True, exist_ok=True)
        create_scene()
        blend = ACTIVE_ASSET_DIR / "luminous-passage.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(blend))
        scene = bpy.context.scene
        scene.camera = bpy.data.objects[scene["poster_camera"]]
        primary_poster = ACTIVE_POSTER_DIR / "luminous-passage.jpg"
        material_study_poster = ACTIVE_POSTER_DIR / "luminous-passage-material-study.jpg"
        scene.render.filepath = str(primary_poster)
        bpy.ops.render.render(write_still=True)
        scene.camera = bpy.data.objects[scene["material_study_camera"]]
        scene.render.filepath = str(material_study_poster)
        bpy.ops.render.render(write_still=True)
        scene.camera = bpy.data.objects["LP_Experience_Camera"]
        output = []
        for spec in EXPORT_CHUNKS:
            path = export_chunk(spec)
            output.append({"slug": spec["slug"], "file": path.name, "bytes": path.stat().st_size, "budgetBytes": spec["budget_bytes"]})
        manifest = manifest_payload()
        manifest["provenance"]["blenderBuiltWith"] = bpy.app.version_string
        manifest["exports"] = output
        manifest["bakedTextures"] = [
            {"material": key, "maps": {role: f"textures/luminous-passage/{image.name}.png" for role, image in maps.items()}}
            for key, maps in TEXTURE_MAPS.items()
        ]
        manifest["textureBindings"] = [
            {"output": TEXTURE_CONTRACT["flakeLibraryOutput"], "material": f"Palette · {spec['slug']}", "surface": spec["slug"],
             "maps": {role: f"textures/luminous-passage/{image.name}.png" for role, image in TEXTURE_MAPS[spec["slug"]].items()}}
            for spec in MATERIAL_LIBRARY if spec["family"] == "flake"
        ] + [
            {"output": f"{slug}.glb", "material": "Floor · honed limestone", "surface": "limestone-floor",
             "maps": {role: f"textures/luminous-passage/{image.name}.png" for role, image in TEXTURE_MAPS["limestone-floor"].items()}}
            for output in TEXTURE_CONTRACT["limestoneBoundOutputs"] for slug in [Path(output).stem]
        ]
        (ACTIVE_PUBLIC_DIR / "luminous-passage.manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        stage_marker(stage)
        validate_asset_root(ACTIVE_PUBLIC_DIR)
        replace_owned_outputs(stage)
    validate_asset_root(PUBLIC_DIR)
    print(json.dumps({
        "blend": str(ASSET_DIR / "luminous-passage.blend"),
        "primaryPoster": str(POSTER_DIR / "luminous-passage.jpg"),
        "materialStudyPoster": str(POSTER_DIR / "luminous-passage-material-study.jpg"),
        "exports": manifest["exports"],
    }, indent=2))


if __name__ == "__main__":
    main()

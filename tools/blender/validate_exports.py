"""Deep, optimization-safe validation for committed Luminous Passage GLBs."""
from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

TOOL_DIR = Path(__file__).resolve().parent
if str(TOOL_DIR) not in sys.path: sys.path.insert(0, str(TOOL_DIR))
from scene_contract import EXPORT_CHUNKS, TEXTURE_CONTRACT, TEXTURED_SURFACES, manifest_payload

ROOT = TOOL_DIR.parents[1]
PUBLIC = ROOT / "public" / "3d"
MARKER = "luminous-passage.ownership.json"
OWNER = "kr8tiv-io/luminous-passage"


class ValidationError(RuntimeError): pass


def require(condition, message):
    if not condition: raise ValidationError(message)


def glb_json(path: Path) -> dict:
    data = path.read_bytes()
    require(data[:4] == b"glTF", f"{path.name} is not a binary GLB")
    require(len(data) >= 20 and struct.unpack_from("<I", data, 4)[0] == 2, f"{path.name} is not glTF 2.0")
    json_size, chunk_type = struct.unpack_from("<I4s", data, 12)
    require(chunk_type == b"JSON", f"{path.name} has no JSON chunk")
    return json.loads(data[20:20 + json_size].decode("utf-8").rstrip(" \t\r\n\x00"))


def validate_glb_integrity(path: Path, structure: dict) -> None:
    data = path.read_bytes()
    require(len(data) >= 12, f"{path.name} header is truncated")
    require(struct.unpack_from("<I", data, 8)[0] == len(data), f"{path.name} header length mismatch")
    offset, binary, chunks = 12, b"", 0
    while offset < len(data):
        require(offset + 8 <= len(data), f"{path.name} truncated chunk header")
        length, kind = struct.unpack_from("<I4s", data, offset)
        require(offset + 8 + length <= len(data), f"{path.name} truncated chunk")
        if kind == b"BIN\x00": binary = data[offset + 8:offset + 8 + length]
        chunks += 1; offset += 8 + length
    require(offset == len(data) and chunks >= 1, f"{path.name} invalid chunks")
    buffers = structure.get("buffers", [])
    require(len(buffers) <= 1, f"{path.name} must be self-contained")
    if buffers: require("uri" not in buffers[0] and buffers[0].get("byteLength", 0) <= len(binary), f"{path.name} has external/invalid buffer")
    byte_sizes = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
    components = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
    views = structure.get("bufferViews", [])
    for view in views:
        require(view.get("buffer", 0) == 0 and view.get("byteOffset", 0) + view.get("byteLength", 0) <= len(binary), f"{path.name} invalid buffer view")
    for accessor in structure.get("accessors", []):
        if "bufferView" not in accessor: continue
        index = accessor["bufferView"]
        require(0 <= index < len(views), f"{path.name} accessor references missing buffer view")
        size = byte_sizes.get(accessor.get("componentType"), 0) * components.get(accessor.get("type"), 0)
        view = views[index]; stride = view.get("byteStride", size)
        used = accessor.get("byteOffset", 0) + max(accessor.get("count", 0) - 1, 0) * stride + size
        require(size and used <= view.get("byteLength", 0), f"{path.name} accessor exceeds buffer view")
    images, textures = structure.get("images", []), structure.get("textures", [])
    for image in images:
        view_index = image.get("bufferView", -1)
        require("uri" not in image and image.get("mimeType") == "image/png" and 0 <= view_index < len(views), f"{path.name} has external/non-PNG image")
        view = views[view_index]; start = view.get("byteOffset", 0); end = start + view.get("byteLength", 0)
        require(binary[start:end].startswith(b"\x89PNG\r\n\x1a\n"), f"{path.name} embedded image is not PNG data")
    for texture in textures: require(0 <= texture.get("source", -1) < len(images), f"{path.name} texture has invalid image source")
    for material in structure.get("materials", []):
        pbr = material.get("pbrMetallicRoughness", {})
        for slot in (pbr.get("baseColorTexture"), pbr.get("metallicRoughnessTexture"), material.get("normalTexture"), material.get("occlusionTexture"), material.get("emissiveTexture")):
            if slot: require(0 <= slot.get("index", -1) < len(textures), f"{path.name} material references missing texture")


def expected_binding_keys() -> set[tuple[str, str, str]]:
    return {(TEXTURE_CONTRACT["flakeLibraryOutput"], f"Palette · {surface}", surface) for surface in TEXTURED_SURFACES[:-1]} | {(output, "Floor · honed limestone", "limestone-floor") for output in TEXTURE_CONTRACT["limestoneBoundOutputs"]}


def validate_texture_binding_declarations(bindings: list[dict], baked: dict) -> None:
    roles = set(TEXTURE_CONTRACT["roles"])
    keys = {(item.get("output"), item.get("material"), item.get("surface")) for item in bindings}
    require(keys == expected_binding_keys() and len(keys) == len(bindings), "missing, unexpected, or duplicate material/map-role binding")
    for binding in bindings:
        require(binding["surface"] in baked and set(binding.get("maps", {})) == roles and binding["maps"] == baked[binding["surface"]], "binding does not match canonical PBR map roles")


def validate_asset_root(public: Path = PUBLIC) -> None:
    manifest = json.loads((public / "luminous-passage.manifest.json").read_text(encoding="utf-8"))
    expected = manifest_payload(); marker = json.loads((public / MARKER).read_text(encoding="utf-8"))
    require(marker.get("owner") == OWNER and marker.get("promotion", "").startswith("transactional"), "missing/invalid ownership marker")
    expected_owned = {"assets/3d/luminous-passage.blend", *{f"public/3d/{chunk['slug']}.glb" for chunk in EXPORT_CHUNKS},
                      "public/3d/luminous-passage.manifest.json", "public/3d/luminous-passage.ownership.json",
                      "public/3d/posters/luminous-passage.jpg", "public/3d/posters/luminous-passage-material-study.jpg",
                      "public/3d/textures/luminous-passage"}
    require(set(marker.get("ownedPaths", [])) == expected_owned, "ownership marker allowlist mismatch")
    provenance = manifest.get("provenance", {})
    require(provenance.get("blenderVersionPin") == "5.2.x" and provenance.get("blenderBuiltWith", "").startswith("5.2."), "invalid Blender provenance")
    require(provenance.get("author") and provenance.get("license"), "missing author/license provenance")
    require(manifest.get("materialCount") == 30 and manifest.get("zones") == expected["zones"], "scene contract mismatch")
    require(manifest.get("cameraRoute") == [list(point) for point in expected["cameraRoute"]] and manifest.get("cameraHandoff") == expected["cameraHandoff"], "camera contract mismatch")
    slugs = [chunk["slug"] for chunk in EXPORT_CHUNKS]; exports = manifest.get("exports", [])
    require([item.get("slug") for item in exports] == slugs and {item.get("file") for item in exports} == {f"{slug}.glb" for slug in slugs}, "manifest export set mismatch")
    expected_root = {f"{slug}.glb" for slug in slugs} | {"luminous-passage.manifest.json", MARKER}
    require({path.name for path in public.glob("*") if path.is_file()} == expected_root, "stale or missing top-level output")
    baked = {entry.get("material"): entry.get("maps") for entry in manifest.get("bakedTextures", [])}; roles = set(TEXTURE_CONTRACT["roles"])
    require(set(baked) == set(TEXTURED_SURFACES), "baked surface contract mismatch")
    expected_textures = set()
    for surface in TEXTURED_SURFACES:
        require(set(baked[surface]) == roles, f"{surface} PBR role set mismatch")
        for rel in baked[surface].values(): require((public / rel).is_file(), f"missing texture {rel}"); expected_textures.add(rel)
    texture_root = public / "textures"
    require({path.name for path in texture_root.iterdir()} == {"luminous-passage"}, "stale texture directory output")
    actual_textures = {path.relative_to(public).as_posix() for path in (texture_root / "luminous-passage").glob("*.png")}
    require(actual_textures == expected_textures, "stale or missing external texture source")
    require({path.name for path in (public / "posters").iterdir()} == {"luminous-passage.jpg", "luminous-passage-material-study.jpg"}, "stale/missing poster render")
    bindings = manifest.get("textureBindings", []); validate_texture_binding_declarations(bindings, baked)
    bindings_by_output = {}
    for binding in bindings: bindings_by_output.setdefault(binding["output"], []).append(binding)
    total = 0
    for exported, spec in zip(exports, EXPORT_CHUNKS):
        path = public / exported["file"]; structure = glb_json(path); validate_glb_integrity(path, structure)
        for binding in bindings_by_output.get(exported["file"], []):
            material = next((item for item in structure.get("materials", []) if item.get("name") == binding["material"]), None)
            require(material is not None, f"{path.name} missing bound material {binding['material']}")
            pbr = material.get("pbrMetallicRoughness", {}); slots = {"baseColor": pbr.get("baseColorTexture"), "roughness": pbr.get("metallicRoughnessTexture"), "normal": material.get("normalTexture")}
            for role, source in binding["maps"].items():
                require(slots.get(role) is not None, f"{path.name} missing {role} slot")
                image = structure["images"][structure["textures"][slots[role]["index"]]["source"]]
                require(Path(image.get("name", "")).stem == Path(source).stem, f"{path.name} {binding['material']} {role} map differs from manifest")
        require(path.stat().st_size == exported["bytes"] and exported["bytes"] <= spec["budget_bytes"], f"{path.name} size/budget mismatch")
        total += exported["bytes"]
        if exported["slug"] == "luminous-passage-camera":
            camera = structure.get("cameras", [{}])[0]; animation = structure.get("animations", [{}])[0]
            require(camera.get("type") == "perspective" and len(animation.get("channels", [])) >= 2, "camera GLB missing animation")
            duration = max(structure["accessors"][sampler["input"]]["max"][0] for sampler in animation["samplers"])
            require(abs(duration - manifest["cameraHandoff"]["durationSeconds"]) < .02 and abs(math.degrees(camera["perspective"]["yfov"]) - manifest["cameraHandoff"]["verticalFovDegrees"]) < .02, "camera handoff mismatch")
    require(total <= expected["budgets"]["totalBytes"], "total GLB budget exceeded")
    print(f"Validated {len(EXPORT_CHUNKS)} GLBs, 15 raster PBR sets, and camera animation: {total:,} bytes total; first chunk {exports[0]['bytes']:,} bytes.")


if __name__ == "__main__": validate_asset_root(PUBLIC)

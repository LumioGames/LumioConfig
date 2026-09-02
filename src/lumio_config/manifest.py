from __future__ import annotations

from typing import Any


LAYER_ORDER = ("engine", "platform", "server", "product", "environment")
TARGET_DIRS = {"S": "server", "C": "client", "V": "voxel"}


def chunk_descriptor(path: str, package_fingerprint: str, chunk_id: int = 0) -> dict[str, Any]:
    return {
        "id": chunk_id,
        "path": path,
        "packageFingerprint": package_fingerprint,
    }


def table_descriptor(
    table: str,
    content_fingerprint: str,
    source_fingerprint: str,
    path: str,
    package_fingerprint: str,
) -> dict[str, Any]:
    chunk = chunk_descriptor(path, package_fingerprint)
    return {
        "table": table,
        "contentFingerprint": content_fingerprint,
        "sourceFingerprint": source_fingerprint,
        "packageFingerprint": package_fingerprint,
        "path": path,
        "chunks": [chunk],
    }


def build_target_manifest(target: str, tables: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "target": target,
        "tables": tables,
    }


def build_release_manifest(
    baseline_id: str,
    targets: list[str],
    tables: list[dict[str, Any]],
    content_fingerprint: str,
    package_fingerprint: str,
    source_fingerprint: str,
    compiler_hash: str,
    input_hash: str,
    output_hash: str,
) -> dict[str, Any]:
    return {
        "formatVersion": 1,
        "baselineId": baseline_id,
        "targets": targets,
        "compilerHash": compiler_hash,
        "inputHash": input_hash,
        "outputHash": output_hash,
        "contentFingerprint": content_fingerprint,
        "packageFingerprint": package_fingerprint,
        "sourceFingerprint": source_fingerprint,
        "origins": "origins.json",
        "targetManifests": {target: f"{TARGET_DIRS[target]}/manifest.json" for target in targets},
        "tables": tables,
    }

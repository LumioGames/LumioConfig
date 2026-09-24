from __future__ import annotations

from typing import Any


LAYER_ORDER = ("engine", "platform", "server", "product", "environment")
TARGET_DIRS = {"S": "server", "C": "client", "V": "voxel"}
SPLIT_SPEC_VERSION = "split-export/1"
# split-export/1: the endpoint→projection map is a constant, not a command-line option.
END_TARGETS: dict[str, tuple[str, ...]] = {"client": ("C",), "server": ("S", "V")}
# split-export/1 row files do not name a table's id column, so verify-split reads each
# shared prediction pair's id under this key. validate/export hold every table that
# declares a sharedPrediction column to it (SHARED_PREDICTION_ID_NOT_SHARED).
SHARED_PREDICTION_ID_COLUMN = "id"


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


def build_end_manifest(
    endpoint: str,
    baseline_id: str,
    targets: list[str],
    tables: list[dict[str, Any]],
    content_fingerprint: str,
    package_fingerprint: str,
    source_fingerprint: str,
    release_fingerprint: str,
    compiler_hash: str,
    input_hash: str,
    output_hash: str,
    shared_prediction: dict[str, Any],
    origins: str | None,
) -> dict[str, Any]:
    target_manifests = {target: f"{TARGET_DIRS[target]}/manifest.json" for target in targets}
    manifest: dict[str, Any] = {
        "formatVersion": 1,
        "specVersion": SPLIT_SPEC_VERSION,
        "endpoint": endpoint,
        "baselineId": baseline_id,
        "revisionId": content_fingerprint,
        "targets": targets,
        "compilerHash": compiler_hash,
        "inputHash": input_hash,
        "outputHash": output_hash,
        "contentFingerprint": content_fingerprint,
        "packageFingerprint": package_fingerprint,
        "sourceFingerprint": source_fingerprint,
        "releaseFingerprint": release_fingerprint,
        "publicRoot": package_fingerprint,
        "targetManifests": target_manifests,
        "projectionRoots": dict(target_manifests),
        "sharedPrediction": shared_prediction,
        "tables": tables,
    }
    if origins is not None:
        manifest["origins"] = origins
    return manifest


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
    target_manifests = {target: f"{TARGET_DIRS[target]}/manifest.json" for target in targets}
    return {
        "formatVersion": 1,
        "baselineId": baseline_id,
        "revisionId": content_fingerprint,
        "targets": targets,
        "compilerHash": compiler_hash,
        "inputHash": input_hash,
        "outputHash": output_hash,
        "contentFingerprint": content_fingerprint,
        "packageFingerprint": package_fingerprint,
        "sourceFingerprint": source_fingerprint,
        "publicRoot": package_fingerprint,
        "origins": "origins.json",
        "targetManifests": target_manifests,
        "projectionRoots": dict(target_manifests),
        "tables": tables,
    }

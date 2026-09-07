"""Deterministic typed-reader code generation (M8)."""

from .csharp import (
    CSHARP_NAMESPACE_DEFAULT,
    generate_csharp_readers,
    schema_fingerprint,
    write_csharp_readers,
)

__all__ = [
    "CSHARP_NAMESPACE_DEFAULT",
    "generate_csharp_readers",
    "schema_fingerprint",
    "write_csharp_readers",
]

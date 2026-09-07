from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from ..fingerprint import canonical_json, ordered_schema_columns
from ..manifest import TARGET_DIRS
from ..validate import TARGETS

CSHARP_NAMESPACE_DEFAULT = "Lumio.Config.Generated"
TARGET_NAMESPACE_SUFFIX = {"S": "Server", "C": "Client", "V": "Voxel"}

SCHEMA_TYPES = {
    "bool": ("bool", "bool?"),
    "i32": ("int", "int?"),
    "i64": ("long", "long?"),
    "u32": ("uint", "uint?"),
    "u64": ("ulong", "ulong?"),
    "f32": ("float", "float?"),
    "f64": ("double", "double?"),
    "string": ("string", "string?"),
    "enum": ("string", "string?"),
    "ref": ("uint", "uint?"),
}

_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_CSHARP_KEYWORDS = {
    "abstract",
    "as",
    "base",
    "bool",
    "break",
    "byte",
    "case",
    "catch",
    "char",
    "checked",
    "class",
    "const",
    "continue",
    "decimal",
    "default",
    "delegate",
    "do",
    "double",
    "else",
    "enum",
    "event",
    "explicit",
    "extern",
    "false",
    "finally",
    "fixed",
    "float",
    "for",
    "foreach",
    "goto",
    "if",
    "implicit",
    "in",
    "int",
    "interface",
    "internal",
    "is",
    "lock",
    "long",
    "namespace",
    "new",
    "null",
    "object",
    "operator",
    "out",
    "override",
    "params",
    "private",
    "protected",
    "public",
    "readonly",
    "ref",
    "return",
    "sbyte",
    "sealed",
    "short",
    "sizeof",
    "stackalloc",
    "static",
    "string",
    "struct",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "uint",
    "ulong",
    "unchecked",
    "unsafe",
    "ushort",
    "using",
    "virtual",
    "void",
    "volatile",
    "while",
}


class CodegenError(ValueError):
    """Raised when a schema cannot be projected into a typed C# reader."""


def schema_fingerprint(schema: dict[str, Any], target: str | None = None) -> str:
    columns = []
    for column in ordered_schema_columns(schema):
        visibility = str(column.get("visibility", "S"))
        if target is not None and target not in visibility:
            continue
        entry: dict[str, Any] = {
            "name": column.get("name"),
            "ordinal": column.get("ordinal"),
            "required": bool(column.get("required")),
            "type": column.get("type"),
            "visibility": visibility,
        }
        if column.get("type") == "enum":
            entry["enumValues"] = list(column.get("enumValues") or [])
        if column.get("type") == "ref":
            entry["refTarget"] = column.get("refTarget")
        columns.append(entry)
    payload = {
        "columns": columns,
        "idColumn": schema.get("idColumn", "id"),
        "table": schema.get("table"),
        "target": target,
    }
    return hashlib.sha256(canonical_json(payload)).hexdigest()


def pascal_case(name: str) -> str:
    parts = [part for part in re.split(r"[^A-Za-z0-9]+", name) if part]
    if not parts:
        raise CodegenError(f"cannot form a C# identifier from {name!r}")
    token = "".join(part[:1].upper() + part[1:] for part in parts)
    if token[0].isdigit():
        token = "_" + token
    if token in _CSHARP_KEYWORDS:
        token = "@" + token
    if not _IDENTIFIER.match(token.lstrip("@")):
        raise CodegenError(f"cannot form a C# identifier from {name!r}")
    return token


def csharp_type(column: dict[str, Any]) -> str:
    kind = column.get("type")
    mapping = SCHEMA_TYPES.get(str(kind) if kind is not None else "")
    if mapping is None:
        raise CodegenError(f"unsupported schema type {kind!r}")
    required, optional = mapping
    return required if column.get("required") else optional


def _visible_columns(schema: dict[str, Any], target: str) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for column in ordered_schema_columns(schema):
        visibility = str(column.get("visibility", "S"))
        if target in visibility:
            result.append(column)
    return result


def _param_name(property_name: str) -> str:
    token = property_name.lstrip("@")
    if not token:
        raise CodegenError("empty C# identifier")
    camel = token[:1].lower() + token[1:]
    if camel in _CSHARP_KEYWORDS:
        return "@" + camel
    return camel


def _id_csharp_type(schema: dict[str, Any], columns: list[dict[str, Any]]) -> str:
    id_column = str(schema.get("idColumn", "id"))
    for column in columns:
        if str(column.get("name")) == id_column:
            return csharp_type(column)
    raise CodegenError(f"id column {id_column} is not visible on this target")


def render_table_source(
    schema: dict[str, Any],
    target: str,
    namespace_root: str = CSHARP_NAMESPACE_DEFAULT,
) -> str:
    table_name = str(schema.get("table") or "")
    if not table_name:
        raise CodegenError("schema is missing table name")
    type_prefix = pascal_case(table_name)
    row_type = f"{type_prefix}Row"
    table_type = f"{type_prefix}Table"
    columns = _visible_columns(schema, target)
    if not columns:
        raise CodegenError(f"table {table_name} has no columns visible to target {target}")
    id_column = str(schema.get("idColumn", "id"))
    id_type = _id_csharp_type(schema, columns)
    namespace = f"{namespace_root}.{TARGET_NAMESPACE_SUFFIX[target]}"
    fingerprint = schema_fingerprint(schema, target)

    fields: list[tuple[str, str, str, bool]] = []
    for column in columns:
        name = str(column.get("name"))
        property_name = "Id" if name == id_column else pascal_case(name)
        fields.append((name, property_name, csharp_type(column), name == id_column))

    seen: set[str] = set()
    for _raw, property_name, _ctype, _is_id in fields:
        key = property_name.lstrip("@")
        if key in seen:
            raise CodegenError(f"duplicate C# property {property_name} on {table_name}")
        seen.add(key)

    ctor_params = ",\n        ".join(
        f"{ctype} {_param_name(property_name)}" for _raw, property_name, ctype, _is_id in fields
    )
    ctor_assigns = "\n        ".join(
        f"{property_name} = {_param_name(property_name)};" for _raw, property_name, _ctype, _is_id in fields
    )
    properties = "\n    ".join(
        f"public {ctype} {property_name} {{ get; }}" for _raw, property_name, ctype, _is_id in fields
    )

    body = f"""// <auto-generated>
// 生成物不得手改。由 LumioConfig `export --csharp-out` 重建。
// table: {table_name}
// target: {target}
// schemaFingerprint: {fingerprint}
// </auto-generated>

#nullable enable

using System;
using System.Collections.Generic;

namespace {namespace};

public readonly struct {row_type}
{{
    public {row_type}(
        {ctor_params})
    {{
        {ctor_assigns}
    }}

    {properties}
}}

public readonly struct {table_type}
{{
    private readonly {row_type}[] _rows;
    private readonly Dictionary<{id_type}, int> _index;

    public {table_type}(IReadOnlyList<{row_type}> rows)
    {{
        if (rows is null)
        {{
            throw new ArgumentNullException(nameof(rows));
        }}

        var copy = new {row_type}[rows.Count];
        for (var i = 0; i < rows.Count; i++)
        {{
            copy[i] = rows[i];
        }}

        Array.Sort(copy, static (left, right) => left.Id.CompareTo(right.Id));
        var index = new Dictionary<{id_type}, int>(copy.Length);
        for (var i = 0; i < copy.Length; i++)
        {{
            var id = copy[i].Id;
            if (!index.TryAdd(id, i))
            {{
                throw new ArgumentException($"duplicate id {{id}}", nameof(rows));
            }}
        }}

        _rows = copy;
        _index = index;
    }}

    public int Count => _rows.Length;

    public IReadOnlyList<{row_type}> Rows => _rows;

    public bool TryGet({id_type} id, out {row_type} row)
    {{
        if (_index.TryGetValue(id, out var offset))
        {{
            row = _rows[offset];
            return true;
        }}

        row = default;
        return false;
    }}
}}
"""
    return body.replace("\r\n", "\n")


def generate_csharp_readers(
    schemas: dict[str, dict[str, Any]],
    namespace_root: str = CSHARP_NAMESPACE_DEFAULT,
) -> dict[str, str]:
    files: dict[str, str] = {}
    for table_name in sorted(schemas):
        schema = schemas[table_name]
        type_prefix = pascal_case(str(schema.get("table") or table_name))
        for target in TARGETS:
            if not _visible_columns(schema, target):
                continue
            relative = f"{TARGET_DIRS[target]}/{type_prefix}Table.cs"
            files[relative] = render_table_source(schema, target, namespace_root)
    return files


def write_csharp_readers(
    output: Path,
    schemas: dict[str, dict[str, Any]],
    namespace_root: str = CSHARP_NAMESPACE_DEFAULT,
) -> list[Path]:
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    files = generate_csharp_readers(schemas, namespace_root)
    written: list[Path] = []
    expected: set[Path] = set()
    for relative, text in files.items():
        path = output / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = text.encode("utf-8")
        if not payload.endswith(b"\n"):
            payload += b"\n"
        path.write_bytes(payload)
        written.append(path)
        expected.add(path.resolve())
    for target_dir in TARGET_DIRS.values():
        folder = output / target_dir
        if not folder.is_dir():
            continue
        for path in folder.glob("*.cs"):
            if path.resolve() not in expected:
                path.unlink()
    return written

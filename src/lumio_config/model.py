from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from .unicode_policy import normalize_string


CELL_STATES = frozenset({"value", "missing", "empty", "null", "default"})


@dataclass(frozen=True)
class Cell:
    state: str
    value: str | None = None

    def __post_init__(self) -> None:
        if self.state not in CELL_STATES:
            raise ValueError(f"unknown cell state: {self.state}")
        if self.state in {"missing", "null", "default"} and self.value is not None:
            raise ValueError(f"{self.state} cells cannot carry a value")
        if self.state in {"value", "empty"} and self.value is None:
            raise ValueError(f"{self.state} cells require a value")

    @classmethod
    def from_token(cls, token: str) -> "Cell":
        if token == "@missing":
            return cls("missing")
        if token == '""':
            return cls("empty", "")
        if token.lower() == "null":
            return cls("null")
        if token == "@default":
            return cls("default")
        return cls("value", normalize_string(token))

    def token(self) -> str:
        if self.state == "missing":
            return "@missing"
        if self.state == "empty":
            return '""'
        if self.state == "null":
            return "null"
        if self.state == "default":
            return "@default"
        assert self.value is not None
        return self.value

    def canonical(self, effective_value: Any = None) -> Mapping[str, Any]:
        if self.state == "value":
            return {"state": "value", "value": effective_value}
        if self.state == "empty":
            return {"state": "empty", "value": ""}
        if self.state == "null":
            return {"state": "null"}
        if self.state == "default":
            return {"state": "default", "value": effective_value}
        return {"state": "missing"}


@dataclass
class TableSource:
    name: str
    schema_ref: str
    columns: tuple[str, ...]
    rows: list[dict[str, Cell]]
    path: Path


@dataclass(frozen=True)
class ValidationError:
    table: str
    row: str
    column: str
    code: str
    message: str
    suggestion: str

    def as_dict(self) -> dict[str, str]:
        return {
            "table": self.table,
            "row": self.row,
            "column": self.column,
            "code": self.code,
            "message": self.message,
            "suggestion": self.suggestion,
        }


class TableParseError(ValueError):
    def __init__(self, code: str, message: str, line: int) -> None:
        super().__init__(message)
        self.code = code
        self.line = line

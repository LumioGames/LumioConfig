from __future__ import annotations

import unicodedata

STRING_NORMALIZATION_FORM = "NFC"


def normalize_string(value: str) -> str:
    return unicodedata.normalize(STRING_NORMALIZATION_FORM, value)

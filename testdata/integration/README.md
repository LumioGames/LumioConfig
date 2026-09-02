# Integration fixtures (R-00327)

`mixed-table/` is a self-contained mini-repository used by `tests/integration/`.
It is not part of the live `tables/` sample set and does not invent a public ID namespace.

Secret scan oracle: schema non-C columns/values; `mixed-table/expected.json` `clientForbidden` is the expected token set.
Durable Review inputs: `review-input.json` (tag name plus compiler/input/output hashes of a clean mixed-table export).

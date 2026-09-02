# Integration candidate (R-00327)

This repository's integration candidate is the Git tag name `integration-R-00327` plus the release-manifest hash triple.
Runtime reload / replay and consumer-repo loaders are out of this Room.

Durable Review inputs live in `testdata/integration/review-input.json` (hash triple of `testdata/integration/mixed-table/` after `format` + `export`). `tests/integration/` recreates tag `integration-R-00327` on a throwaway git repo, mutates, then `git reset --hard integration-R-00327` and re-exports. After this PR merges, the dispatcher may also tag `origin/main`.

## Identity

| Field | Meaning |
| --- | --- |
| tag | `integration-R-00327` |
| `compilerHash` | fingerprint of `src/lumio_config/*.py` |
| `inputHash` | fingerprint of `schemas/` `tables/` `registry/` `layers/` |
| `outputHash` | fingerprint of the export tree except `manifest.json` |
| `revisionId` | aggregate content fingerprint |
| `publicRoot` | package fingerprint |
| `projectionRoots` | `S` / `C` / `V` target manifest paths; never equal to `publicRoot` |

Architecture pin: `repository.yaml` `architecture.sourceCommit`. Consumer-repo commits are empty this round (`R-00325` / Runtime / Server / Client are out of Room).

## Rebuild

From a clean copy of `testdata/integration/mixed-table/`, with no developer cache:

```bash
python tools/lumio_config.py format --root testdata/integration/mixed-table
python tools/lumio_config.py export --out /tmp/mixed-out --root testdata/integration/mixed-table
```

Two independent exports of the same sources must match `compilerHash` / `inputHash` / `outputHash` in `testdata/integration/review-input.json`, including projection files.

The mixed-visibility vertical chain is driven by `tests/integration/` via subprocess CLI.

## Rollback

In the integration drill (throwaway git repo tagged `integration-R-00327`):

```bash
git reset --hard integration-R-00327
python tools/lumio_config.py export --out /tmp/mixed-out --root .
```

Fingerprints return to the tagged candidate. A later mutation that only changes table text must change `inputHash` / `outputHash` and must not change `compilerHash`.

## Review inputs

See `testdata/integration/review-input.json`: tag, Architecture `sourceCommit`, the hash triple, `revisionId`, `publicRoot`, `projectionRoots`, empty `consumerCommits`, and known gaps (reload/replay moved out with R-00326; typed readers remain R-00325).

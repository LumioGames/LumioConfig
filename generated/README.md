# Generated outputs

`python tools/lumio_config.py export --out build/export` creates the four-layer manifests (release → target → table → chunk), S/C/V projections, `origins.json`, and `compilerHash` / `inputHash` / `outputHash` used for local inspection and later distribution.

The checked-in source of truth is under `schemas/`, `tables/`, and `registry/`. Generated files are intentionally not committed in the bootstrap; when a future release publishes them, the producing command, source commit, baseline, and fingerprints must be recorded alongside the artifact. Never edit a generated file by hand.

# Validation evidence

This page is the checklist for a local run that is equivalent to the repository policy workflow. It records commands, not a substitute for their output.

```bash
node .spec/tools/spec-lint.mjs
node --test .spec/tools/spec-lint.test.mjs
python -m unittest discover -s tests -v
python tools/lumio_config.py validate
python tools/lumio_config.py format --check
python tools/lumio_config.py export --out build/export
python tools/lumio_config.py patch validate path/to/patch.json
git diff --check
```

Expected results are `spec-lint: OK`, all Node and Python tests passing, `validate: OK`, `format: OK`, a successful export for three source tables, and no whitespace errors. Remove `build/` before committing.

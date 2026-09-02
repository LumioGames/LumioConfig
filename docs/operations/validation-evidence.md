# Validation evidence

This page is the checklist for a local run that is equivalent to the repository policy workflow. It records commands, not a substitute for their output.

```bash
node <lumio-plugin-dir>/tools/spec-lint.mjs .
python -m unittest discover -s tests -v
python tools/lumio_config.py validate
python tools/lumio_config.py format --check
python tools/lumio_config.py export --out build/export
python tools/lumio_config.py patch validate path/to/patch.json
git diff --check
```

Editor evidence (R-00364):

```bash
cd editor
pnpm lint
pnpm test
pnpm build
git diff --exit-code -- src/lumio_config/editor_static
pnpm e2e
```

CI jobs `Editor lint, test, and reproducible build` and `Editor Playwright e2e` in `.github/workflows/repository-policy.yml` run the same checks. Playwright report: `editor/docs/e2e-report.md`. Univer lock and `@univerjs-pro` ban: `editor/scripts/check-deps.mjs` (also invoked from `pnpm lint`).

`<lumio-plugin-dir>` is the installed [LumioAgentSpec](https://github.com/LumioGames/LumioAgentSpec) plugin directory; on hosts with the plugin installed, `/lumio:lint` runs the same check. Expected results are `spec-lint: OK`, all Python tests passing, `validate: OK`, `format: OK`, a successful export for three source tables, and no whitespace errors. Remove `build/` before committing. Remove generated `export.outDir/editor/` export batches; keep `src/lumio_config/editor_static/` committed.

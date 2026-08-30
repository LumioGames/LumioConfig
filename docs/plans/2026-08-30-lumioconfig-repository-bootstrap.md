# LumioConfig Repository Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task (hosts without subagents: its Inline Fallback section). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the public `LumioGames/LumioConfig` repository as the governed source and tooling home for schema-first configuration tables, with a deterministic text-source vertical slice that can validate, format, and export server/client/Voxel projections.

**Architecture:** Keep table content and tooling in this repository while the architecture repository owns cross-repository envelope, canonical, ID namespace, and runtime contracts. The first implementation uses a small Python standard-library toolchain around a provisional Markdown-like pipe-table source format; it emits deterministic JSON projections and a manifest, leaving the generated Rust/C# reader surface and production activation outside this bootstrap.

**Tech Stack:** Python 3.11+ standard library, Node.js for the shared `.spec` linter, JSON Schema-shaped table descriptors, Markdown and YAML metadata, GitHub Actions.

## Global Constraints

- `LGE-V1.4-2026-08-27` remains the referenced architecture baseline; this repository does not redefine accepted cross-repository contracts.
- Text source files are the authority; generated projections are read-only outputs and must be reproducible from source.
- A client projection must omit columns that do not include `C` in their visibility set; omission is physical, not encryption.
- Runtime/game code is not implemented here; consumers use future generated readers rather than parsing source files.
- AI may validate, propose, preview, and submit changes but has no activation or production-release command.
- No secrets, real production tables, or user data are committed.

---

### Task 1: Repository governance and management surface

**Files:**
- Create: `README.md`
- Create: `AGENTS.md`
- Create: `CLAUDE.md`
- Create: `.workflow`
- Create: `.gitattributes`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `LICENSE`
- Create: `CODEOWNERS`
- Create: `CONTRIBUTING.md`
- Create: `SECURITY.md`
- Create: `repository.yaml`
- Create: `docs/management/repository-definition.md`
- Create: `docs/management/operations.md`
- Create: `docs/architecture/lumioconfig-design.md`
- Create: `docs/architecture/baseline.md`
- Create: `.github/workflows/repository-policy.yml`
- Create: `.github/CODEOWNERS`
- Create: `.github/pull_request_template.md`

**Interfaces:**
- Consumes: PR #49 design at architecture commit `d2a7883`.
- Produces: stable paths and ownership rules referenced by Tasks 2-4; `repository.yaml` fields `repository.name`, `repository.kind`, `repository.baseline`, `ownership.architecture`, `ownership.contentAndTooling`, and `outputs.targets`.

- [ ] **Step 1: Write the failing governance checks**

Create the workflow checks that require the README sections, baseline metadata, management documents, and `.spec` lint command before the files exist.

- [ ] **Step 2: Run the checks and verify they fail**

Run `node .spec/tools/spec-lint.mjs` after Task 2's `.spec` files are present but before the governance files are complete; expect the repository-policy content checks to identify missing files/sections.

- [ ] **Step 3: Write the governance and management files**

Document the three-way boundary: architecture source owns public rules, LumioConfig owns content and tools, and implementation repositories consume generated read-only artifacts. Record the source commit and PR URL in `repository.yaml` and `docs/architecture/baseline.md`.

- [ ] **Step 4: Run the governance checks and verify they pass**

Run `node .spec/tools/spec-lint.mjs` and `git diff --check`; both must exit `0`.

- [ ] **Step 5: Commit**

```bash
git add README.md AGENTS.md CLAUDE.md .workflow .gitattributes .gitignore .editorconfig LICENSE CODEOWNERS CONTRIBUTING.md SECURITY.md repository.yaml docs .github
git commit -m "chore: bootstrap LumioConfig repository governance"
```

### Task 2: `.spec` governance mirror

**Files:**
- Create: `.spec/AGENTS.md`
- Create: `.spec/knowledge/README.md`
- Create: `.spec/knowledge/standards/workflow.md`
- Create: `.spec/knowledge/standards/code-style.md`
- Create: `.spec/knowledge/standards/testing.md`
- Create: `.spec/knowledge/standards/repository-architecture.md`
- Create: `.spec/knowledge/standards/dispatch.md`
- Create: `.spec/knowledge/features/_TEMPLATE.md`
- Create: `.spec/knowledge/lessons.md`
- Create: `.spec/rules/system.md`
- Create: `.spec/agents/reviewer.agent.md`
- Create: `.spec/skills/before-you-code/SKILL.md`
- Create: `.spec/skills/brainstorming/SKILL.md`
- Create: `.spec/skills/receiving-code-review/SKILL.md`
- Create: `.spec/skills/spec-steward/SKILL.md`
- Create: `.spec/skills/subagent-driven-development/SKILL.md`
- Create: `.spec/skills/systematic-debugging/SKILL.md`
- Create: `.spec/skills/task-breakdown/SKILL.md`
- Create: `.spec/skills/test-driven-development/SKILL.md`
- Create: `.spec/skills/using-git-worktrees/SKILL.md`
- Create: `.spec/skills/verification-before-completion/SKILL.md`
- Create: `.spec/skills/writing-plans/SKILL.md`
- Create: `.spec/tasks/README.md`
- Create: `.spec/tools/spec-lint.mjs`
- Create: `.spec/tools/spec-lint.test.mjs`
- Create: `.claude/agents`
- Create: `.claude/skills`
- Create: `.agents/skills`

**Interfaces:**
- Consumes: the repository-wide governance paths from Task 1.
- Produces: `node .spec/tools/spec-lint.mjs` and `node --test .spec/tools/spec-lint.test.mjs` as the repository structure gate.

- [ ] **Step 1: Write the failing spec-lint fixture**

Add the copied, unmodified shared linter and its self-test; keep the test fixture's minimal `coder` roster aligned with the new `.spec/AGENTS.md`.

- [ ] **Step 2: Run the linter and verify it fails**

Run `node .spec/tools/spec-lint.mjs`; expect missing core files, links, or symlink errors until the mirror is complete.

- [ ] **Step 3: Add the tailored governance mirror and host links**

Keep frontmatter to the repository contract (`name`, `description`, and knowledge metadata only), register `reviewer`, and add the three host links resolving into `.spec`.

- [ ] **Step 4: Run the structural test suite**

Run `node .spec/tools/spec-lint.mjs && node --test .spec/tools/spec-lint.test.mjs`; expect `spec-lint: OK` and all tests passing.

- [ ] **Step 5: Commit**

```bash
git add .spec .claude .agents
git commit -m "chore(spec): add LumioConfig governance mirror"
```

### Task 3: Provisional source tables and deterministic Python toolchain

**Files:**
- Create: `pyproject.toml`
- Create: `src/lumio_config/__init__.py`
- Create: `src/lumio_config/model.py`
- Create: `src/lumio_config/text_table.py`
- Create: `src/lumio_config/validate.py`
- Create: `src/lumio_config/fingerprint.py`
- Create: `src/lumio_config/export.py`
- Create: `src/lumio_config/cli.py`
- Create: `tools/lumio_config.py`
- Create: `schemas/skills.json`
- Create: `schemas/effects.json`
- Create: `schemas/drops.json`
- Create: `tables/skills.txt`
- Create: `tables/effects.txt`
- Create: `tables/drops.txt`
- Create: `registry/row-ids.json`
- Create: `registry/tombstones.json`
- Create: `docs/reference/source-format.md`
- Create: `docs/reference/cli.md`
- Create: `docs/reference/error-format.md`

**Interfaces:**
- Consumes: `repository.yaml` and the source-format rules from Task 1.
- Produces: `python tools/lumio_config.py validate [--json]`, `format`, and `export --out <dir>`; `ValidationError` records with `table`, `row`, `column`, `code`, `message`, and `suggestion`; manifest fields `contentFingerprint`, `packageFingerprint`, and `sourceFingerprint`.

- [ ] **Step 1: Write failing unit tests for parser, validator, fingerprint, and projection**

Create `tests/test_toolchain.py` covering malformed rows, missing required fields, invalid references, visibility omission, idempotent formatting, and equal logical content producing the same content fingerprint.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run `python -m unittest discover -s tests -v`; expect failures because the package modules do not yet provide the required functions.

- [ ] **Step 3: Implement the smallest deterministic source reader and formatter**

Parse the documented pipe-table dialect, preserve four cell states (`missing`, `empty`, `null`, `default`), enforce stable row IDs, and format rows/columns with one canonical spacing rule.

- [ ] **Step 4: Implement schema validation and structured errors**

Validate scalar types, required columns, min/max bounds, refs, and visibility tokens without importing third-party packages. Return all errors sorted by table/row/column/code.

- [ ] **Step 5: Implement the three fingerprints and target projections**

Hash canonical logical JSON for content, emitted bytes for package, and source plus schema bytes for source; project only `S`, `C`, or `V` columns to target JSON and fail if a target-visible reference crosses a hidden column.

- [ ] **Step 6: Run the focused tests and verify they pass**

Run `python -m unittest discover -s tests -v` and the CLI smoke commands:

```bash
python tools/lumio_config.py validate
python tools/lumio_config.py format --check
python tools/lumio_config.py export --out build/export
```

Expect zero validation errors, a clean format check, and `build/export/manifest.json` plus `server/`, `client/`, and `voxel/` projections.

- [ ] **Step 7: Commit**

```bash
git add pyproject.toml src tools schemas tables registry docs/reference tests
git commit -m "feat(toolchain): add deterministic config table vertical slice"
```

### Task 4: CI, generated-output policy, and final verification

**Files:**
- Modify: `.github/workflows/repository-policy.yml`
- Modify: `.gitignore`
- Create: `tests/test_repository_metadata.py`
- Create: `docs/operations/validation-evidence.md`
- Create: `generated/README.md`

**Interfaces:**
- Consumes: Task 2's spec gate and Task 3's CLI commands.
- Produces: one local command sequence matching CI and a documented boundary for generated read-only artifacts.

- [ ] **Step 1: Write failing repository metadata tests**

Assert that `repository.yaml` identifies `LumioConfig` as `tooling`, names the architecture source commit `d2a7883`, and declares `S`, `C`, and `V` output targets.

- [ ] **Step 2: Run the tests and verify they fail**

Run `python -m unittest tests.test_repository_metadata -v`; expect failure until metadata and test files exist.

- [ ] **Step 3: Add CI and generated-output rules**

Run Node structural checks, Python unit tests, format/validate/export checks, and `git diff --check`; ignore build outputs while documenting that any future committed generated artifact must be regenerated by the toolchain.

- [ ] **Step 4: Run the full local gate**

Run:

```bash
node .spec/tools/spec-lint.mjs
node --test .spec/tools/spec-lint.test.mjs
python -m unittest discover -s tests -v
python tools/lumio_config.py validate
python tools/lumio_config.py format --check
python tools/lumio_config.py export --out build/export
git diff --check
```

Expect every command to exit `0`; remove `build/export` before committing so generated outputs do not enter the source repository.

- [ ] **Step 5: Commit**

```bash
git add .github .gitignore tests docs/operations generated
git commit -m "ci: gate LumioConfig source and toolchain"
```

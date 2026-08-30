# Local scripts

## Repair agent links

Git for Windows with `core.symlinks=false` checks a repository `120000` entry out as a plain text file. After a fresh Windows clone, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ensure-agent-links.ps1
```

On Linux or macOS with symlink support, run:

```bash
sh scripts/ensure-agent-links.sh
```

The scripts touch only `.claude/agents`, `.claude/skills`, and `.agents/skills`, and verify that each path resolves into this repository's `.spec/` directory. Run `node .spec/tools/spec-lint.mjs` after repair.

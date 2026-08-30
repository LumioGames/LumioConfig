# LumioAgent Entry

Compatibility entrypoint for agent tools. The authoritative spec lives under `.spec/`; this file only points, it defines no rules of its own.

Read these three in order:

1. **`.spec/AGENTS.md`** — project identity and agent scheduling.
2. **`.spec/knowledge/README.md`** — project knowledge navigation.
3. **`.spec/rules/system.md`** — hard constraints and safety guardrails.

Beyond the core: skills and the reviewer role live under `.spec/`; Codex and Claude host links point into that directory.

Rules for all agents:

- **Read and follow `.spec/AGENTS.md` first.**
- Treat this file as a pointer only. Do not add project rules here.
- Public contract changes remain owned by `LumioGameEngineArchitecture` and must not be invented in this repository.

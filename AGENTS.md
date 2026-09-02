# LumioConfig Agent Entry

Compatibility entrypoint for agent tools. The authoritative spec lives under `.spec/`; this file only points, it defines no rules of its own.

Public contract changes remain owned by `LumioGameEngineArchitecture` and must not be invented in this repository.

<!-- lumio:init -->
## LumioAgentSpec

本项目使用 LumioAgentSpec 插件的调度与编码规程。项目自身的定位、收口门槛与知识导航见:

- [`.spec/AGENTS.md`](.spec/AGENTS.md) —— 项目中心文档(先读)
- [`.spec/knowledge/README.md`](.spec/knowledge/README.md) —— 知识导航
- [`.spec/decisions/`](.spec/decisions/README.md) —— 决策唯一落点(ADR)

> 通用规程与硬红线由插件在每次会话注入(Claude Code);无此机制的宿主请主动读取上述文件。项目专属技能(`cross-repo-delivery`、`td-progress-audit`)经 `.agents/skills` 链接待用。

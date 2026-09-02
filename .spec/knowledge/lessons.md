---
name: lessons
description: 配表工具和治理中的复发问题——复盘或开工前查
metadata:
  type: doc
  status: 已交付
---

# 经验教训

## 当前记录

- 首版仓库必须先明确架构仓、内容工具仓和实现仓的所有权，避免把运行时职责倒灌进配表工具。
- 生成目录与权威源要在 .gitignore、README 和 CI 中同时声明，否则只读生成物容易变成无人负责的第二真相。
- 并行期不得占用架构仓 ADR 号。配表阶段 0 决议暂落 `docs/decisions/`，Unicode NFC 是配表域哈希前规则，不是 ADR-041 的现场修改。
- 相邻数据行在无空行分隔时，Git 三路合并会把整张小表当成同一 hunk；格式化器必须在行间留空行才能满足「改不同行自动合并」。
- 源表格式的选择标准是 AI 合并时的信息完整度，不是渲染。AI 不直接编辑源表，格式只在 Git 合并时起作用；行间空行提供逐行冲突标记，比 `.md` 加 union 合并更适合 AI 处理冲突。
- 单元格转义只认 `\|` 与 `\\`；悬空反斜线或未知 `\x` 必须报 `INVALID_ESCAPE`，不能静默丢掉反斜线。
- Schema 列 `ordinal` 是列的稳定序号（改名/重排仍识别），不是行座位号；内容指纹按 ordinal 排列表，不得把座位号写入 `tables/` 或 `registry/`。
- 单元格三方合并比较的是四态 token（`""` / `null` / `@default` / `0` 互异），不是显示串；无 `base` 的补丁不做三方。
- `seat` / `revisionOrdinal` 不得写入补丁或 registry；改名把旧名记入 `row-ids.json` 的 `aliases`，lookup 仍按终身编号。

# `.sdd/` 是什么

`.sdd/` 是**纯临时区**:主 loop 派活时生成的 worker 简报(`task-N-brief.md`)、审查包与中间产物(`*-review.md`、`*.log`、`*.patch`)落在这里,用完即弃,**一律不入库**。

## 为什么整目录 gitignore

2026-09-03 的网页编辑器 v3 重设计批次把「每卡交回物 + 进度台账」也指定落在 `.sdd/`,而本目录 `.gitignore` 是 `*`(整目录自忽略)——收口后台账在 git 里蒸发,2026-09-04 的完成度审计被迫全靠代码 + 测试重建证据(见 `docs/reviews/2026-09-04-editor-v3-completion-audit.md` §0.2 / §G-4)。教训已录 `.spec/knowledge/lessons.md`:**台账的落点必须是入库路径**。

## 入库 / 不入库

| 文件 | 入库 | 依据 |
| --- | --- | --- |
| `README.md`(本文件)、`.gitignore` | 是 | `!README.md` / `!.gitignore` 显式豁免,让本目录的规则随仓库分发 |
| 其余一切(`task-*-brief.md`、`*-review.md`、`*.log`、`*.patch`、截图、旧 `progress.md` 等) | 否 | 纯临时区,不留档 |

## 交回物与台账落哪里

单一权威表述见 `.spec/knowledge/standards/dispatch.md`:交回物与进度台账一律落 `docs/reviews/`(入库路径),`.sdd/` 不落任何台账或交回物。M6 批次的六份交回物原件已于 2026-09-04 按 M7-J(R-00402,Owner 闸门选项 A)移档至 `docs/reviews/2026-09-04-m6-{f,g,h,i,j,k}-return.md`。

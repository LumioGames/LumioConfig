# 网页编辑器 v3 加固批次 · 进度台账（2026-09-04）

主 loop 进度记忆。集成分支 `feat/editor-v3-hardening`（起点 `4c12a19`）。口径见派活提示词 §4.5。

## T0（9 张子卡，已全部合入）

- Task 1 (M7-X copy): complete (commits 83fd8c5..68404be, merged)
- Task 2 (M7-X types+storage): complete (commits 5cb0acf..b9725ff, merged)
- Task 3 (M7-A sse-liveness): complete (commits 5306e4d..b94ad7c, merged)
  - note: 新增导出 subscribeEventsWithReconnect（重连驱动器，接线点 1 使用）；App.tsx:799 计划内断点，接线前 tsc 红
- Task 4 (M7-C header-projection): complete (commits d783d6b..a01eba0, merged)
- Task 5 (M7-K storage-injection): complete (commits 96b8dbb..a1cc062, merged)
  - note: 本机 Node 24 基线 313 全绿，24 红仅在 Node 26 出现；守卫白名单临时含 ExportTab.tsx（待 Task 14 迁移后删除）
  - note: ExportTab.tsx:81 裸 sessionStorage.getItem 为计划外发现，已并入 Task 14 派遣指令
- Task 6 (H1 host-contract): complete (commits 867b24d..46e25d1, merged)（首次派遣因宿主限流中断，已重派）
- Task 7 (M7-E source-endpoint): complete (commits 596947a..7bb889b, merged)
  - note: 生产挂载行 `from . import source_view` 由主 loop 在 e1dc87c 补上（worker 文件集不含 server.py）
- Task 8 (M7-F export-txt): complete (commits add4c09..cfa21eb, merged)
  - note: targets 语义按 Owner 闸门选项 A（未勾选默认值）；server.py 的 txt files[].table 元数据映射由主 loop 在 e1dc87c 补上
- Task 9 (M7-J sdd-return): complete (commits 2092401..1e67f5a, merged)
  - note: 六份 M6 交回物基于本机 .sdd/ 原件移档（非重建）；合入时主 loop 已 rm 本地旧 .sdd/.gitignore 并删 .git/info/exclude 的 .sdd/ 行

## 主 loop 集成动作

- e1dc87c: T0 wiring（source_view 挂载 / txt 导出元数据 / 删 client.ts 守卫白名单临时项）
- T0 合并态验证：python unittest 168 OK（基线 150）；vitest 350 passed（基线 313）；App.tsx tsc 红为计划内断点（接线点 1 前）

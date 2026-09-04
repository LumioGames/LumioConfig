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

## T1（5 张子卡，已全部合入）

- Task 10 (M7-A offline-e2e): complete (commit 304f5f0, merged)
  - note: S01 实测 ~10ms / S04 实测 ~830ms（预算 8000/12000ms）；S03 用 DOM 直发点击（Blocked 遮罩拦真实点击）
- Task 11 (M7-B errors-e2e): complete (commit 5678ce4, merged)
  - note: 发现产品缺陷——errors onJump 只按 rowKey 匹配而 Host 错误 row 是行名，静默不跳；3 行反查修复由主 loop 在接线提交落地并摘 test.fixme
- Task 12 (M7-C toolbar-legend): complete (commits e9ba64c..f04908f, merged)
- Task 13 (M7-D topbar-paths): complete (commits d40863c..9b6bc2e, merged)
  - note: App.tsx 传参（sourcePath/schemaPath）由主 loop 接线落地；status-table 在 StatusBar（不在文件集），title 落在 topbar-table
- Task 14 (M7-F export-tab-txt): complete (commits adfb664..da0ec08, merged)
  - note: App.tsx formats 传参由主 loop 接线落地；ExportTab 裸 sessionStorage 已迁移，守卫白名单清零（M7-K S03 收口）
- 主 loop T1 接线提交：TopBar 路径传参 + ExportTab formats + errors onJump 反查（M7-B S04 修复）
- T1 合并态验证：vitest 363 passed（41 文件）；E2E host-errors/host-offline/host-export 5 passed；lint 全绿

## T2（Task 15 合入；Task 16 未扇出——M7-G Owner 授权闸门未勾）

- Task 15 (M7-E tablelist-source-view): complete (commits 10bfd7a..83d5337, merged)
  - note: worker 因账户周/月限额中断（1310，2026-09-07 重置），六个文件已就位，主 loop 代为验证（单测 28 绿/lint 绿/E2E skip 设计正确）并代收尾提交
  - note: 接线点 2 由主 loop 落地——App.tsx 挂 SourceViewDialog、onViewSource→client.sourceFile、revealEnabled←capabilities.reveal（本批 false，第三项整项不渲染）
- T2 合并态验证：vitest 378 passed（42 文件）；host-source-view E2E 1 passed（接线后 skip 解除）

## T3 · Task 17（主 loop 自做，收口）

- 文档：docs/reference/editor.md 增「离线与重连」「查看源文件」段、导出段补 TXT 只读快照口径、错误码补 NETWORK_UNREACHABLE / PAYLOAD_TOO_LARGE（REVEAL_DISABLED 未加——Task 16 未扇出）；web-editor-ux.md status→已交付 + §14 M7 设计现状。
- 截图：default-1440x900 / drawer-expanded-1440x900 重拍 + offline-blocked-1440x900 新增（1440×900；经像素级对照验证 cooldown_frames 单行不折、列头中文、S/C/V 图例在位）。
- known gap：本机（Windows）Chromium 下 Univer 数据行不上帧（新旧构建同样、headed/headless 同样、审计机正常）——列头/侧栏/抽屉/阻断页均正常渲染，仅数据行区域空白；E2E 全部走数据模型断言不受影响。截图数据行空白属本机渲染环境限制，非本批回归（已用 main@4c12a19 旧产物对照证实）。
- editor_static 重建并提交。

## 收口门槛（2026-09-04 实测 @ 集成分支尖）

| 命令 | 结果 | 基线对比 |
| --- | --- | --- |
| pnpm install --frozen-lockfile | OK | — |
| pnpm lint | PASS（eslint+tsc+check-deps） | 基线 PASS |
| pnpm vitest run | **378 passed / 0 failed (42 files)** | 基线 313（+65；本机 Node 24 下 24 红基线不出现，Node 26 判据见交回物） |
| pnpm e2e | **59 passed** | 基线 54（+5：offline 1 / errors 2 / source-view 1 / export-txt 1） |
| python -m unittest discover | **168 OK** | 基线 150（+18） |
| validate / format --check | OK / OK | — |
| git diff --check / spec-lint | 空 / OK | — |
| build 后 editor_static diff | 重建后已提交（Task 17） | 基线空 |

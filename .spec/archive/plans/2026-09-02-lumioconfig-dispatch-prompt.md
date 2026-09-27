---
status: in_progress
---

# LumioConfig 剩余工作派活提示词（2026-09-02）

> 给执行 Agent 的开工提示词。工作内容本体在 Workflow RM-00009 各卡正文的「实现指引」节，本文只做三件事：指路、立规、设禁区。盘点结论与 Workflow 对账记录附在文末，供人核对。

## 一、可直接粘贴的提示词

```text
【目标仓】~/LumioGames/LumioConfig（macOS）或 C:/Work/LumioGames/LumioConfig（Windows）。
进场：git pull --ff-only，记录 HEAD；读 AGENTS.md 指向的 .spec 三件套（AGENTS / knowledge/README / rules/system）；
读 docs/decisions/ 八条决议（0-7、0-8 全文，其余读「决定」节）；读 docs/reference/ 三份（source-format / error-format / cli）；
读 .spec/plans/2026-09-02-web-editor-design-prompt.md 的 §0（真值优先级与上下文合并规则）、§3（公共契约）与本卡对应的 §4 节。
架构仓真值：~/LumioGames/LumioGameEngine/.spec/knowledge/features/config-table.md §1/§4 M6/§6，
与 .spec/plans/2026-09-02-config-web-editor-landing.md。两处口径不一致 → 停，交回物标 BLOCKED 并引用两处原文，不自行取舍。

【环境】Python 必须 3.11+（macOS 默认 python3 是 3.9，用 /usr/local/bin/python3.11）；Node 22+ 与 pnpm 只用于 editor/；
pyproject 只允许标准库。cargo check 不算证据。

【任务来源】Workflow 项目 lumiogamesengine，需求室 RM-00009《LumioConfig》。卡正文（含「实现指引」与 4 条验收项）是真值，
本提示词不复述。每卡开工前逐条 GET 前置卡核对状态与合入证据；Consumes 符号在 origin/main 上 grep 不到 = 前置未合入 → BLOCKED。

【顺序】Python 主线同仓串行，一卡一分支一 PR，前一卡合入 main 后再开下一卡：
  1. R-00321 源目录、解析、幂等格式化
  2. R-00322 机器门 + 单元格级三方合并（base/expect、merge_cell/merge_patch、STALE_BASELINE / DELETED_ROW_CONFLICT /
     SCHEMA_CHANGED、ALREADY_APPLIED、ApplyResult、summarize_ops；设计提示词 §4.1）
  3. R-00323 发号台
  4. R-00324 导表器
  5. R-00331 AI 五动作
  6. R-00329 语义摘要与预演（summary 复用 R-00322 的 summarize_ops）
  7. R-00360 M6-A Host 会话、安全边界、设置、VcsAdapter status/revision（§4.3；前置 R-00322）
  8. R-00361 M6-B 编辑体验、四态、类型编辑器、草稿恢复（§4.4；前置 R-00330 + R-00360）
  9. R-00362 M6-C 语义提取、带基线补丁提交、自动 commit / 导表设置（§4.5；前置 R-00361 + R-00322）
 10. R-00363 M6-D 三方合并冲突面板、修订监视、Stale 状态机（§4.6；前置 R-00362）
 11. R-00364 M6-E CSV/TSV 导出、editor_static 内嵌、CI、E2E 矩阵、文档（§4.7；前置 R-00363）
 12. R-00326 Config 侧合同
 13. R-00327 集成
【并行例外（Owner 已准）】R-00330 Univer POC + 只读投影（§4.2）文件集只有 editor/，不碰 Python：
  在独立 worktree 与第 1–6 步并行开工，合入顺序按完成先后。

【每卡流程】
  领卡（.spec/tasks/ 或宿主任务工具标 in_progress）→ 分支 feat/<单号>-<slug> + 独立 worktree → before-you-code →
  先写会失败的测试 → 最小实现 → 重构 → 收口命令全跑并附真实输出 → reviewer 独立审查（.spec/agents/reviewer）→
  交回物给总调度 → 总调度核验后合入 main 并流转 Workflow。

【守门（不满足即停并回报，不得绕过）】
  - R-00325 Rust/C# 读取面、R-00328 人门签名、R-00332 跨仓分发、R-00333/334 阶段 3：需要架构仓合同或跨仓改动，本轮不做。
  - 源格式保持 tables/<table>.txt 与行间空行，不改 .md（0-1 决议）。
  - 网页编辑器：表格内核 Univer OSS 精确锁 0.25.x、禁 @univerjs-pro/*；Host 只用 Python 标准库；不建 Rust Host、
    不写第二套解析器；XLSX、技能卡、领域插件、多人协作、桌面壳一律不做（0-7 决议）。
  - 需要跨仓字段、错误码、稳定 ID、字节规则，或要改设计提示词 §3 公共契约 / 0-7 / 0-8：停下，交回物标 BLOCKED + 缺口描述。

【公共纪律】
  ① 每卡先写失败测试再实现（TDD），纯文档改动可声明豁免；
  ② 只动本卡「拥有范围」内文件；schemas/ tables/ registry/ 是真源，build/ 与导出物不手改；editor_static/ 只在 R-00364 提交；
  ③ 表里不写 if、脚本或蓝图式逻辑；
  ④ 收口前实跑并附真实输出：
       /usr/local/bin/python3.11 -m unittest discover -s tests -v
       python3.11 tools/lumio_config.py validate
       python3.11 tools/lumio_config.py format --check
       python3.11 tools/lumio_config.py export --out build/export
       node .spec/tools/spec-lint.mjs
       git diff --check
       前端卡另加：pnpm lint && pnpm test && pnpm build；有 E2E 的卡另加：pnpm e2e
     未执行的写「未执行」；
  ⑤ 不碰 Workflow：不流转、不评论、不建卡，状态由总调度核验交回物后写入；
  ⑥ 不 push 受保护分支、不发包、不做任何生产操作；PR 合入 main 前把交回物给总调度；
  ⑦ token / 凭据不进仓库、prompt、日志。

【交回物（每卡一份）】
  改动清单（文件级）；分支名与提交号（已推 origin）；上述命令的实际输出；
  对照卡面 4 条验收项逐条说明覆盖情况与证据；known gaps（不得含 P0/P1）；
  知识沉淀落点（.spec/knowledge/ 或「无需沉淀」声明）；.spec/tasks/ 在途卡已删除。
```

## 二、盘点结论（2026-09-02，供人核对）

| 项 | 事实 | 出处 |
| --- | --- | --- |
| 本仓 origin/main | ee10aaa，CI Repository Policy 2026-09-01 success | `gh run list` |
| 本地门槛 | Python 3.11 下 31 测试通过（1 skip）；validate / format / export / spec-lint / diff-check 全 OK | 本机实跑 |
| 已交付模块 | M1 全部、M2 主体、M3 主体、M4 投影与三指纹 | `git show --stat a0d12dd` |
| 阶段 0 | 六条决议以 `docs/decisions/` 暂落，未占架构仓 ADR 号 | `docs/decisions/README.md` |
| RM-00009 | 21 卡：backlog 18、验收中 2、评审中 1、完成 0；验收项 86 条全部 not_started | Room overview 端点 |
| 收窄 | R-00326 / R-00327 的运行时部分移出本 Room | Owner 2026-09-02 裁定 |
| 源格式 | 保持 TXT 与行间空行 | Owner 2026-09-02 裁定 |

## 三、Workflow 对账记录（本次已写入）

- 9 + 1 张卡追加「实现指引」或「范围收窄」节：R-00321、322、323、324、325、326、327、329、330、331。
- R-00315、316、317：补差异记录评论。交付证据引用的架构仓分支 `Go1c/rm-00009-integration` 与 ADR-050 / 051 在 origin 上不存在，编号已被 RM-00011 占用；不改状态，解铃条件写在评论里。
- R-00321 到 324：补「仓库领先」证据评论，引用 origin ee10aaa 与实跑输出。
- R-00326、327：各补一条收窄来源评论。
- 状态流转与验收项调整见第五节执行记录。

## 四、待 Owner 的事项

0. 2026-09-02 网页编辑器裁决已落 0-7 / 0-8 与设计提示词 v2；Workflow 已同步（Owner 授权后落单）：R-00322 正文扩为单元格级三方合并、R-00330 收窄为 Univer POC + 只读投影并改写 4 条验收项、新建 M6-A~E = R-00360 ~ R-00364（蓝图 lumioconfig-m6-editor-20260902/r1）。
1. 阶段 0 决议何时搬入架构仓：等 RM-00011 并行期结束（现行计划），或另开分支现在搬。
2. R-00325 / 328 / 332 / 333 / 334 的守门条件是否接受。
3. 本仓本轮文档改动的提交。

## 五、执行记录（2026-09-02，均已读回核对）

| 对象 | 动作 | 结果 |
| --- | --- | --- |
| R-00321、322、323、324 | 需求池 → 评审中 → 实现中，reason 引用 origin ee10aaa 证据评论 | 均为 `in_progress` |
| R-00326、327、329、330、331 | 需求池 → 评审中 → 已评审，reason 为 Owner 评审通过并补全实现指引 | 均为 `approved` |
| R-00325 | 守门条件不满足，留在需求池 | `backlog` |
| R-00326 验收项 1–4 | 改为 Config 侧口径（manifest 字段、负向 fixture、文档、测试） | PATCH 200，状态仍 not_started |
| R-00327 验收项 2 | 改为「集成测试无跨仓依赖，reload / 回放链已移出」 | PATCH 200 |
| Room overview | 需求池 18 → 9，进行中 3 → 12，已完成 0 | overview 端点读回 |

流转端点按 transitions 响应自带的 `href` / `method` 调用（`POST /requirements/{id}/transition`），每步带 `reason`。

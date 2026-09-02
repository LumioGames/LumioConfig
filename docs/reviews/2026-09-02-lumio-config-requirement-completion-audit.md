# LumioConfig 代码与需求室完成度对账报告（2026-09-02）

- 盘点范围：LumioConfig 单仓 × Workflow「LumioConfig」需求室（lumiogamesengine 项目，Room `01a051ba`）。
- 盘点焦点（用户指令）：① 代码是否偏离原本的设计需求；② 需求是否真正做完。
- 真值口径：需求 = Workflow 需求卡（含验收项与 Owner 裁决评论）；代码 = origin/main（HEAD `47b396a`，PR #16 合入后）；测试 = 本机实跑输出 + CI 运行记录。

## 1. 执行摘要

| 维度 | 结论 |
| --- | --- |
| 需求室卡片 | 26 张：9 backlog / 17 started（全部 in_progress 或验收链上）/ 0 completed |
| 已交付卡（代码在 origin/main） | 14/26：R-00321~324、326、327、329、330、331、360~364 |
| 验收项对照（14 卡 56 项） | 54 满足 + 2 部分满足（均为测试覆盖缺口，非功能缺失） |
| 测试与 CI | 本机 `python -m unittest discover -s tests` → **Ran 136 tests, OK**（25.1s，含 `tests/integration/`）；`validate` / `format --check` / `registry verify` 均 OK；CI Repository Policy main@47b396a run 33642606444 success（2026-09-02T14:31Z，含 editor lint/test/e2e） |
| 未做卡 | 12/26：R-00318~320（A0-04/05/06 ADR）、325（M8 读取面）、328（M5 人门）、332（跨仓分发）、333/334（C3 预研）、314（原始蓝图，非执行卡） |

**核心结论（3 条）：**

1. **代码没有偏离设计需求。** 蓝图红线全部成立（表内无逻辑、AI 无 activate/sign/publish、客户端投影物理排除机密列、ordinal 不持久化、墓碑不复用）；三处范围变更（R-00322 三方合并归 M2、R-00326/327 运行时行为移出本 Room、R-00330 改用 Univer 并拆出 M6 五卡）全部有 2026-09-02 Owner 裁决评论在卡，属记录在案的需求变更而非漂移。
2. **「做完」要分两层回答：代码层基本做完，验收层完全没做。** 14 张已交付卡的 56 个验收项中 54 项可对照代码与测试核验通过，但 Workflow 上 106 个验收项无一实跑、无一张卡到达 done——交付与验收之间的闭环从未发生（本次盘点已把状态债还到「实现中」，见 §7）。
3. **遗留缺口集中在两处：** ① 2 个测试覆盖缺口（R-00364 静态页服务零测试、R-00330 Playwright 缺真实 IME/拖拽填充/筛选排序查找替换驱动）；② A0 架构卡证据不可复核（架构仓分支 Go1c/rm-00009-integration 未推送 origin，ADR-050/051 编号被 RM-00011 占用）。

## 2. 里程碑完成度（对照 R-00314 蓝图 M1–M10）

| 里程碑 | 卡 | 状态 | 证据要点 |
| --- | --- | --- | --- |
| M1 权威源 | R-00321 | 已交付（in_progress） | `src/lumio_config/text_table.py` 四态往返+非法转义拒绝；`validate.py:245-255` ordinal 校验；`tests/test_m1_format_merge.py`；真表无逻辑断言（:279） |
| M2 补丁机器门 | R-00322 | 已交付 | `patch.py` 快照回滚（:79-86）、结构化错误、`merge_cell/merge_patch`、STALE_BASELINE/DELETED_ROW_CONFLICT/SCHEMA_CHANGED、ALREADY_APPLIED 幂等（:635-651） |
| M3 永久 ID | R-00323 | 已交付 | `ids.py` 临界区发号（msvcrt/fcntl :32-63）、墓碑不复用（:320-333）、registry verify 子命令、原子写 `write_json`（:73-86） |
| M4 导表器 | R-00324 | 已交付 | `export.py` 五层合并+origins（:121-205）、S/C/V 投影、四层清单、三重指纹与 compilerHash 跨 OS 修复（027b101） |
| M5 人门 | R-00328 | **未做** | 人类签名激活门与首次披露清单，backlog |
| M6 Web 编辑器 | R-00360~364 | 已交付 | Host 安全边界（`server.py:83,147-161`）、四态九动作 Playwright、提交与手写补丁逐字节一致、冲突面板三值五动作、CSV 导出+E2E 矩阵（`editor/docs/e2e-report.md`） |
| M7 AI 五动作 | R-00331 | 已交付 | 五动作冻结于 `docs/decisions/0-6-tooling-surface-contract.md:55-66`；`BANNED_ACTIONS` 帮助面断言（`tests/test_ai_tools.py:17,65-87`） |
| M8 读取面 | R-00325 | **未做** | Rust/C# typed Prepare/TryGet 生成，backlog |
| M9 Revision 装载 | R-00326 | 已交付（收窄） | Owner 裁决：运行时行为归 Runtime/Server 仓；Config 侧交付 revisionId/投影根冻结+三类负向 fixture+`docs/reference/revision-manifest.md` |
| M10 回放 | R-00327 链② | 移出本 Room | 随 R-00326 裁决移出；链①（三端投影+机密扫描）与链③（AI 自修）已交付（PR #16） |
| （B2）摘要/模拟 | R-00329 | 已交付 | `summary.py`/`preview.py`/`simulate.py`；simulate 为显式 unavailable 占位（符合设计） |
| （B2）Univer POC | R-00330 | 已交付 | projection roundtrip 空 diff、interceptors 四类拒绝、poc-benchmark 实测 196ms 首屏 |
| （阶段 0）A0 ADR | R-00315~317 | **证据不可复核** | 见 §4；R-00318~320 未做 |
| （阶段 2）跨仓分发 | R-00332 | **未做** | 只读生成物跨仓分发与消费端对账 |
| （阶段 3）预研 | R-00333/334 | **未做** | 百万行实测、二进制后端三选一决策门 |

## 3. Workflow 现状（Room × 状态）

状态机（需求评审工作流，实测出边）：`backlog → in_review → approved → in_progress → acceptance → done`。

| 状态 | 卡 |
| --- | --- |
| backlog（9） | R-00314（原始蓝图，非执行卡）、318、319、320、325、328、332、333、334 |
| in_progress（17） | R-00321~324、326、327、329、330、331、360~364（本次盘点后全部与代码事实一致） |
| in_review / acceptance / approved / done | R-00317 / R-00315、316 / 无 / 无 |

验收总账：26 卡 106 个验收项，**0 passed**、0 blocked；`missingRequirementCount=0`（每卡都有验收项）。

## 4. 漂移对照与证据核验

**方向一：仓库领先（本次已处理）**

| 漂移 | 处理（2026-09-02） |
| --- | --- |
| M6 五卡（360~364）代码已合入 main，卡停在 backlog、0 评论 | 两跳流转 backlog→in_review→in_progress + 每卡证据评论（origin 提交号 + 实跑输出 + CI run） |
| R-00326/327/329/330/331 停在 approved（先于「实现中」一个身位）；329/331 无证据评论 | 流转 approved→in_progress + 证据评论 |
| R-00321~324 评论里的缺口记录基于旧 HEAD ee10aaa | 缺口已被后续分支补齐（见下），卡已在 in_progress 无需流转 |
| 读回核验 | 26 卡状态+评论数逐一读回；overview backlog 14→9、started 12→17；106 验收项未动（不越级红线） |

B1 缺口补齐证据（评论声称缺口 → 补齐提交）：
- R-00321 缺「ordinal 与非法转义拒绝」→ `feat/R-00321` tip `691c2a9`「pin column ordinal and reject invalid table escapes」。
- R-00322 缺「三方合并、基线过期冲突、幂等重提」→ `f3b05ae`「add cell-level three-way merge for patches」。
- R-00323 缺「registry verify、原子写、ordinal 守卫、别名审计」→ `45381b8`「add registry verify, atomic writes, aliases, ordinal guards」。
- R-00324 缺「五层合并、单位换算、四层清单、三 hash」→ `2198b81`「add layer merge, unit conversion, four-layer manifests」。
- R-00327 集成链 → PR #16（`0b99a11` + `027b101`），CI 绿。

**方向二：Workflow 领先（不可复核清单）**

| 卡 | 问题 | 解铃条件 |
| --- | --- | --- |
| R-00315/316（acceptance） | 交付评论引用架构仓分支 `Go1c/rm-00009-integration` 与提交 `23b9e01`/`619a199`；本次实测 `git ls-remote` 确认该分支在架构仓 origin **不存在**；ADR-050/051 编号已被 RM-00011 占用 | ① Windows 侧把该分支推送到架构仓 origin 并现查现占新 ADR 号；或 ② 按 `docs/decisions/pending-architecture-merge.md`，RM-00011 并行期结束后把本仓 0-1/0-2 决议搬入架构仓 ADR。在重核通过前不得向 done 流转 |
| R-00317（in_review） | 无交付评论/附件/提交号 | 同上；本仓等价内容 `docs/decisions/0-3` + `testdata/unicode/` 双语言 golden 已在 origin |

## 5. 关键路径与下一阶段编排建议

- **W0（解阻，不完成不进下一 wave）**：架构仓 ADR 回路（R-00315~317 解铃）——这是「阶段 0 冻结」的欠账，阻塞 A0-04/05/06（R-00318~320）的落单基线。
- **W1（补测试缺口，收口 M6/POC）**：R-00364 静态页服务测试（serve 完整页面 + 路径逃逸正测）；R-00330 补真实 IME/拖拽填充/筛选排序查找替换的 Playwright 驱动。两者都在本仓 editor/，可并行于 W0。
- **W2（验收闭环）**：对 17 张 in_progress 卡按验收项逐项实跑并回写 acceptance 状态；过验收的卡由验收方流转 done。这步不需要新代码，是把已有交付变成可审计的完成。
- **W3（新功能）**：R-00325（M8 读取面）依赖 M4 产物已就绪；R-00328（M5 人门）依赖 ADR 回路；R-00332（跨仓分发）依赖各消费仓立卡。

## 6. 风险与开放决策

1. **验收债是最大的管理风险**：106 项 0 实跑。若不补验收，「做完」永远只是代码层声称。建议按 W2 批量补，验收动作由验收方（非交付会话）执行。
2. **A0 证据债**：架构仓 Go1c 分支缺失意味着阶段 0 的「冻结」在架构仓侧不成立。需 Owner 在①推送旧分支与②并入 RM-00011 后重写之间裁决；建议②（旧分支跨机状态不明，重写可顺带占新号）。
3. **并行会话风险**：盘点期间 main 前进了 3 个 PR（#14/#15/#16，均为今日合入）。多会话/多机并行推进时，Workflow 写入与仓内合入可能交错；本次写入未遇 409，但后续盘点应先 `git pull` 再对账（本次已如此执行）。
4. **次要口径差**（不构成偏离）：R-00322 错误结构无独立 `path` 字段（表/行/列已足够定位）；R-00329 simulate adapter 为显式占位（「缺模拟器不伪造成功」是设计要求本身）。

## 7. 本次已执行动作 / 待授权事项

**已执行（持续授权范围内）：**

- 10 张卡流转（M6 五卡两跳、approved 五卡一跳）至 in_progress，均附证据评论（origin 提交号 + 本机实跑输出 + CI run 33642606444）。
- 逐卡读回核验：状态、评论数、overview 分桶（backlog 14→9 / started 12→17）、106 验收项未动。
- 未新建任何卡/Room/里程碑；未改动任何卡的 description 与验收项状态。

**未执行 / 待授权：**

- 验收项实跑与 done 流转（属验收方职权，需 Owner 指派验收人）。
- 架构仓 ADR 回路推送/重写（涉跨仓写入，需逐次授权）。
- 下一阶段派活提示词（本次为单仓 review，未编排 wave；如需按 §5 派活请另行指令）。

## 附：验收项对照明细（14 卡 56 项）

| 卡 | 结论 | 缺口 |
| --- | --- | --- |
| R-00321 | 4/4 满足 | — |
| R-00322 | 4/4 满足 | 错误无独立 path 字段（次要表达差） |
| R-00323 | 4/4 满足 | — |
| R-00324 | 4/4 满足 | — |
| R-00326 | 4/4 满足 | — |
| R-00327 | 4/4 满足 | — |
| R-00329 | 4/4 满足 | C/V 端 diff 未逐端断言（覆盖略薄）；simulate 占位属设计 |
| R-00330 | 3/4 满足 | **A3 部分满足**：缺真实 IME composition、拖拽填充、真实筛选/排序/查找替换 Playwright 驱动 |
| R-00331 | 4/4 满足 | 「提案」按冻结设计是写 JSON 非 CLI 动词 |
| R-00360 | 4/4 满足 | null 态投影未逐格断言（轻微）；`.svn` 自动探测无显式用例 |
| R-00361 | 4/4 满足 | Delete 语义经 helper 入口非真实按键（轻微） |
| R-00362 | 4/4 满足 | — |
| R-00363 | 4/4 满足 | 五种冲突抉择仅「采我的值」有 e2e；「AI 改不同表」无显式用例 |
| R-00364 | 3/4 满足 | **A2 部分满足**：`GET /` 静态页服务零测试覆盖（实现存在：`server.py:430-455`，editor_static/ 80 文件） |

对照方法：三路只读子代理逐项 grep 定位符号与测试函数（证据为 `文件:行` 级），加主线程本机实跑（136/136 OK）与 CI 记录交叉验证；前端 vitest/Playwright 未在本机重跑，以 CI editor-e2e job（绿）与仓内 spec 文件为证据。

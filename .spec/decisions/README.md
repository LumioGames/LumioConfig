# Decisions(决策记录 · ADR)

用 ADR(Architecture Decision Record)记录决策:为什么这样调度、为什么定这种结构、为什么划这条边界。**本目录是全仓决策记录的唯一落点**——功能内决策与框架级决策都记这里,feature 文档只描述设计现状,不留决策记录。

> 跨仓架构 ADR 以架构仓为权威，镜像在 `docs/decisions/`，不在本目录重复登记。

## 怎么写一条 ADR

- 一个决策 = 一个文件 `NNNN-<slug>.md`,编号从 `0001` 递增;写完在下方索引加一行。
- **一旦记录不改写**:被推翻就新增一条,把旧的状态标成「被 NNNN 取代」,历史留痕。被取代的状态行必须链接取代者(spec-lint 强制)。
- 无 frontmatter。格式照抄:

  ```markdown
  # NNNN · <一句话决策>

  - 日期:YYYY-MM-DD
  - 状态:生效 | 被 [NNNN](NNNN-<slug>.md) 取代(部分取代加前缀「部分」)

  ## 背景
  面对什么问题。

  ## 决策
  定了什么。

  ## 后果
  接受了什么代价。
  ```

## 索引

| 编号 | 决策 | 状态 |
|------|------|------|
| [0001](0001-adopt-lumioagentspec-plugin.md) | Agent 治理框架改用 LumioAgentSpec 插件分发 | 生效 |
| [0002](0002-ci-spec-lint-from-upstream.md) | CI 结构校验改从 LumioAgentSpec 上游拉取 | 生效 |
| [0003](0003-web-editor-v3-information-architecture.md) | 网页编辑器 v3 采用三栏 + 底部抽屉信息架构，检查器只读且默认收起 | 生效 |
| [0004](0004-univer-surface-trim-and-native-context-menu.md) | Univer 自带工具栏整体关闭、白名单动作走自建工具栏、四态注入原生右键 | 生效 |
| [0005](0005-session-phase-user-facing-mapping.md) | 会话阶段以用户口径呈现：预检无改动置灰、提交只在有副作用时确认、阻断态横幅化、`failKind` 取代 hint 子串判断 | 生效 |
| [0006](0006-four-state-rendering-spike-and-j3-scope.md) | 四态呈现由 spike 决定；J3 本轮只做指纹变化横幅；`invalid` 红字为前端守卫缺失；深色主题后续 | 生效 |
| [0007](0007-redesign-delivery-strategy.md) | 重设计叠在已交付的 UI 原语与令牌上、修复卡先行、`App.tsx` 由主 loop 每 wave 接线，不采用一卡一会话流程 | 生效 |

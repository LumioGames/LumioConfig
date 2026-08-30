---
status: in_progress
---

# 创建 LumioConfig 公共仓库并交付首版治理与文本导出骨架

## 涉及范围

- README.md
- repository.yaml
- docs/
- .spec/
- src/
- tools/
- schemas/
- tables/
- registry/
- tests/
- .github/

## 验收标准

- [ ] GitHub 仓库 LumioGames/LumioConfig 为公开仓库且本地克隆路径为 C:\Work\LumioGames\LumioConfig。
- [ ] 管理文档明确架构仓、LumioConfig 和实现仓的所有权、目录职责、版本流程和安全边界。
- [ ] validate、format --check 和 export 能处理至少三张示例表并生成 S/C/V 投影。
- [ ] 客户端投影不包含未标记 C 的列，结构化错误能定位表、行和列。
- [ ] .spec 结构校验、单元测试和 CI 等价命令全部通过。

## 依赖

无。

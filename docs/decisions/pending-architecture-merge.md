# 待并入清单

> 本清单交给 Owner，等 RM-00011 并行期结束、架构仓 ADR 写入权恢复后再搬。清单只列主题，**不发明、不预占 ADR 号**。搬入时在架构仓现查当时最高 ADR 再占号。

读取真值（本清单落笔时现场实测）：

- 架构仓 `origin/main`：`d012c5cb6ef04d00e8bff414e38dc7995eb80f0b`
- 设计概要：`docs/specs/2026-08-30-lumioconfig-design-overview.md`
- 裁决流水：`docs/specs/2026-08-30-config-table-architecture-decisions.md` 附 6
- 本仓 HEAD（清单起草基线）：`894c12bc2d040a3a4d38c4f40a76009b7e046ee5`

| 本仓文件 | 阶段 0 卡 | 将来 ADR 候选主题（附 6 原文） | 编号 |
| --- | --- | --- | --- |
| [0-1-authority-source-and-patch-channel.md](0-1-authority-source-and-patch-channel.md) | 0-1 权威源与补丁通道 | 配表权威源与补丁通道 | 合并时现查现占 |
| [0-2-id-namespace-and-issuance.md](0-2-id-namespace-and-issuance.md) | 0-2 ID 命名空间与发号 | 配表 ID 命名空间与发号 | 合并时现查现占 |
| [0-3-content-fingerprint-and-numeric-rules.md](0-3-content-fingerprint-and-numeric-rules.md) | 0-3 内容指纹与数值规则 | 配表 canonical 语义与三重指纹 | 合并时现查现占 |
| [0-4-artifact-container-and-target-split.md](0-4-artifact-container-and-target-split.md) | 0-4 产物容器与三端切分 | 配表产物容器与投影 | 合并时现查现占 |
| [0-5-revision-lifecycle.md](0-5-revision-lifecycle.md) | 0-5 版本生命周期 | 配表 Revision 生命周期 | 合并时现查现占 |
| [0-6-tooling-surface-contract.md](0-6-tooling-surface-contract.md) | 0-6 工具面契约 | 配表工具面契约 | 合并时现查现占 |
| [0-7-web-editor-boundary-and-stack.md](0-7-web-editor-boundary-and-stack.md) | 0-7 网页编辑器权威边界与技术选型 | 配表编辑器权威边界与选型（架构仓落地方案 `.spec/plans/2026-09-02-config-web-editor-landing.md` §1–§2） | 合并时现查现占 |
| [0-8-draft-submit-merge-lifecycle.md](0-8-draft-submit-merge-lifecycle.md) | 0-8 草稿、提交与合并生命周期 | 配表草稿、提交与三方合并生命周期（同上 §3；`base`/`expect` 部分与 0-6 合并考虑） | 合并时现查现占 |

0-3 额外交回：已钉 Unicode NFC，双语言对照测试集在 `testdata/unicode/`。搬入架构仓时把该政策与 golden 一并带上，仍不在本仓改 ADR-041。

本清单不要求、也不授权在架构仓创建任何文件。

# 仓库定义与管理边界

## 一句话定义

`LumioConfig` 是 LumioGameEngine 的配表源和配表工具仓：保存 Schema-first 的文本表，校验并格式化变更，编译出服务器、客户端和 Voxel 的只读投影。

## 三方所有权

| 参与方 | 拥有 | 不拥有 |
| --- | --- | --- |
| `LumioGameEngineArchitecture` | 公共 Envelope、Canonical/Hash 规则、跨仓 ID Namespace 授权、Schema/Fixture 和运行时契约 | 每个游戏产品的具体表内容和编辑器实现 |
| `LumioConfig` | 表结构实例、文本源、默认值、墓碑、机器门、格式化器、编译器、导出清单和工具接口 | ECS/GAS/Voxel/网络运行时、生产激活、人类信任根 |
| 七个实现仓 | 消费锁定版本的只读导出物并接入自己的运行时适配器 | 改写源表、手改导出物、复制公共契约 |

## 管理对象

- **Source**：`schemas/`、`tables/`、`registry/`，是 Git 中的权威内容。
- **Change**：结构化补丁或等价的 Pull Request 改动；必须经过机器校验。
- **Revision**：一次可重建的导出集合，包含三端投影和内容/包裹/底稿指纹。
- **Artifact**：导出目录中的只读文件；不得在目标实现仓手改。
- **Activation**：生产环境的人类签名和滚动更新动作，不属于本仓首版 CLI。

## 目录地图

```text
schemas/       表结构定义
tables/        权威文本表
registry/      永久行号与墓碑
src/           可测试的 Python 库实现
tools/         CI/本地统一 CLI
tests/         单元与元数据测试
docs/          架构、管理、参考文档
.spec/         Agent 治理与结构校验
.github/       GitHub Policy、CODEOWNERS、PR 模板
```

## 变更归属判断

如果变更只影响表内容、域内 Schema 实例、格式化器或导出实现，提交到 `LumioConfig`。如果变更影响跨仓字段、错误码、Canonical 字节、稳定 ID、运行时装载或依赖方向，先回到架构仓走 ADR -> Schema/ID/Fixture -> 镜像同步顺序。

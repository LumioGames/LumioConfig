# LumioConfig 配表管线设计

本文是架构仓 PR `#49`（提交 `d2a7883ea447d2c34b92269c1f84ac9c3c53f5eb`）在本仓的执行入口。完整设计与裁决流水以架构仓为准：[`2026-08-30-lumioconfig-design-overview.md`](https://github.com/LumioGames/LumioGameEngineArchitecture/blob/d2a7883ea447d2c34b92269c1f84ac9c3c53f5eb/docs/specs/2026-08-30-lumioconfig-design-overview.md)。

## 核心不变量

1. Schema-first 文本源是表的真身，编辑器只是补丁客户端。
2. 内容指纹描述逻辑值，与文本或未来二进制包装格式无关。
3. 一台生产实例绑定一套完整 Revision，不在运行中混用版本。
4. AI 可以查、提案、预检、预演和提交，但没有生产激活权。

## 本仓首版落点

- `schemas/`、`tables/`、`registry/` 提供最小源数据闭环。
- `src/lumio_config/` 提供可测试的解析、校验、指纹和导出实现。
- `tools/lumio_config.py` 是本地和 CI 的统一入口。
- 生成目录只用于验证和预览；未来提交的产物必须标记为生成物并可从源重建。

## 暂不冻结

文本方言的最终标准、二进制后端、压缩和分块数值、签名信任链细则、Web 编辑器和跨仓自动分发，都按 PR #49 的阶段 0–3 顺序推进。Unicode 归一化在本仓阶段 0 决议 0-3 钉为 NFC，待并入架构仓，不在此提升为公共契约。

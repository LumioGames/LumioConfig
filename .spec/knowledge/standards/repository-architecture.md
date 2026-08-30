---
name: repository-architecture
description: LumioConfig 与架构仓、实现仓的所有权边界——改契约或导出时查
metadata:
  type: doc
  status: 已交付
---

# 仓库架构与所有权

## 三方边界

- 架构仓拥有跨仓公共语义：Envelope、Canonical/Hash、ID Namespace 授权、运行时生命周期和契约 Schema。
- LumioConfig 拥有具体表内容、Schema 实例、墓碑、校验、格式化、编译和投影工具。
- 实现仓只消费版本锁定的只读导出物，不读取本仓源文本，不手写重复契约。

## 变更顺序

影响公共字段、错误码、稳定 ID、字节规则或依赖方向时，先回架构仓按 ADR -> Schema/ID -> 正向/失败 Fixture -> README/Baseline -> 镜像同步执行。只影响域内内容和工具实现时，可在本仓提交，但仍要保持输出可重建。

## 产物边界

导出器生成服务器、客户端和 Voxel 投影；客户端隐藏列必须物理不存在。未来 Rust/C# 生成读表面由架构仓公共生成契约约束，本仓只能实现其内容输入，不自行冻结 ABI。

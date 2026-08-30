---
name: testing
description: LumioConfig 的测试分层、TDD 和收口证据要求——改行为时查
metadata:
  type: doc
  status: 已交付
---

# 测试与验收

- 新功能和行为变更先写一个会失败的真实测试，再实现最小行为。
- 单元测试覆盖解析、类型/引用/可见性校验、格式化、指纹和投影；CLI 冒烟测试覆盖主命令。
- 每次收口运行 Node .spec 结构检查、Python 测试、validate、format --check、export 和 git diff --check。
- 测试失败时先定位根因；不要通过放宽校验或修改测试断言掩盖问题。
- 产物可重建性用干净输出目录和重复导出比较验证。

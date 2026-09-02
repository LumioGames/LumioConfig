---
name: integration-vertical-chains
description: R-00327 两条垂直链：混合可见性三端投影与 AI 五动作自修提交——改集成测试或导表/补丁 CLI 时查
metadata:
  type: doc
  status: 已交付
---

# 垂直链集成（R-00327）

本仓集成候选是 tag 名 `integration-R-00327` 加上 `testdata/integration/review-input.json` 里的 `compilerHash` / `inputHash` / `outputHash`。不跨仓、不实现装载或 reload。

- 混合标签表 fixture：`testdata/integration/mixed-table/`。客户端扫描从 `query schema` 收集所有非 C 列名及其投影值，再在 `client/` 产物中搜索，命中必须为零。
- AI 五动作：`query` → 写补丁 → 故意 `patch apply` 失败（`TYPE_MISMATCH`）→ 按错误列与 schema 类型程序化修正 → `patch validate` / `preview` → 再 `patch apply`。无 `activate`。Git 工作区只允许 `tables/` 与 `registry/` 变化；actor / reason / 前后指纹进 apply JSON、audit 与 commit。
- 回滚：测试在临时 git 库打 `integration-R-00327`，`git reset --hard` 后再 export，指纹回到 `review-input.json`。

测试入口：`tests/integration/`，只用 subprocess 调 `tools/lumio_config.py`。操作说明：`docs/operations/integration-candidate.md`。

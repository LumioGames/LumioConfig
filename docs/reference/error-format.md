# 结构化错误

机器门错误是 JSON 对象，至少包含以下字段：

    {
      "table": "skills",
      "row": "fireball",
      "column": "damage",
      "code": "TYPE_MISMATCH",
      "message": "damage expects i32",
      "suggestion": "replace the value with a signed integer"
    }

CLI 的 --json 输出是错误数组；排序键为 table、row、column、code。错误消息面向 AI 自修和人类排查，不能泄露秘密值。

三方合并冲突时，错误对象额外包含 `base` / `current` / `draft`（四态 token）和 `rowId`（终身编号）。新增错误码：`STALE_BASELINE`、`DELETED_ROW_CONFLICT`、`SCHEMA_CHANGED`、`ALREADY_APPLIED`。

发号/registry 错误码：`ORDINAL_PERSISTED`（补丁或 registry 写入 `seat` / `revisionOrdinal`）、`ALIAS_CONFLICT`（别名与现名冲突）、`REGISTRY_DANGLING_NAME`、`ID_OUT_OF_RANGE`。

导表层覆盖错误码：`LAYER_CREATE_FORBIDDEN`（`layers/` overlay 试图新增行；overlay 只能 update 既有行）。

Revision 合同错误码（Config 侧校验，不实现装载器）：`REVISION_FINGERPRINT_MISMATCH`（`revisionId` 不等于聚合内容指纹）、`REQUIRED_TABLE_MISSING`（清单缺少必需表）、`PROJECTION_PUBLIC_ROOT_MIXED`（某端投影根等于公共根）。负向 fixture 见 `testdata/revision/`。

查询错误码：`UNKNOWN_ROW`（`query row` / `query card` 找不到名字或终身编号）。

编辑器 Host 错误码：`UNAUTHORIZED`（缺 token）、`FORBIDDEN_ORIGIN`（错误 Origin）、`FORBIDDEN_HOST`（非 loopback Host）、`WORKING_TREE_DIRTY`（脏工作树且不允许打开）。

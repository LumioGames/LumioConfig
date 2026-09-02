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

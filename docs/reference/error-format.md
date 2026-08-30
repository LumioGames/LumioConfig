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

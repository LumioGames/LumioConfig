# 影响报告

`preview` 成功时输出的 `report` 对象。字段如下。

```json
{
  "patch": {"table": "skills", "ops": []},
  "baseline": {
    "contentFingerprint": "...",
    "packageFingerprint": "...",
    "sourceFingerprint": "..."
  },
  "candidate": {
    "contentFingerprint": "...",
    "packageFingerprint": "...",
    "sourceFingerprint": "...",
    "compilerHash": "...",
    "inputHash": "...",
    "outputHash": "..."
  },
  "summary": {
    "text": "skills: fireball.damage 120 → 130",
    "changes": [
      {
        "table": "skills",
        "name": "fireball",
        "id": 40001,
        "column": "damage",
        "before": "120",
        "after": "130",
        "unit": null,
        "origin": "engine"
      }
    ]
  },
  "simulation": {
    "status": "unavailable",
    "evidence": {"reason": "no simulator bound"}
  },
  "risks": ["simulation unavailable"],
  "firstDisclosure": [],
  "validation": {"ok": true, "errors": []}
}
```

- `summary.text` 复用 `summarize_ops`；`changes` 保留四态 token，不把 `""` / `null` / `@default` 折成同一种空。
- `origin` 是编译期五层覆盖后该格的出处；`unit` 来自 schema 列，没有则为 `null`。
- `simulation.status` 仅为 `ok` 或 `unavailable`。默认 adapter 返回 `unavailable`，不得写成通过。
- 预演在临时目录编译，不改 `tables/`、`registry/`、正式 `generated/`。

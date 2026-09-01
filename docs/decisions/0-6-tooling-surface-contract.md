# 0-6 工具面契约

> **并行期声明。** 本决议暂落本仓、不占架构仓 ADR 号。原因是并行期避免与 RM-00011 抢号：架构仓 `docs/adr/` 与 `.spec/decisions/` 由 RM-00011 编排会话唯一写入，ADR 编号在合并时现查当时最高号再占。后人不得把本文件的存在理解成架构仓流程遗漏。

对应设计概要 §5 阶段 0 表「工具面契约（补丁格式、报错格式、AI 五动作）」；裁决依据为板 E.1 / E.2。

## 补丁格式

补丁是 JSON 对象，只写名字不写终身编号：

```json
{
  "table": "skills",
  "ops": [
    {
      "op": "create",
      "name": "ice_lance",
      "set": {
        "display_name": "Ice Lance",
        "effect_id": "chill",
        "damage": 40,
        "cooldown_frames": 60,
        "icon": "fx_ice_lance"
      }
    },
    {"op": "update", "name": "fireball", "set": {"damage": 130}},
    {"op": "rename", "name": "frostbolt", "to": "frost_bolt"},
    {"op": "delete", "name": "unused_skill"}
  ]
}
```

- `op`：`create` / `update` / `rename` / `delete`。
- `ref` 列写目标行的名字，apply 时解析成终身编号。
- `set` 禁止出现 `id`。
- 入口：`python tools/lumio_config.py patch validate <file>` 与 `patch apply <file>`。机器门全过则 apply 无人值守合入 `tables/` 与 `registry/`。

## 报错格式

机器门错误是 JSON 对象，第一读者是 AI：

```json
{
  "table": "skills",
  "row": "fireball",
  "column": "damage",
  "code": "TYPE_MISMATCH",
  "message": "damage expects i32",
  "suggestion": "replace the value with a correctly typed scalar"
}
```

`row` 在补丁路径上用可读名定位。排序键为 table、row、column、code、message。

## AI 五动作（封闭集）

| 动作 | 含义 | 本仓入口 |
| --- | --- | --- |
| 查 | 读表 / 读 schema / 读技能卡 | 读 `tables/` `schemas/`；`validate` |
| 提案 | 写补丁 | 写上述 JSON |
| 预检 | 自己先跑机器门 | `patch validate` |
| 预演 | 编译预览 | `export`（不等于上线） |
| 提交 | 送进机器门合入 | `patch apply` |

没有第六个动作。没有激活、没有「推给玩家」。审计走 Git（作者、改前后指纹、理由）。

## 明确不做

- 本阶段不做人话摘要、模拟预演框架、网页编辑器保存流。
- 不把导表产物当作可手改源。
- 不在本决议占用架构仓 ADR 号。

## 将来搬入架构仓

- 对应 ADR 候选主题：**配表工具面契约**（裁决流水附 6 第 6 条）。
- 编号不在此预占。搬入时由 Owner 在架构仓按当时最高 ADR 现查现占；本文不得写成 `ADR-NNN`。

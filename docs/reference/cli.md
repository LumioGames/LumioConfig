# CLI 参考

统一入口是 python tools/lumio_config.py，运行前无需安装第三方包。

## validate

    python tools/lumio_config.py validate
    python tools/lumio_config.py validate --json

读取全部 Schema 和表，输出按表/行/列排序的结构化错误；发现错误时退出码为 1。

## format

    python tools/lumio_config.py format
    python tools/lumio_config.py format --check

无参数时就地规范化源文本；--check 只检查是否已规范化，发现差异退出码为 1。

## patch

    python tools/lumio_config.py patch validate path/to/patch.json
    python tools/lumio_config.py patch apply path/to/patch.json
    python tools/lumio_config.py patch apply path/to/patch.json --audit audit.jsonl --reason "why"

校验或合入名字补丁。补丁不得填写终身编号；create 在 apply 时由发号台分配。`patch validate` 失败时 stdout 为结构化错误 JSON 数组，成功时打印 `patch-validate: OK`。`patch apply` 始终打印 JSON：`contract`（`lumio-config-tools/v1`）/ `ok` / `summary` / `errors` / `sourceFingerprint` / `beforeSourceFingerprint` / `assignedIds` / `actor`；`--reason` 写入该 JSON，不自动 commit。`--actor` 默认 `ai`。`--audit` 在成功时追加一行 JSON（时间、表、摘要、前后指纹、actor、理由）。`--timeout` 为可选秒数上限。

## query

    python tools/lumio_config.py query table <table>
    python tools/lumio_config.py query row <table> <name-or-id>
    python tools/lumio_config.py query schema <table>
    python tools/lumio_config.py query card <table> <name>

只读查询，输出带 `"contract": "lumio-config-tools/v1"` 的 JSON。`card` 返回主表行，以及 ref 目标行和反向引用该行的子表行。不写 `tables/` / `registry/`。

## preview

    python tools/lumio_config.py preview path/to/patch.json

在临时目录对「当前源 + 补丁」做隔离 export，输出三端行列 diff、内容/包裹/底稿指纹前后值、首次 C 披露列、`summarize_ops` 人话摘要、模拟 adapter 结果和影响报告；不改权威源。成功/失败均为同一合同 JSON。模拟默认 `unavailable`，不阻塞 `patch validate`。

## registry

    python tools/lumio_config.py registry verify

核对 `registry/row-ids.json`、源表 `id` 列与 `registry/tombstones.json`：无重复、无越界、无墓碑复用、别名不与现名冲突。成功打印 `registry-verify: OK`；失败时 stdout 为结构化错误 JSON 数组，退出码 1。

## export

    python tools/lumio_config.py export --out build/export

先验证源，再按 engine→platform→server→product→environment 合并 `layers/` overlay，做单位换算，生成：

- `server|client|voxel/<table>.json` 三端投影（行内不含 origin）
- `server|client|voxel/manifest.json` 分端清单（表描述 → 块描述；首版一表一块，块指纹 = 包裹指纹）
- `origins.json` 每值出处层标签
- `manifest.json` 发布清单，含内容/包裹/底稿三指纹与 `compilerHash` / `inputHash` / `outputHash`

输出目录是生成物，默认被 Git 忽略。

## serve

    python tools/lumio_config.py serve [--port 0] [--no-open] [--root <repo>]

启动只绑 `127.0.0.1` 的本地编辑器 Host。`--port 0` 取随机高位端口。启动打印 `http://127.0.0.1:<port>/#token=<token>`。`tables/` `registry/` `schemas/` 有未提交改动且 `openPolicy.allowDirtyWorkingTree` 为 false 时退出码 3，打印 `WORKING_TREE_DIRTY` 与文件列表。`vcs=none` 不检查。提供 `GET /api/session`、`GET /api/tables/{table}`、`GET /api/events`、`DELETE /api/session`。本命令不提交、不导表。

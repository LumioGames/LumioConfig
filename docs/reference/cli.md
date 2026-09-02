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

校验或合入名字补丁。补丁不得填写终身编号；create 在 apply 时由发号台分配。`patch validate` 失败时 stdout 为结构化错误 JSON 数组，成功时打印 `patch-validate: OK`。`patch apply` 始终打印 JSON：`ok` / `summary` / `errors` / `sourceFingerprint` / `beforeSourceFingerprint` / `assignedIds`；`--reason` 只写入该 JSON，不自动 commit。`--audit` 在成功时追加一行 JSON（时间、表、摘要、前后指纹）。

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

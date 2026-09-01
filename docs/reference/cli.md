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

校验或合入名字补丁。补丁不得填写终身编号；create 在 apply 时由发号台分配。失败时 stdout 为结构化错误 JSON 数组；成功时打印 `patch-validate: OK` 或 `patch-apply: OK`。

## export

    python tools/lumio_config.py export --out build/export

先验证源，再生成 server/、client/、voxel/ 和 manifest.json。输出目录是生成物，默认被 Git 忽略。

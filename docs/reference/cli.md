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

## export

    python tools/lumio_config.py export --out build/export

先验证源，再生成 server/、client/、voxel/ 和 manifest.json。输出目录是生成物，默认被 Git 忽略。

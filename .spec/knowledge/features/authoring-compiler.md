---
name: authoring-compiler
description: 配表 CLI 的作者工具闭包——构建固定 Python/PyInstaller onedir、核对编译器指纹与交接 Engine 时查
metadata:
  type: doc
  status: 已交付
---

# 配表作者工具

`tools/build-config-compiler.py` 复用现有 `tools/lumio_config.py` 与 `src/lumio_config/`，生成无需系统 Python 的 onedir。公共格式与发行校验归 Engine [ADR-137](https://github.com/LumioGames/LumioGameEngine/blob/main/.spec/decisions/ADR-137-engine-authoring-tool-closures.md)；本仓不另定格式。

在原生 x64 目标机器的 CPython 3.11.9 环境运行，构建依赖精确版本见 `tools/config-compiler-requirements.txt`。源码必须是干净检出，`--source-commit` 必须等于完整 HEAD，输出必须是新的目录。

```bash
python tools/build-config-compiler.py --rid win-x64 --source-commit <完整HEAD> --install --out build/authoring
```

Linux 将 RID 换为 `linux-x64`；必须提供构建 Python 的完整 `LICENSE.txt`。构建器记录实际平台、glibc、依赖版本、许可证与闭包文件哈希。两种平台的构建与实跑分别取证，不能以另一平台替代。`--install` 只安装构建依赖，建议用独立 Python 环境。

输出 `build/authoring/config-compiler-<rid>/authoring-tool.json` 与编译产物。Engine 的 `verifyAuthoringTool` 校验整套文件；`pack-release --config-root --config-source-commit --config-artifact` 消费这份闭包。输出不包含 `.py`，不得手改 metadata 或指纹。

构建器沿 `_compiler_hash()` 的现有文件集合、字节规则计算指纹并带入 `compiler-hash.txt`。源码 CLI 仍读取真实源码计算；冻结 CLI 只读取包内专用指纹，缺失或损坏直接失败。该值由发行文件哈希保护，不改变表格解析、内容或包指纹算法。

验证使用相同合法输入分别运行源码与冻结 CLI 的 `export --root --client-out --server-out --csharp-out`，比较所有输出文件，并重复导出；非法输入比较退出码与结构化诊断。冻结程序从带空格的外部路径、清空 PATH、移走提供方源码后运行，证明没有 Python/源码回退。源码单元与边界用例入口为 `python -m unittest discover -s tests -v`。

固定产物使用 UTF-8 模式，避免目标机器本地代码页改变中文诊断字节。运行 `python tests/authoring-smoke.py --artifact <onedir> --out <新的证据目录>`，实际验证双端及 Reader 输出、重复导出、Unicode 非法输入诊断、空 PATH 与损坏身份拒绝。源码测试在 Windows 设置 `PYTHONUTF8=1` 与 `PYTHONIOENCODING=utf-8`。需要跨语言 Unicode 向量时先构建 `testdata/unicode/rust/Cargo.toml` 和 `testdata/unicode/csharp/UnicodeGolden.csproj`。

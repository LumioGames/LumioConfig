# 贡献指南

## 边界

`tables/`、`schemas/` 和 `registry/` 是权威源；`build/`、`dist/` 和未来的 `generated/` 是生成物。不要手改生成物，也不要把真实生产数据、密钥或用户数据提交到仓库。

公共协议、错误码、Canonical 规则、跨仓 ID Namespace 或运行时生命周期发生变化时，先在 [`LumioGameEngineArchitecture`](https://github.com/LumioGames/LumioGameEngineArchitecture) 提交 ADR 和契约变更，再更新本仓镜像或工具。

## 提交前检查

```bash
node .spec/tools/spec-lint.mjs
node --test .spec/tools/spec-lint.test.mjs
python -m unittest discover -s tests -v
python tools/lumio_config.py validate
python tools/lumio_config.py format --check
python tools/lumio_config.py export --out build/export
git diff --check
```

提交标题使用 `type(scope): subject`，例如 `feat(validator): reject hidden-column refs`。每个 Pull Request 只解决一类问题，并说明源表、Schema、工具和验证证据。

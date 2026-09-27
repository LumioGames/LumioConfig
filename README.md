# LumioConfig

<!-- lumio-community:start -->
<div align="center">
<table>
<tr>
<td align="center" width="50%" valign="top">
<a href="https://qm.qq.com/q/PGkXh4tCyQ"><img src="https://raw.githubusercontent.com/LumioGames/.github/main/profile/assets/qr-qq.svg" width="170" alt="QQ 交流群 972220164"></a><br>
<a href="https://qm.qq.com/q/PGkXh4tCyQ"><img src="https://img.shields.io/badge/QQ%20%E4%BA%A4%E6%B5%81%E7%BE%A4-972220164-6171F0?style=for-the-badge&logo=tencentqq&logoColor=white" alt="QQ 交流群 972220164"></a><br>
<sub>什么都能聊</sub>
</td>
<td align="center" width="50%" valign="top">
<a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=fffn1ae7-fd83-4315-96ac-6fa3aba3968e"><img src="https://raw.githubusercontent.com/LumioGames/.github/main/profile/assets/qr-engine.svg" width="170" alt="LumioEngine 开发者社区"></a><br>
<a href="https://applink.feishu.cn/client/chat/chatter/add_by_link?link_token=fffn1ae7-fd83-4315-96ac-6fa3aba3968e"><img src="https://img.shields.io/badge/%E9%A3%9E%E4%B9%A6%E7%BE%A4-LumioEngine%20%E5%BC%80%E5%8F%91%E8%80%85%E7%A4%BE%E5%8C%BA-5DE2C6?style=for-the-badge&logoColor=1E2A3A" alt="LumioEngine 开发者社区"></a><br>
<sub>飞书话题群 · Rust / C# 引擎层</sub>
</td>
</tr>
</table>
<sub>先进群再看代码。其它群和整体介绍见 <a href="https://github.com/LumioGames">LumioGames 主页</a>。</sub>
</div>
<!-- lumio-community:end -->

## 我是什么

配表源与工具仓：文本表、Schema、行号墓碑、校验、补丁、分端导出和 typed Reader 生成。运行时只消费只读导出物；公共语义归 Engine，生产激活由人类 Owner 决定。

## 怎么跑

准备 Python（版本与依赖见项目配置）。

```sh
python tools/lumio_config.py validate
python tools/lumio_config.py format --check
python tools/lumio_config.py export --client-out build/client --server-out build/server
python tools/lumio_config.py verify-split --client-out build/client --server-out build/server
```

编辑器启动见[编辑器手册](docs/reference/editor.md)；完整命令与参数见 [CLI](docs/reference/cli.md)。

## 从哪读

- [源格式](docs/reference/source-format.md)、[C# Reader](docs/reference/csharp-reader.md)、[分端导出](.spec/knowledge/features/split-export.md)。
- [知识导航](.spec/knowledge/README.md)、[操作手册](docs/management/operations.md)、[Sample 配表接入](docs/reference/sample-config-handoff.md)。
- [Lumio-DevKit 帮助手册](https://github.com/LumioGames/Lumio-DevKit)：面向游戏开发者的使用说明与排障入口。

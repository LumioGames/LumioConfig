---
name: code-style
description: LumioConfig 的文档、Python、JSON 和文本表格式约定——写文件时查
metadata:
  type: doc
  status: 已交付
---

# 代码与文档风格

- 文档正文使用中文，协议名、字段名、命令和错误码保留精确英文拼写。
- 文件和目录使用 kebab-case；Python 模块使用 snake_case。
- 文本文件统一 UTF-8、LF 和最终换行；tables/*.txt 只由格式化器排版。
- JSON 输出使用稳定键序、稳定行序和确定性缩进；不要把当前时间写进内容指纹输入。
- 注释只说明代码无法表达的约束；不要用注释代替设计文档。
- 源文件是手写输入，导出文件是生成物；生成物不得手改。

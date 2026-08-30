---
name: lessons
description: 配表工具和治理中的复发问题——复盘或开工前查
metadata:
  type: doc
  status: 已交付
---

# 经验教训

## 当前记录

- 首版仓库必须先明确架构仓、内容工具仓和实现仓的所有权，避免把运行时职责倒灌进配表工具。
- 生成目录与权威源要在 .gitignore、README 和 CI 中同时声明，否则只读生成物容易变成无人负责的第二真相。

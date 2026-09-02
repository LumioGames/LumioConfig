# Third-party notices

本目录锁定 Univer OSS **0.25.1**（Apache License 2.0）。禁止引入任何 `@univerjs-pro/*` 包。

## Univer

- 项目：https://github.com/dream-num/univer
- 许可证：Apache License 2.0（https://www.apache.org/licenses/LICENSE-2.0）
- 版权：Copyright DreamNum Co., Ltd. and Univer contributors
- 上游 LICENSE：https://github.com/dream-num/univer/blob/v0.25.1/LICENSE
- 上游 NOTICE：v0.25.1 标签未提供独立 NOTICE 文件；本文件承担 Apache-2.0 §4(d) 的归属记录。

锁定包（`package.json` / `pnpm-lock.yaml` 精确到 0.25.1）：

| 包 | 版本 | 许可证 |
| --- | --- | --- |
| `@univerjs/core` | 0.25.1 | Apache-2.0 |
| `@univerjs/preset-sheets-core` | 0.25.1 | Apache-2.0 |
| `@univerjs/preset-sheets-filter` | 0.25.1 | Apache-2.0 |
| `@univerjs/preset-sheets-sort` | 0.25.1 | Apache-2.0 |
| `@univerjs/preset-sheets-data-validation` | 0.25.1 | Apache-2.0 |
| `@univerjs/preset-sheets-find-replace` | 0.25.1 | Apache-2.0 |

传递依赖中的其它 `@univerjs/*` 包随 lockfile 锁在 0.25.x 线，同样为 Apache-2.0。`editor/scripts/check-deps.mjs` 扫描 lockfile，出现 `@univerjs-pro` 即失败。

## Apache License 2.0（摘录）

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

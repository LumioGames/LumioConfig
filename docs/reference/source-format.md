# 首版源格式

首版使用可读的 pipe-table 文本方言作为实验性输入。它是实现隔离层，不是跨仓公共契约；最终方言按架构仓阶段 0 ADR 冻结。

## 文件结构

每张表由 schemas/<table>.json 和 tables/<table>.txt 组成。数据文件包含表名、Schema 路径、列头、分隔线和逐行记录：

    table: skills
    schema: schemas/skills.json
    | id | name | display_name | effect_id | damage | cooldown_seconds | icon |
    | --- | --- | --- | --- | --- | --- | --- |
    | 40001 | fireball | Fireball | 50001 | 120 | 2.5 | fx_fireball |

实际首版解析器接受列头和数据行；空行和 `#` 注释行忽略。格式化器在数据行之间输出空行，以便两个补丁改不同行时 Git 能自动合并。

## 单元格四态

- 缺列：该行没有该字段，允许时可吃 Schema default。
- 空字符串：写成 ""，表示有值但内容为空。
- 明确空值：写成 null，表示作者明确给出空值。
- 默认标记：写成 @default，要求编译期使用 Schema default。

字符串中的管道符使用反斜线转义。字符串单元格按 NFC 归一化后再进入内容指纹和格式化输出。数值列使用十进制文本；表现浮点列的特殊值在首版拒绝。

## 稳定身份

源行的 id 是域内永久编号；name 是可读名。编译时可产生版内序号，但不得写入存档或网络身份。删除的编号登记在 registry/tombstones.json，永不复用。

## 可见性

Schema 的列声明 visibility，可取 S、C、V 的非空组合。未声明时默认只导出 S。客户端投影不会携带仅 S/V 的列。

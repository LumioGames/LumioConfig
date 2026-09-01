# 0-3 内容指纹与数值规则

> **并行期声明。** 本决议暂落本仓、不占架构仓 ADR 号。原因是并行期避免与 RM-00011 抢号：架构仓 `docs/adr/` 与 `.spec/decisions/` 由 RM-00011 编排会话唯一写入，ADR 编号在合并时现查当时最高号再占。后人不得把本文件的存在理解成架构仓流程遗漏。

对应设计概要 §5 阶段 0 表「内容指纹与数值规则」；裁决依据为板 B.1a / B.1b 与附 3。定稿时明确「Unicode 归一化具体形式今天没钉」，**本决议补钉**，并给出 Rust/C# 双语言对照测试集。

## 三重指纹

| 指纹 | 认什么 | 不认什么 |
| --- | --- | --- |
| 内容指纹 | 逻辑值（表名 + schema + 按终身编号排序的行，每个单元格带四态） | 空白、列宽、文本/二进制包装 |
| 包裹指纹 | 导出文件字节 | 逻辑是否变化 |
| 底稿指纹 | 源文件 + schema 字节 | 导出包装 |

内容指纹输入在配表域内先做下列正规化，再按对象做稳定 JSON 序列化后 SHA-256。这是配表域规则，**不修改**草案 ADR-041 的 CanonicalJsonV1 正文：ADR-041 对字符串仍是 as-is；本域在进入该对象之前先归一化字符串。

## Unicode 归一化（本日补钉）

**字符串单元格在进入内容指纹之前，按 Unicode Standard Annex #15 做 NFC（Normalization Form C）。**

- 预组合的 `U+00E1` 与分解的 `U+0061`+`U+0301` 必须得到同一内容指纹。
- Hangul 音节 `U+AC00` 与对应 jamo 序列同样必须合一。
- 格式化器写出 NFC，避免 Git 上出现两种拼法。
- 这不是 ADR-041 的修改，也不是 RFC 8785/JCS 的分叉；它是哈希前的配表域步骤。

对照测试集（可运行，不是散文）：

- 向量：`testdata/unicode/vectors.json` 与 `testdata/unicode/vectors.tsv`
- Rust：`testdata/unicode/rust`（`unicode-normalization` + SHA-256）
- C#：`testdata/unicode/csharp`（`String.Normalize(FormC)` + SHA-256）
- 两种语言对每个向量输出 `id <sha256>`，必须与 Python `unicodedata.normalize("NFC")` 一致；composed/decomposed 对必须相同。

## 四态、排序、浮点

- 四态进入内容指纹时必须可区分：`value` / `empty` / `null` / `default` / `missing`。
- 行按终身编号数值升序；列按 schema 声明序。
- 权威数值列（进入模拟判定的）用定点整数，schema 声明类型与单位/精度；作者可写「5%」「2.5秒」，编译期换算。首版源表已用帧与千分比整数。
- 纯表现列允许 `f32`/`f64`：拒 NaN/Inf，负零归一，指纹盖 IEEE-754 位模式。首版尚未落地表现浮点列。
- 不把当前时间写入指纹输入。

## 明确不做

- 不把包装格式或压缩算法算进内容指纹。
- 不在本决议改 ADR-041 / ADR-047 文本。
- 不在本决议占用架构仓 ADR 号。

## 将来搬入架构仓

- 对应 ADR 候选主题：**配表 canonical 语义与三重指纹**（裁决流水附 6 第 3 条；含 Unicode 归一化政策与双语言 golden corpus）。
- 编号不在此预占。搬入时由 Owner 在架构仓按当时最高 ADR 现查现占；本文不得写成 `ADR-NNN`。

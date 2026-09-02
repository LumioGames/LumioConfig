# 五层覆盖

编译期按 ADR-010 顺序合并可选 overlay 文本表：`engine` → `platform` → `server` → `product` → `environment`。

- 权威源仍是 `tables/`；本目录只覆盖已有行，禁止 create。
- 文件路径：`layers/<layer>/<table>.txt`，格式与 `tables/` 相同，列可以是子集。
- 未给出的单元格不覆盖；后一层覆盖前一层。
- 出处标签写入导出目录的 `origins.json`，不进入 S/C/V 投影行。

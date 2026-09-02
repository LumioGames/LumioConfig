# Revision 清单合同（Config 侧）

本仓不实现装载器、开发 reload、握手或回放。运行时只消费导出的四层清单。身份字段由 `export_repository` 写入 `build/export/manifest.json`。

## 身份字段

| 字段 | 含义 |
| --- | --- |
| `revisionId` | 本 Revision 的稳定身份，等于聚合 **内容指纹** `contentFingerprint`（各表内容指纹的稳定聚合）。钉版、回放元数据、握手都钉这个值，不钉 Git 提交号。 |
| `publicRoot` | 公共根，等于发布包裹指纹 `packageFingerprint`。整包字节身份，跨端共享。 |
| `projectionRoots` | 各端投影根：`S` / `C` / `V` → `server/manifest.json` 等分端清单路径。必须与 `targetManifests` 一致，且 **不得等于** `publicRoot`。 |

其它既有字段（`formatVersion`、`baselineId`、`sourceFingerprint`、`tables`、`origins`、compiler/input/output hash）见导表器；本卡只冻结上面三组身份。

## 运行时应如何钉版、备货、拒错版

1. **钉版。** 实例启动与 Replay 元数据记录 `revisionId`（内容根）。不要用工作树 dirty 状态或时间戳当版本。
2. **备货。** 按 `tables[]` 与 `projectionRoots` 把本端投影整套准备完再开门。`testdata/revision/required-table-missing/` 对应错误 `REQUIRED_TABLE_MISSING`：必需表未出现在清单 `tables` 里则不得接客。
3. **拒错版。** 装载后复核 `revisionId == contentFingerprint`。对不上用 `REVISION_FINGERPRINT_MISMATCH`（见 `testdata/revision/fingerprint-mismatch/`）。某端投影根写成公共根（或与 `publicRoot` 相同的值）用 `PROJECTION_PUBLIC_ROOT_MIXED`（见 `testdata/revision/projection-public-root-mixed/`）。
4. 本仓 CLI 没有激活/装载动作。运行时仓消费本合同时引用这些字段与负向 fixture，不要在配表仓实现 Loader。

负向 fixture 目录各含 `manifest.json` 与 `expected.json`（`code` + `requiredTables`）。`lumio_config.revision.validate_revision_manifest` 只做合同校验，不做 I/O 装载。

import { useEffect, useState, type CSSProperties } from "react";
import { Button } from "../../components/ui";
import { COPY } from "../../app/copy";

/**
 * 抽屉「导出」页签(设计稿 §8):表多选 / 格式 / 来源(仓库 · 含我的草稿)/
 * 目标列(全部 · S · C · V)→ [导出] → 文件列表(含 README.txt)+ 下载。
 * 单向生成物,不能导回仓库。替代 ExportPanel(不删,由主 loop 接线切换)。
 *
 * testid 契约(既有 E2E 复用):btn-export export-format export-source
 * export-target export-link;新增 export-tab export-table-<name>。
 */

export interface ExportRequest {
  tables: string[];
  format: "csv" | "tsv";
  source: "repo" | "draft";
  targets?: Array<"S" | "C" | "V">;
}

export interface ExportFile {
  table?: string | null;
  href: string;
}

export interface ExportResult {
  exportId: string;
  files: ExportFile[];
}

export interface ExportTabProps {
  tables: string[];
  onExport(req: ExportRequest): Promise<ExportResult>;
}

const ROOT_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "10px 14px",
  fontSize: "var(--font-size-12)",
  color: "var(--color-text)",
  minWidth: 0,
};

const NOTE_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--color-text-muted)",
};

const FIELD_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  margin: 0,
  padding: 0,
  border: 0,
};

const HINT_STYLE: CSSProperties = {
  margin: 0,
  color: "var(--color-danger-text)",
};

const FILES_STYLE: CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

function fileNameOf(href: string): string {
  return href.split("/").pop() ?? "export";
}

/** 经 Authorization 拉取导出文件并触发浏览器下载(blob,同旧 ExportPanel)。 */
function download(href: string): void {
  void (async () => {
    const token = sessionStorage.getItem("lumio-token");
    const response = await fetch(href, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileNameOf(href);
    link.click();
    URL.revokeObjectURL(url);
  })();
}

export function ExportTab({ tables, onExport }: ExportTabProps) {
  const [selected, setSelected] = useState<string[]>(tables);
  const [format, setFormat] = useState<"csv" | "tsv">("csv");
  const [source, setSource] = useState<"repo" | "draft">("repo");
  const [target, setTarget] = useState<"" | "S" | "C" | "V">("");
  const [files, setFiles] = useState<ExportFile[]>([]);
  const [hint, setHint] = useState("");
  const [busy, setBusy] = useState(false);

  // 表列表(会话加载后)变化时重置为全选(tables 引用每次渲染都变,按快照键比较)。
  const tablesKey = tables.join("\n");
  useEffect(() => {
    setSelected(tables);
  }, [tablesKey]);

  const toggleTable = (table: string, checked: boolean) => {
    setSelected((current) =>
      checked ? [...current, table] : current.filter((name) => name !== table),
    );
  };

  const runExport = () => {
    const request: ExportRequest = { tables: selected, format, source };
    if (target) {
      request.targets = [target];
    }
    setBusy(true);
    setHint("");
    void (async () => {
      try {
        const exported = await onExport(request);
        setFiles(exported.files);
      } catch (error) {
        setFiles([]);
        setHint(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div className="drawer-export" data-testid="export-tab" style={ROOT_STYLE}>
      <p style={NOTE_STYLE}>{COPY.exportNote}</p>
      <fieldset style={FIELD_STYLE}>
        <legend>{COPY.export.tables}</legend>
        {tables.map((table) => (
          <label key={table}>
            <input
              type="checkbox"
              data-testid={`export-table-${table}`}
              checked={selected.includes(table)}
              onChange={(event) => toggleTable(table, event.target.checked)}
            />
            {table}
          </label>
        ))}
      </fieldset>
      <label>
        {COPY.export.format}
        <select
          data-testid="export-format"
          value={format}
          onChange={(event) => setFormat(event.target.value as "csv" | "tsv")}
        >
          <option value="csv">CSV</option>
          <option value="tsv">TSV</option>
        </select>
      </label>
      <label>
        {COPY.export.source}
        <select
          data-testid="export-source"
          value={source}
          onChange={(event) => setSource(event.target.value as "repo" | "draft")}
        >
          <option value="repo">{COPY.export.sourceRepo}</option>
          <option value="draft">{COPY.export.sourceDraft}</option>
        </select>
      </label>
      <label>
        {COPY.export.target}
        <select
          data-testid="export-target"
          value={target}
          onChange={(event) => setTarget(event.target.value as "" | "S" | "C" | "V")}
        >
          <option value="">{COPY.export.targetAll}</option>
          <option value="S">S</option>
          <option value="C">C</option>
          <option value="V">V</option>
        </select>
      </label>
      <div>
        <Button
          variant="primary"
          data-testid="btn-export"
          disabled={selected.length === 0 || busy}
          onClick={runExport}
        >
          {COPY.export.submit}
        </Button>
      </div>
      {hint ? (
        <p data-testid="export-hint" style={HINT_STYLE}>
          {hint}
        </p>
      ) : null}
      {files.length > 0 ? (
        <ul data-testid="export-files" style={FILES_STYLE}>
          {files.map((file) => (
            <li key={file.href}>
              <a
                href={file.href}
                data-testid="export-link"
                onClick={(event) => {
                  event.preventDefault();
                  download(file.href);
                }}
              >
                {file.table ?? fileNameOf(file.href)}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

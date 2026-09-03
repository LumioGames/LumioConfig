import { useState } from "react";
import { api } from "../api/client";
import { Button, Panel } from "../components/ui";

interface ExportFile {
  table?: string | null;
  href: string;
}

interface ExportResponse {
  exportId: string;
  files: ExportFile[];
}

interface ExportPanelProps {
  tables: string[];
  selected: string;
}

export function ExportPanel({ tables, selected }: ExportPanelProps) {
  const [format, setFormat] = useState<"csv" | "tsv">("csv");
  const [source, setSource] = useState<"repo" | "draft">("repo");
  const [target, setTarget] = useState("");
  const [files, setFiles] = useState<ExportFile[]>([]);
  const [hint, setHint] = useState("");

  return (
    <Panel variant="boxed" className="export-panel" data-testid="export-panel" title="导出 CSV / TSV">
      <p>单向生成物，不能导回仓库。</p>
      <label>
        格式
        <select data-testid="export-format" value={format} onChange={(event) => setFormat(event.target.value as "csv" | "tsv")}>
          <option value="csv">CSV</option>
          <option value="tsv">TSV</option>
        </select>
      </label>
      <label>
        来源
        <select data-testid="export-source" value={source} onChange={(event) => setSource(event.target.value as "repo" | "draft")}>
          <option value="repo">仓库</option>
          <option value="draft">草稿</option>
        </select>
      </label>
      <label>
        目标
        <select data-testid="export-target" value={target} onChange={(event) => setTarget(event.target.value)}>
          <option value="">全部列</option>
          <option value="S">S</option>
          <option value="C">C</option>
          <option value="V">V</option>
        </select>
      </label>
      <Button
        data-testid="btn-export"
        onClick={() => {
          void (async () => {
            try {
              const result = await api<ExportResponse>("/api/export", {
                method: "POST",
                body: JSON.stringify({
                  format,
                  source,
                  tables: tables.length ? tables : [selected],
                  targets: target ? [target] : undefined,
                }),
              });
              setFiles(result.files);
              setHint("");
            } catch (error) {
              setHint(error instanceof Error ? error.message : String(error));
            }
          })();
        }}
      >
        导出
      </Button>
      {hint ? <p data-testid="export-hint">{hint}</p> : null}
      <ul data-testid="export-files">
        {files.map((file) => (
          <li key={file.href}>
            <a
              href={file.href}
              data-testid="export-link"
              onClick={(event) => {
                event.preventDefault();
                void (async () => {
                  const token = sessionStorage.getItem("lumio-token");
                  const response = await fetch(file.href, {
                    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                  });
                  const blob = await response.blob();
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = file.href.split("/").pop() ?? "export";
                  link.click();
                  URL.revokeObjectURL(url);
                })();
              }}
            >
              {file.table ?? file.href}
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

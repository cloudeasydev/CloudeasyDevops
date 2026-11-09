import { useEffect, useMemo, useState } from "react";
import { Link } from "@/lib/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Copy, Download, FileCode2, HardDrive, Sparkles, Terminal } from "lucide-react";
import { toast } from "sonner";
import {
  GENERATOR_CATEGORIES,
  defaultFieldValues,
  getTemplate,
  templatesForCategory,
  type GeneratorCategory,
} from "@/lib/devGenerators/templates";
import { api } from "@/lib/api";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

type GenFile = { name: string; content: string };

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DevGeneratorsPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"templates" | "ai">("ai");
  const [category, setCategory] = useState<GeneratorCategory>("dockerfile");
  const templates = useMemo(() => templatesForCategory(category), [category]);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const template = getTemplate(templateId) ?? templates[0];

  const [fields, setFields] = useState<Record<string, string>>(() =>
    template ? defaultFieldValues(template) : {},
  );

  const [prompt, setPrompt] = useState("");
  const [aiFiles, setAiFiles] = useState<GenFile[]>([]);
  const [aiFileIndex, setAiFileIndex] = useState(0);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [freeModel, setFreeModel] = useState("");

  const { data: config } = useQuery({
    queryKey: ["dev-gen-config"],
    queryFn: () =>
      api<{ openRouter: boolean; model: string; freeOnly: boolean; freeModels: string[]; driveSave: boolean }>(
        "/api/dev-generators/config",
      ),
  });

  useEffect(() => {
    if (!config) return;
    setFreeModel((prev) => {
      if (prev && config.freeModels.includes(prev)) return prev;
      return config.model || config.freeModels[0] || "openrouter/free";
    });
  }, [config]);

  const { data: history } = useQuery({
    queryKey: ["dev-gen-history"],
    queryFn: () =>
      api<{
        items: Array<{ id: string; prompt: string; fileCount: number; createdAt: string }>;
      }>("/api/dev-generators/history"),
    enabled: mode === "ai",
  });

  const [templateFileIndex, setTemplateFileIndex] = useState(0);

  const selectTemplate = (id: string) => {
    setTemplateId(id);
    setTemplateFileIndex(0);
    const t = getTemplate(id);
    if (t) setFields(defaultFieldValues(t));
  };

  const selectCategory = (id: GeneratorCategory) => {
    setCategory(id);
    setTemplateFileIndex(0);
    const list = templatesForCategory(id);
    const first = list[0];
    if (first) {
      setTemplateId(first.id);
      setFields(defaultFieldValues(first));
    }
  };

  const templateFiles = useMemo(() => {
    if (!template) return [{ name: "output.txt", content: "" }];
    if (template.generateFiles) {
      try {
        return template.generateFiles(fields);
      } catch {
        return [{ name: template.filename, content: "# Generation failed — check your inputs." }];
      }
    }
    try {
      return [{ name: template.filename, content: template.generate(fields) }];
    } catch {
      return [{ name: template.filename, content: "# Generation failed — check your inputs." }];
    }
  }, [template, fields]);

  const templateOutput = templateFiles[templateFileIndex]?.content ?? "";
  const templateFilename = templateFiles[templateFileIndex]?.name ?? template?.filename ?? "output.txt";

  const aiOutput = aiFiles[aiFileIndex]?.content ?? "";
  const aiFilename = aiFiles[aiFileIndex]?.name ?? "output.txt";

  const generateAi = useMutation({
    mutationFn: () =>
      api<{ id: string; files: GenFile[]; model: string }>("/api/dev-generators/generate", {
        method: "POST",
        body: JSON.stringify({ prompt, category, model: freeModel || undefined }),
      }),
    onSuccess: (data) => {
      setAiFiles(data.files);
      setAiFileIndex(0);
      setHistoryId(data.id);
      qc.invalidateQueries({ queryKey: ["dev-gen-history"] });
      toast.success(`Generated ${data.files.length} file(s) via ${data.model}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveToDrive = useMutation({
    mutationFn: () =>
      api<{ folderName: string; files: { name: string }[] }>("/api/dev-generators/save-to-drive", {
        method: "POST",
        body: JSON.stringify({ historyId: historyId ?? undefined, files: aiFiles }),
      }),
    onSuccess: (data) => {
      toast.success(`Saved to Personal Drive → ${data.folderName}`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const loadHistory = useMutation({
    mutationFn: (id: string) => api<{ id: string; files: GenFile[] }>(`/api/dev-generators/history/${id}`),
    onSuccess: (data) => {
      setAiFiles(data.files);
      setAiFileIndex(0);
      setHistoryId(data.id);
      toast.success("Loaded saved generation");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copyOutput = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  if (mode === "templates" && !template) {
    return <div className="text-sm text-muted">No templates in this category.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <FileCode2 className="h-7 w-7 text-accent" />
            Dev Generators
          </h1>
          <p className="mt-1 text-sm text-muted">
            Built-in templates or describe what you need — OpenRouter generates files and saves history; push to Personal
            Drive when ready.
          </p>
        </div>
        <div className="flex rounded-lg border border-line p-0.5">
          <button
            type="button"
            onClick={() => setMode("ai")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              mode === "ai" ? "bg-accent text-white" : "text-muted hover-surface",
            )}
          >
            <Sparkles className="h-3.5 w-3.5" /> AI (OpenRouter)
          </button>
          <button
            type="button"
            onClick={() => setMode("templates")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium",
              mode === "templates" ? "bg-inset text-foreground" : "text-muted hover-surface",
            )}
          >
            Templates
          </button>
        </div>
      </div>

      {mode === "ai" && (
        <Card className="space-y-4 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3 text-xs text-muted">
            <div className="space-y-2">
              <Field label="Free model (recommended: openrouter/free)">
                <Select
                  value={freeModel}
                  onChange={(e) => setFreeModel(e.target.value)}
                  disabled={!config?.freeModels?.length}
                >
                  {(config?.freeModels ?? []).map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              {config?.openRouter ? (
                <span className="text-emerald-500">Connected · free tier only</span>
              ) : (
                <span className="text-amber-500">Add OPENROUTER_API_KEY or API_KEY (sk-or-v1…) in backend/.env</span>
              )}
            </div>
            {config?.driveSave && (
              <Link to="/drive" className="inline-flex items-center gap-1 text-accent-text hover:underline">
                <HardDrive className="h-3.5 w-3.5" /> Personal Drive
              </Link>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {GENERATOR_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={cn(
                  "rounded-full border border-line px-3 py-1 text-xs",
                  category === c.id ? "border-accent bg-accent/10 text-foreground" : "text-muted hover-surface",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          <Field label="Describe what to generate">
            <Textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Multi-stage Dockerfile for Node 20 Express app on port 3000, plus .dockerignore and a deploy.sh script"
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!config?.openRouter || prompt.trim().length < 3 || generateAi.isPending}
              onClick={() => generateAi.mutate()}
            >
              <Sparkles className="h-4 w-4" /> {generateAi.isPending ? "Generating…" : "Generate"}
            </Button>
            <Button
              variant="outline"
              disabled={!aiFiles.length || saveToDrive.isPending || !config?.driveSave}
              onClick={() => saveToDrive.mutate()}
              title={config?.driveSave ? undefined : "Configure S3 for Personal Drive"}
            >
              <HardDrive className="h-4 w-4" /> Save to Drive
            </Button>
          </div>

          {aiFiles.length > 0 && (
            <Card className="flex min-h-[320px] flex-col overflow-hidden p-0">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                {aiFiles.map((f, i) => (
                  <button
                    key={f.name + i}
                    type="button"
                    onClick={() => setAiFileIndex(i)}
                    className={cn(
                      "rounded-md px-2 py-1 font-mono text-[11px]",
                      aiFileIndex === i ? "bg-accent/15 text-foreground" : "text-muted hover-surface",
                    )}
                  >
                    {f.name}
                  </button>
                ))}
                <div className="ml-auto flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => void copyOutput(aiOutput)}>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadText(aiOutput, aiFilename)}>
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto border-t border-line bg-code p-4 font-mono text-xs leading-relaxed text-code-fg">
                {aiOutput}
              </pre>
            </Card>
          )}

          {history?.items?.length ? (
            <div>
              <div className="mb-2 text-xs font-medium text-muted">Recent (saved in your account)</div>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {history.items.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => loadHistory.mutate(h.id)}
                    className="flex w-full items-center justify-between rounded-md border border-line px-3 py-2 text-left text-xs hover-surface"
                  >
                    <span className="line-clamp-1 pr-2">{h.prompt}</span>
                    <span className="shrink-0 text-faint">
                      {h.fileCount} files · {formatDistanceToNow(new Date(h.createdAt), { addSuffix: true })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      )}

      {mode === "templates" && template && (
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <Card className="p-2 lg:sticky lg:top-20 lg:self-start">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-faint">Categories</div>
            <nav className="space-y-0.5">
              {GENERATOR_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCategory(c.id)}
                  className={cn(
                    "block w-full rounded-md px-2 py-2 text-left text-sm transition hover-surface",
                    category === c.id && "nav-active font-medium",
                  )}
                >
                  <div>{c.label}</div>
                  <div className="text-[10px] text-muted">{c.hint}</div>
                </button>
              ))}
            </nav>
          </Card>

          <div className="grid min-h-[480px] gap-4 lg:grid-cols-[minmax(0,260px)_1fr]">
            <Card className="flex flex-col overflow-hidden p-0">
              <div className="border-b border-line px-3 py-2 text-xs font-medium text-muted">Templates</div>
              <div className="max-h-[320px] overflow-y-auto lg:max-h-none lg:flex-1">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectTemplate(t.id)}
                    className={cn(
                      "block w-full border-b border-line px-3 py-2.5 text-left text-sm hover-surface",
                      templateId === t.id && "bg-accent/10 text-foreground",
                    )}
                  >
                    <div className="font-medium">{t.title}</div>
                    <div className="text-[11px] text-muted">{t.description}</div>
                  </button>
                ))}
              </div>
            </Card>

            <div className="flex min-h-0 flex-col gap-4">
              {template.fields.length > 0 && (
                <Card className="grid gap-3 p-4 sm:grid-cols-2">
                  {template.fields.map((f) => (
                    <Field key={f.key} label={f.label}>
                      <Input
                        value={fields[f.key] ?? f.defaultValue}
                        placeholder={f.placeholder}
                        onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    </Field>
                  ))}
                </Card>
              )}

              <Card className="flex min-h-[360px] flex-1 flex-col overflow-hidden p-0">
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                  {templateFiles.length > 1 ? (
                    templateFiles.map((f, i) => (
                      <button
                        key={f.name + i}
                        type="button"
                        onClick={() => setTemplateFileIndex(i)}
                        className={cn(
                          "rounded-md px-2 py-1 font-mono text-[11px]",
                          templateFileIndex === i ? "bg-accent/15 text-foreground" : "text-muted hover-surface",
                        )}
                      >
                        {f.name}
                      </button>
                    ))
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-muted">
                      <Terminal className="h-3.5 w-3.5" />
                      <span className="font-mono text-foreground">{templateFilename}</span>
                    </div>
                  )}
                  <div className="ml-auto flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void copyOutput(templateOutput)}>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => downloadText(templateOutput, templateFilename)}>
                      <Download className="h-3.5 w-3.5" /> Download
                    </Button>
                  </div>
                </div>
                <pre className="min-h-0 flex-1 overflow-auto border-t border-line bg-code p-4 font-mono text-xs leading-relaxed text-code-fg">
                  {templateOutput}
                </pre>
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

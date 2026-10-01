import { env } from "../config/env.js";
import { AppError } from "./errors.js";
import { logComponent } from "./logger.js";

const log = logComponent("openrouter");

/** Auto-picks an available free model on OpenRouter (recommended). */
export const OPENROUTER_FREE_ROUTER = "openrouter/free";

/** Curated fallbacks when a specific :free id has no endpoints. */
export const OPENROUTER_FREE_MODELS = [
  OPENROUTER_FREE_ROUTER,
  "meta-llama/llama-3.2-3b-instruct:free",
  "google/gemma-2-9b-it:free",
  "qwen/qwen-2.5-7b-instruct:free",
  "deepseek/deepseek-r1-distill-llama-70b:free",
] as const;

const DEFAULT_FREE_MODEL = OPENROUTER_FREE_ROUTER;

let cachedFreeModelIds: string[] | null = null;
let cacheExpiresAt = 0;

function resolveOpenRouterApiKey() {
  const dedicated = env.OPENROUTER_API_KEY?.trim();
  if (dedicated) return dedicated;
  const legacy = process.env.API_KEY?.trim();
  if (legacy?.startsWith("sk-or-")) return legacy;
  return "";
}

export function isOpenRouterConfigured() {
  return Boolean(resolveOpenRouterApiKey());
}

export function isAllowedFreeModel(model: string) {
  const id = model.trim();
  if (id === OPENROUTER_FREE_ROUTER) return true;
  return id.endsWith(":free");
}

/** Resolves model id — only free OpenRouter models (never paid). */
export function resolveOpenRouterModel(requested?: string): string {
  const candidate = requested?.trim() || env.OPENROUTER_MODEL.trim() || DEFAULT_FREE_MODEL;
  if (isAllowedFreeModel(candidate)) return candidate;
  if (requested) {
    throw new AppError(400, "Only free models allowed: openrouter/free or any model id ending with :free");
  }
  log.warn("openrouter_paid_model_blocked", { configured: candidate, using: DEFAULT_FREE_MODEL });
  return DEFAULT_FREE_MODEL;
}

export function openRouterModel() {
  return resolveOpenRouterModel();
}

/** Live list from OpenRouter (ids ending in :free), plus openrouter/free router. */
export async function fetchOpenRouterFreeModelIds(): Promise<string[]> {
  if (cachedFreeModelIds && Date.now() < cacheExpiresAt) return cachedFreeModelIds;

  const key = resolveOpenRouterApiKey();
  const fallback = [...OPENROUTER_FREE_MODELS];

  if (!key) {
    cachedFreeModelIds = fallback;
    cacheExpiresAt = Date.now() + 60_000;
    return fallback;
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: Array<{ id?: string; pricing?: { prompt?: string; completion?: string } }>;
    };
    if (!res.ok || !body.data?.length) {
      cachedFreeModelIds = fallback;
      cacheExpiresAt = Date.now() + 60_000;
      return fallback;
    }

    const freeIds = body.data
      .filter((m) => {
        const id = m.id ?? "";
        if (id === OPENROUTER_FREE_ROUTER) return true;
        if (!id.endsWith(":free")) return false;
        const p = m.pricing?.prompt;
        return p === "0" || p === "0.0";
      })
      .map((m) => m.id!)
      .filter(Boolean);

    const merged = [OPENROUTER_FREE_ROUTER, ...freeIds.filter((id) => id !== OPENROUTER_FREE_ROUTER)];
    const unique = [...new Set(merged)];
    cachedFreeModelIds = unique.length > 1 ? unique : fallback;
    cacheExpiresAt = Date.now() + 15 * 60_000;
    return cachedFreeModelIds;
  } catch (err) {
    log.warn("openrouter_models_fetch_failed", { err });
    cachedFreeModelIds = fallback;
    cacheExpiresAt = Date.now() + 60_000;
    return fallback;
  }
}

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

function isRetryableModelError(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("no endpoints") ||
    m.includes("not found") ||
    m.includes("does not exist") ||
    m.includes("no available") ||
    m.includes("provider returned error")
  );
}

export async function openRouterChat(messages: ChatMessage[], opts?: { maxTokens?: number; model?: string }) {
  const key = resolveOpenRouterApiKey();
  if (!key) {
    throw new AppError(
      503,
      "OpenRouter is not configured. Set OPENROUTER_API_KEY (or API_KEY with sk-or-v1…) in backend/.env",
    );
  }

  const model = resolveOpenRouterModel(opts?.model);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.APP_URL,
      "X-Title": "CloudEasy Dev Generators",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: opts?.maxTokens ?? 4096,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!res.ok) {
    const msg = body.error?.message ?? `OpenRouter request failed (${res.status})`;
    log.warn("openrouter_error", { status: res.status, model, msg });
    throw new AppError(res.status === 429 ? 429 : 502, msg);
  }

  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new AppError(502, "OpenRouter returned an empty response");
  return content;
}

async function openRouterChatWithFallback(messages: ChatMessage[], preferredModel: string) {
  const live = await fetchOpenRouterFreeModelIds();
  const candidates = [preferredModel, OPENROUTER_FREE_ROUTER, ...live, ...OPENROUTER_FREE_MODELS].filter(
    isAllowedFreeModel,
  );

  const unique = [...new Set(candidates)];
  let lastMessage = "All free models unavailable. Wait a minute (rate limit) or try openrouter/free.";

  for (const model of unique.slice(0, 8)) {
    try {
      const content = await openRouterChat(messages, { model, maxTokens: 4096 });
      if (model !== preferredModel) {
        log.info("openrouter_model_fallback_ok", { preferred: preferredModel, used: model });
      }
      return { content, model };
    } catch (err) {
      const msg = err instanceof AppError ? err.message : String(err);
      lastMessage = msg;
      if (err instanceof AppError && err.status === 429) throw err;
      if (isRetryableModelError(msg) || msg.includes("502")) {
        log.warn("openrouter_try_next_model", { model, msg });
        continue;
      }
      throw err;
    }
  }

  throw new AppError(502, lastMessage);
}

export type GeneratedFile = { name: string; content: string };

function filenameFromLang(lang: string, index: number) {
  const l = lang.toLowerCase();
  if (l === "dockerfile" || l === "docker") return "Dockerfile";
  if (l === "yaml" || l === "yml") return index === 0 ? "deployment.yaml" : `manifest-${index + 1}.yaml`;
  if (l === "kubernetes" || l === "k8s") return index === 0 ? "deployment.yaml" : `k8s-${index + 1}.yaml`;
  if (l === "bash" || l === "sh" || l === "shell") return `script-${index + 1}.sh`;
  if (l === "ignore") return ".dockerignore";
  if (l === "gitignore") return ".gitignore";
  if (l.includes(".")) return l;
  return `generated-${index + 1}.${l || "txt"}`;
}

export function parseGeneratedFiles(raw: string): GeneratedFile[] {
  let text = raw.trim();
  const jsonFence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (jsonFence?.[1]) text = jsonFence[1].trim();

  try {
    const parsed = JSON.parse(text) as { files?: unknown };
    const files = parsed.files;
    if (Array.isArray(files) && files.length) {
      const out: GeneratedFile[] = [];
      for (const item of files.slice(0, 12)) {
        if (!item || typeof item !== "object") continue;
        const name = String((item as { name?: unknown }).name ?? "").trim();
        const content = String((item as { content?: unknown }).content ?? "");
        if (!name || !content.trim()) continue;
        if (content.length > 120_000) throw new AppError(400, `File ${name} is too large`);
        out.push({ name: name.slice(0, 200), content });
      }
      if (out.length) return out;
    }
  } catch {
    /* fall through */
  }

  const blocks = [...raw.matchAll(/```(\w+)?\s*([\s\S]*?)```/g)];
  if (blocks.length) {
    const out = blocks
      .map((m, i) => ({
        name: filenameFromLang(m[1] ?? "txt", i),
        content: m[2].trim(),
      }))
      .filter((f) => f.content.length > 0);
    if (out.length) return out;
  }

  if (raw.trim().length > 30) {
    return [{ name: "generated.txt", content: raw.trim() }];
  }

  throw new AppError(502, "Could not parse AI output. Try a shorter, clearer prompt.");
}

const SYSTEM_PROMPT = `You are a senior DevOps engineer. Generate files for the user's request.

You MUST respond with valid JSON only (no markdown wrapping the whole response):
{"files":[{"name":"Dockerfile","content":"line1\\nline2"}]}

Include every file they need (Dockerfile, .dockerignore, scripts, docker-compose, CI/CD pipelines).
Supported pipeline formats when asked: GitHub Actions (.github/workflows/*.yml), Google Cloud Build (cloudbuild.yaml), Jenkins (Jenkinsfile), GitLab CI, Azure Pipelines, CircleCI, Bitbucket Pipelines, AWS CodeBuild (buildspec.yml), Drone (.drone.yml).
Use \\n for newlines inside content strings. Use placeholder secrets only.`;

export async function generateDevFilesFromPrompt(prompt: string, category?: string, model?: string) {
  const userText = category ? `Category: ${category}\n\nRequest:\n${prompt}` : prompt;
  const preferred = resolveOpenRouterModel(model);
  const { content, model: usedModel } = await openRouterChatWithFallback(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userText.slice(0, 8000) },
    ],
    preferred,
  );
  return { files: parseGeneratedFiles(content), model: usedModel };
}

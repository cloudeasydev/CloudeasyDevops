import dns from "node:dns";
import net from "node:net";

dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily(false);

export async function withDbRetry<T>(fn: () => Promise<T>, label = "db") {
  let last: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      const cause = (err as { cause?: unknown })?.cause;
      const text = [err instanceof Error ? err.message : String(err), cause instanceof Error ? cause.message : cause]
        .filter(Boolean)
        .join(" | ");
      const retryable = /ETIMEDOUT|ENETUNREACH|ECONNRESET|timeout|ECONNREFUSED|PROTOCOL/i.test(text);
      if (!retryable || attempt === 5) throw err;
      const wait = attempt * 1500;
      const { log } = await import("../lib/logger.js");
      log.warn("db_retry", { component: "network", label, attempt, waitMs: wait, error: text });
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

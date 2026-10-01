import type { Request } from "express";
import { db } from "../db/index.js";
import { auditLogs } from "../db/schema.js";

export async function writeAudit(opts: {
  req?: Request;
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  projectId?: string | null;
  status?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}) {
  await db.insert(auditLogs).values({
    userId: opts.userId ?? opts.req?.user?.id ?? null,
    action: opts.action,
    resource: opts.resource,
    resourceId: opts.resourceId ?? null,
    projectId: opts.projectId ?? null,
    ipAddress: opts.req?.ip ?? null,
    sessionId: opts.req?.sessionRow?.id ?? null,
    status: opts.status ?? "success",
    before: opts.before ?? null,
    after: opts.after ?? null,
    metadata: opts.metadata ?? null,
  });
}

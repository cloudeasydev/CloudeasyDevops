import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/index.js";
import { insertReturning, updateReturning } from "../../db/mysqlHelpers.js";
import { secretAccessLogs, secretVersions, secrets } from "../../db/schema.js";
import { writeAudit } from "../../lib/audit.js";
import { decrypt, encrypt, maskSecret } from "../../lib/crypto.js";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { paginated, parsePagination, sqlCountInt } from "../../lib/pagination.js";
import { hasPermission } from "../../lib/rbac.js";
import { asyncHandler } from "../../middleware/errorHandler.js";
import { requirePermission } from "../../middleware/auth.js";
import { getSecretProvider } from "../../providers/secrets/index.js";
import { assertCanAccessSecret } from "../../lib/secretAccess.js";
import { getOrCreatePersonalVaultProject } from "../../lib/personalVault.js";
import { routeParam } from "../../lib/routeParam.js";

const createSchema = z.object({
  projectId: z.string().uuid(),
  environment: z.enum(["development", "staging", "production"]),
  service: z.string().default("app"),
  key: z.string().min(1).max(160),
  value: z.string().min(1),
  provider: z.enum(["internal", "gcp", "aws", "azure"]).default("internal"),
  providerPath: z.string().optional(),
  description: z.string().optional(),
});

export const secretsRouter = Router();

const vaultCreateSchema = z.object({
  name: z.string().min(1).max(160),
  value: z.string().min(1),
});

secretsRouter.get(
  "/vault",
  requirePermission("secret.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const vault = await getOrCreatePersonalVaultProject(req.user!.id);
    const where = and(
      eq(secrets.projectId, vault.id),
      eq(secrets.service, "vault"),
      eq(secrets.disabled, false),
    );
    const rows = await db.select().from(secrets).where(where).orderBy(desc(secrets.updatedAt)).limit(pageSize).offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(secrets).where(where);
    res.json(
      paginated(
        rows.map((s) => ({
          id: s.id,
          name: s.key,
          updatedAt: s.updatedAt,
          encrypted: true,
        })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);

secretsRouter.post(
  "/vault",
  requirePermission("secret.manage"),
  asyncHandler(async (req, res) => {
    const data = vaultCreateSchema.parse(req.body);
    const vault = await getOrCreatePersonalVaultProject(req.user!.id);
    const name = data.name.trim();
    const [duplicate] = await db
      .select({ id: secrets.id })
      .from(secrets)
      .where(
        and(
          eq(secrets.projectId, vault.id),
          eq(secrets.service, "vault"),
          eq(secrets.key, name),
          eq(secrets.disabled, false),
        ),
      )
      .limit(1);
    if (duplicate) throw new ConflictError("A secret with this name already exists");

    const provider = getSecretProvider("internal");
    const path = `${vault.id}/development/vault/${name}`;
    await provider.put(path, data.value);

    const row = await insertReturning(secrets, {
      projectId: vault.id,
      environment: "development",
      service: "vault",
      key: name,
      provider: "internal",
      providerPath: path,
      currentVersion: 1,
    });

    await db.insert(secretVersions).values({
      secretId: row.id,
      version: 1,
      valueEnc: encrypt(data.value),
      createdBy: req.user!.id,
    });

    await writeAudit({
      req,
      action: "secret.create",
      resource: "secret",
      resourceId: row.id,
      projectId: row.projectId,
      after: { name: row.key },
    });
    res.status(201).json({ id: row.id, name: row.key, updatedAt: row.updatedAt, encrypted: true });
  }),
);

secretsRouter.get(
  "/",
  requirePermission("secret.view"),
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query as Record<string, unknown>);
    const filters = [];
    if (req.query.projectId) filters.push(eq(secrets.projectId, String(req.query.projectId)));
    if (req.query.environment) filters.push(eq(secrets.environment, req.query.environment as never));
    if (req.query.service) filters.push(eq(secrets.service, String(req.query.service)));
    const where = filters.length ? and(...filters) : undefined;
    const rows = await db.select().from(secrets).where(where).orderBy(desc(secrets.updatedAt)).limit(pageSize).offset(offset);
    const [{ total }] = await db.select({ total: sqlCountInt }).from(secrets).where(where);
    res.json(
      paginated(
        rows.map((s) => ({
          ...s,
          masked: true,
          value: undefined,
        })),
        total,
        page,
        pageSize,
      ),
    );
  }),
);

secretsRouter.post(
  "/",
  requirePermission("secret.manage"),
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body);
    const provider = getSecretProvider(data.provider);
    const stored = await provider.put(data.providerPath ?? `${data.projectId}/${data.environment}/${data.service}/${data.key}`, data.value);

    const row = await insertReturning(secrets, {
      projectId: data.projectId,
      environment: data.environment,
      service: data.service,
      key: data.key,
      provider: data.provider,
      providerPath: stored.path,
      description: data.description,
      currentVersion: 1,
    });

    await db.insert(secretVersions).values({
      secretId: row.id,
      version: 1,
      valueEnc: data.provider === "internal" ? encrypt(data.value) : null,
      createdBy: req.user!.id,
    });

    await writeAudit({
      req,
      action: "secret.create",
      resource: "secret",
      resourceId: row.id,
      projectId: row.projectId,
      after: { key: row.key, environment: row.environment },
    });
    res.status(201).json({ ...row, value: maskSecret(data.value) });
  }),
);

secretsRouter.get(
  "/:id",
  requirePermission("secret.view"),
  asyncHandler(async (req, res) => {
    const [row] = await db.select().from(secrets).where(eq(secrets.id, routeParam(req.params.id)));
    if (!row || row.disabled) throw new NotFoundError("Secret not found");
    await assertCanAccessSecret(req.user!.id, row);
    const versions = await db.select().from(secretVersions).where(eq(secretVersions.secretId, row.id)).orderBy(desc(secretVersions.version));
    res.json({
      ...row,
      versions: versions.map((v) => ({ id: v.id, version: v.version, createdAt: v.createdAt, createdBy: v.createdBy })),
    });
  }),
);

secretsRouter.post(
  "/:id/reveal",
  requirePermission("secret.reveal"),
  asyncHandler(async (req, res) => {
    if (req.body?.confirm !== true) throw new ForbiddenError("Confirmation required");
    const [row] = await db.select().from(secrets).where(eq(secrets.id, routeParam(req.params.id)));
    if (!row || row.disabled) throw new NotFoundError("Secret not found");
    await assertCanAccessSecret(req.user!.id, row);

    const provider = getSecretProvider(row.provider);
    let value = "";
    if (row.provider === "internal") {
      const [ver] = await db
        .select()
        .from(secretVersions)
        .where(and(eq(secretVersions.secretId, row.id), eq(secretVersions.version, row.currentVersion)));
      if (!ver?.valueEnc) throw new NotFoundError("Secret value missing");
      value = decrypt(ver.valueEnc);
    } else {
      value = await provider.get(row.providerPath ?? "");
    }

    await db.insert(secretAccessLogs).values({
      secretId: row.id,
      userId: req.user!.id,
      action: "reveal",
      ipAddress: req.ip,
    });
    await writeAudit({ req, action: "secret.reveal", resource: "secret", resourceId: row.id, projectId: row.projectId });
    res.json({ value });
  }),
);

secretsRouter.post(
  "/:id/rotate",
  requirePermission("secret.manage"),
  asyncHandler(async (req, res) => {
    const data = z.object({ value: z.string().min(1) }).parse(req.body);
    const [row] = await db.select().from(secrets).where(eq(secrets.id, routeParam(req.params.id)));
    if (!row || row.disabled) throw new NotFoundError("Secret not found");
    await assertCanAccessSecret(req.user!.id, row);
    const next = row.currentVersion + 1;
    const provider = getSecretProvider(row.provider);
    await provider.put(row.providerPath ?? "", data.value);
    await db.insert(secretVersions).values({
      secretId: row.id,
      version: next,
      valueEnc: row.provider === "internal" ? encrypt(data.value) : null,
      createdBy: req.user!.id,
    });
    await db
      .update(secrets)
      .set({ currentVersion: next, rotatedAt: new Date(), updatedAt: new Date() })
      .where(eq(secrets.id, row.id));
    await writeAudit({ req, action: "secret.rotate", resource: "secret", resourceId: row.id, projectId: row.projectId });
    res.json({ ok: true, version: next });
  }),
);

secretsRouter.delete(
  "/:id",
  requirePermission("secret.manage"),
  asyncHandler(async (req, res) => {
    const [existing] = await db.select().from(secrets).where(eq(secrets.id, routeParam(req.params.id)));
    if (!existing || existing.disabled) throw new NotFoundError("Secret not found");
    await assertCanAccessSecret(req.user!.id, existing);
    const row = (await updateReturning(
      secrets,
      { disabled: true, updatedAt: new Date() },
      eq(secrets.id, routeParam(req.params.id)),
    ))!;
    await writeAudit({ req, action: "secret.disable", resource: "secret", resourceId: row.id, projectId: row.projectId });
    res.json({ ok: true });
  }),
);

void hasPermission;
void sql;

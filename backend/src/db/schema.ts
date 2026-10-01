import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  boolean,
  char,
  datetime,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const environmentEnum = mysqlEnum("environment", [
  "development",
  "staging",
  "production",
]);

export const projectStatusEnum = mysqlEnum("project_status", [
  "active",
  "paused",
  "archived",
]);

export const cloudProviderEnum = mysqlEnum("cloud_provider", [
  "gcp",
  "aws",
  "azure",
  "digitalocean",
  "hostinger",
  "other",
]);

export const serverStatusEnum = mysqlEnum("server_status", [
  "online",
  "offline",
  "warning",
  "unknown",
]);

export const secretProviderEnum = mysqlEnum("secret_provider", [
  "internal",
  "gcp",
  "aws",
  "azure",
]);

export const dnsProviderEnum = mysqlEnum("dns_provider", [
  "cloudflare",
  "route53",
  "google_cloud_dns",
  "namecheap",
  "godaddy",
  "manual",
]);

export const dnsRecordTypeEnum = mysqlEnum("dns_record_type", [
  "A",
  "AAAA",
  "CNAME",
  "MX",
  "TXT",
  "NS",
  "SRV",
  "CAA",
]);

export const sslStatusEnum = mysqlEnum("ssl_status", [
  "healthy",
  "warning",
  "critical",
  "expired",
  "unknown",
]);

export const invitationStatusEnum = mysqlEnum("invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

export const userStatusEnum = mysqlEnum("user_status", [
  "active",
  "suspended",
  "invited",
]);

export const sshSessionStatusEnum = mysqlEnum("ssh_session_status", [
  "connecting",
  "active",
  "closed",
  "failed",
]);

export const deploymentStatusEnum = mysqlEnum("deployment_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

export const healthStatusEnum = mysqlEnum("health_status", [
  "healthy",
  "warning",
  "critical",
  "unknown",
]);

export const cicdProviderEnum = mysqlEnum("cicd_provider", [
  "github_actions",
  "gitlab_ci",
  "circleci",
  "jenkins",
  "other",
]);

const timestamps = {
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
};

export const users = mysqlTable(
  "users",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    email: varchar("email", { length: 320 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    passwordHash: text("password_hash"),
    avatarUrl: text("avatar_url"),
    status: userStatusEnum.notNull().default("active"),
    roleId: char("role_id", { length: 36 }),
    isOwner: boolean("is_owner").notNull().default(false),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecretEnc: text("mfa_secret_enc"),
    lastLoginAt: datetime("last_login_at", { mode: "date", fsp: 3 }),
    timezone: varchar("timezone", { length: 64 }).default("UTC"),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export const roles = mysqlTable(
  "roles",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    key: varchar("key", { length: 64 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    description: text("description"),
    isSystem: boolean("is_system").notNull().default(true),
    permissions: json("permissions").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => [uniqueIndex("roles_key_idx").on(t.key)],
);

export const sessions = mysqlTable(
  "sessions",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
    revokedAt: datetime("revoked_at", { mode: "date", fsp: 3 }),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_user_idx").on(t.userId),
  ],
);

export const otpChallenges = mysqlTable(
  "otp_challenges",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    email: varchar("email", { length: 320 }).notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: int("attempts").notNull().default(0),
    consumedAt: datetime("consumed_at", { mode: "date", fsp: 3 }),
    expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
  },
  (t) => [index("otp_email_idx").on(t.email)],
);

export const loginAudits = mysqlTable(
  "login_audits",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    userId: char("user_id", { length: 36 }),
    email: varchar("email", { length: 320 }).notNull(),
    action: varchar("action", { length: 40 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: text("user_agent"),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
  },
  (t) => [index("login_audits_email_idx").on(t.email)],
);

export const passwordResets = mysqlTable("password_resets", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  userId: char("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
});

export const projects = mysqlTable(
  "projects",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    name: varchar("name", { length: 160 }).notNull(),
    code: varchar("code", { length: 32 }).notNull(),
    description: text("description"),
    client: varchar("client", { length: 160 }),
    ownerId: char("owner_id", { length: 36 }).references(() => users.id),
    environment: environmentEnum.notNull().default("development"),
    status: projectStatusEnum.notNull().default("active"),
    tags: json("tags").$type<string[]>().notNull().default([]),
    cloudProvider: cloudProviderEnum,
    cloudProjectId: varchar("cloud_project_id", { length: 160 }),
    region: varchar("region", { length: 80 }),
    accountRef: varchar("account_ref", { length: 160 }),
    repoProvider: varchar("repo_provider", { length: 40 }),
    repoUrl: text("repo_url"),
    defaultBranch: varchar("default_branch", { length: 80 }).default("main"),
    deploymentBranch: varchar("deployment_branch", { length: 80 }),
    cicdProvider: cicdProviderEnum,
    metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
    archivedAt: datetime("archived_at", { mode: "date", fsp: 3 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("projects_code_idx").on(t.code),
    index("projects_env_idx").on(t.environment),
    index("projects_status_idx").on(t.status),
  ],
);

export const projectMembers = mysqlTable(
  "project_members",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    projectId: char("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleKey: varchar("role_key", { length: 64 }).notNull().default("developer"),
    environmentAccess: json("environment_access").$type<string[]>().notNull().default(["development", "staging"]),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
  },
  (t) => [uniqueIndex("project_members_unique").on(t.projectId, t.userId)],
);

export const invitations = mysqlTable("invitations", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  email: varchar("email", { length: 320 }).notNull(),
  roleId: char("role_id", { length: 36 })
    .notNull()
    .references(() => roles.id),
  invitedBy: char("invited_by", { length: 36 }).references(() => users.id),
  projectIds: json("project_ids").$type<string[]>().notNull().default([]),
  permissions: json("permissions").$type<string[]>().notNull().default([]),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  status: invitationStatusEnum.notNull().default("pending"),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
  acceptedAt: datetime("accepted_at", { mode: "date", fsp: 3 }),
  ...timestamps,
});

export const servers = mysqlTable(
  "servers",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    projectId: char("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    hostname: varchar("hostname", { length: 255 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }).notNull(),
    sshPort: int("ssh_port").notNull().default(22),
    username: varchar("username", { length: 80 }).notNull().default("ubuntu"),
    os: varchar("os", { length: 80 }),
    cloudProvider: cloudProviderEnum,
    region: varchar("region", { length: 80 }),
    environment: environmentEnum.notNull(),
    serverType: varchar("server_type", { length: 80 }),
    cpu: varchar("cpu", { length: 40 }),
    ram: varchar("ram", { length: 40 }),
    disk: varchar("disk", { length: 40 }),
    sshKeyRef: varchar("ssh_key_ref", { length: 160 }),
    sshKeyEnc: text("ssh_key_enc"),
    status: serverStatusEnum.notNull().default("unknown"),
    lastConnectedAt: datetime("last_connected_at", { mode: "date", fsp: 3 }),
    tags: json("tags").$type<string[]>().notNull().default([]),
    notes: text("notes"),
    archivedAt: datetime("archived_at", { mode: "date", fsp: 3 }),
    ...timestamps,
  },
  (t) => [
    index("servers_project_idx").on(t.projectId),
    index("servers_status_idx").on(t.status),
  ],
);

export const kubernetesClusters = mysqlTable("kubernetes_clusters", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  projectId: char("project_id", { length: 36 })
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  provider: cloudProviderEnum,
  region: varchar("region", { length: 80 }),
  environment: environmentEnum.notNull(),
  version: varchar("version", { length: 40 }),
  nodeCount: int("node_count").default(0),
  endpoint: text("endpoint"),
  status: healthStatusEnum.notNull().default("unknown"),
  namespaceDefault: varchar("namespace_default", { length: 80 }).default("default"),
  tags: json("tags").$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const databases = mysqlTable("databases", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  projectId: char("project_id", { length: 36 })
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  engine: varchar("engine", { length: 40 }).notNull(),
  version: varchar("version", { length: 40 }),
  host: varchar("host", { length: 255 }),
  port: int("port"),
  environment: environmentEnum.notNull(),
  provider: cloudProviderEnum,
  region: varchar("region", { length: 80 }),
  instanceClass: varchar("instance_class", { length: 80 }),
  storageGb: int("storage_gb"),
  status: healthStatusEnum.notNull().default("unknown"),
  haEnabled: boolean("ha_enabled").notNull().default(false),
  tags: json("tags").$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const storageResources = mysqlTable("storage_resources", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  projectId: char("project_id", { length: 36 })
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 160 }).notNull(),
  kind: varchar("kind", { length: 40 }).notNull(),
  provider: cloudProviderEnum,
  region: varchar("region", { length: 80 }),
  environment: environmentEnum.notNull(),
  bucket: varchar("bucket", { length: 255 }),
  sizeGb: int("size_gb"),
  publicAccess: boolean("public_access").notNull().default(false),
  status: healthStatusEnum.notNull().default("unknown"),
  tags: json("tags").$type<string[]>().notNull().default([]),
  ...timestamps,
});

export const infraResources = mysqlTable("infra_resources", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  projectId: char("project_id", { length: 36 })
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 40 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  environment: environmentEnum.notNull(),
  provider: cloudProviderEnum,
  region: varchar("region", { length: 80 }),
  endpoint: text("endpoint"),
  metadata: json("metadata").$type<Record<string, unknown>>().notNull().default({}),
  status: healthStatusEnum.notNull().default("unknown"),
  ...timestamps,
});

export const domains = mysqlTable(
  "domains",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    projectId: char("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    hostname: varchar("hostname", { length: 255 }).notNull(),
    environment: environmentEnum.notNull(),
    registrar: varchar("registrar", { length: 80 }),
    dnsProvider: dnsProviderEnum.default("manual"),
    status: healthStatusEnum.notNull().default("unknown"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [uniqueIndex("domains_hostname_idx").on(t.hostname)],
);

export const dnsRecords = mysqlTable(
  "dns_records",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    domainId: char("domain_id", { length: 36 })
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    projectId: char("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    type: dnsRecordTypeEnum.notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    value: text("value").notNull(),
    ttl: int("ttl").notNull().default(300),
    priority: int("priority"),
    provider: dnsProviderEnum.default("manual"),
    providerRecordId: varchar("provider_record_id", { length: 160 }),
    ...timestamps,
  },
  (t) => [index("dns_records_domain_idx").on(t.domainId)],
);

export const dnsRecordHistory = mysqlTable("dns_record_history", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  recordId: char("record_id", { length: 36 }),
  domainId: char("domain_id", { length: 36 }).notNull(),
  action: varchar("action", { length: 20 }).notNull(),
  before: json("before").$type<Record<string, unknown>>(),
  after: json("after").$type<Record<string, unknown>>(),
  actorId: char("actor_id", { length: 36 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
});

export const secrets = mysqlTable(
  "secrets",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    projectId: char("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: environmentEnum.notNull(),
    service: varchar("service", { length: 80 }).notNull().default("app"),
    key: varchar("key", { length: 160 }).notNull(),
    provider: secretProviderEnum.notNull().default("internal"),
    providerPath: text("provider_path"),
    description: text("description"),
    disabled: boolean("disabled").notNull().default(false),
    currentVersion: int("current_version").notNull().default(1),
    rotatedAt: datetime("rotated_at", { mode: "date", fsp: 3 }),
    ...timestamps,
  },
  (t) => [uniqueIndex("secrets_unique").on(t.projectId, t.environment, t.service, t.key)],
);

export const secretVersions = mysqlTable("secret_versions", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  secretId: char("secret_id", { length: 36 })
    .notNull()
    .references(() => secrets.id, { onDelete: "cascade" }),
  version: int("version").notNull(),
  valueEnc: text("value_enc"),
  createdBy: char("created_by", { length: 36 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
});

export const secretAccessLogs = mysqlTable("secret_access_logs", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  secretId: char("secret_id", { length: 36 })
    .notNull()
    .references(() => secrets.id, { onDelete: "cascade" }),
  userId: char("user_id", { length: 36 }),
  action: varchar("action", { length: 40 }).notNull(),
  ipAddress: varchar("ip_address", { length: 64 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
});

export const deployments = mysqlTable(
  "deployments",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    projectId: char("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    environment: environmentEnum.notNull(),
    version: varchar("version", { length: 80 }),
    commitSha: varchar("commit_sha", { length: 40 }),
    branch: varchar("branch", { length: 80 }),
    status: deploymentStatusEnum.notNull().default("pending"),
    triggeredBy: char("triggered_by", { length: 36 }),
    durationMs: int("duration_ms"),
    logs: text("logs"),
    startedAt: datetime("started_at", { mode: "date", fsp: 3 }),
    finishedAt: datetime("finished_at", { mode: "date", fsp: 3 }),
    ...timestamps,
  },
  (t) => [index("deployments_project_idx").on(t.projectId)],
);

export const sshSessions = mysqlTable(
  "ssh_sessions",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    serverId: char("server_id", { length: 36 })
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    projectId: char("project_id", { length: 36 })
      .notNull()
      .references(() => projects.id),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id),
    status: sshSessionStatusEnum.notNull().default("connecting"),
    ipAddress: varchar("ip_address", { length: 64 }),
    startedAt: datetime("started_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
    endedAt: datetime("ended_at", { mode: "date", fsp: 3 }),
    lastActivityAt: datetime("last_activity_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
    mfaVerified: boolean("mfa_verified").notNull().default(false),
  },
  (t) => [index("ssh_sessions_user_idx").on(t.userId)],
);

export const sshCommandLogs = mysqlTable("ssh_command_logs", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  sessionId: char("session_id", { length: 36 })
    .notNull()
    .references(() => sshSessions.id, { onDelete: "cascade" }),
  command: text("command").notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
});

export const documents = mysqlTable("documents", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  projectId: char("project_id", { length: 36 }).references(() => projects.id, { onDelete: "cascade" }),
  scope: varchar("scope", { length: 40 }).notNull().default("project"),
  category: varchar("category", { length: 80 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 200 }).notNull(),
  content: text("content").notNull().default(""),
  tags: json("tags").$type<string[]>().notNull().default([]),
  version: int("version").notNull().default(1),
  updatedBy: char("updated_by", { length: 36 }),
  ...timestamps,
});

export const documentVersions = mysqlTable("document_versions", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  documentId: char("document_id", { length: 36 })
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  version: int("version").notNull(),
  content: text("content").notNull(),
  updatedBy: char("updated_by", { length: 36 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
});

export const blogPosts = mysqlTable(
  "blog_posts",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    authorId: char("author_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    slug: varchar("slug", { length: 200 }).notNull(),
    excerpt: varchar("excerpt", { length: 500 }),
    content: text("content").notNull().default(""),
    isPublic: boolean("is_public").notNull().default(false),
    publishedAt: datetime("published_at", { mode: "date", fsp: 3 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("blog_posts_slug_idx").on(t.slug),
    index("blog_posts_author_idx").on(t.authorId),
    index("blog_posts_public_idx").on(t.isPublic, t.updatedAt),
  ],
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    userId: char("user_id", { length: 36 }),
    action: varchar("action", { length: 80 }).notNull(),
    resource: varchar("resource", { length: 80 }).notNull(),
    resourceId: char("resource_id", { length: 36 }),
    projectId: char("project_id", { length: 36 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    sessionId: char("session_id", { length: 36 }),
    status: varchar("status", { length: 20 }).notNull().default("success"),
    before: json("before").$type<Record<string, unknown>>(),
    after: json("after").$type<Record<string, unknown>>(),
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
  },
  (t) => [
    index("audit_action_idx").on(t.action),
    index("audit_project_idx").on(t.projectId),
    index("audit_created_idx").on(t.createdAt),
  ],
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    userId: char("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body").notNull(),
    kind: varchar("kind", { length: 40 }).notNull(),
    severity: varchar("severity", { length: 20 }).notNull().default("info"),
    href: text("href"),
    readAt: datetime("read_at", { mode: "date", fsp: 3 }),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
  },
  (t) => [index("notifications_user_idx").on(t.userId)],
);

export const notificationPreferences = mysqlTable("notification_preferences", {
  userId: char("user_id", { length: 36 })
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  emailEnabled: boolean("email_enabled").notNull().default(true),
  slackEnabled: boolean("slack_enabled").notNull().default(false),
  teamsEnabled: boolean("teams_enabled").notNull().default(false),
  sslExpiry: boolean("ssl_expiry").notNull().default(true),
  serverDown: boolean("server_down").notNull().default(true),
  dnsChanges: boolean("dns_changes").notNull().default(true),
  deployments: boolean("deployments").notNull().default(true),
  sshLogin: boolean("ssh_login").notNull().default(true),
  secrets: boolean("secrets").notNull().default(true),
  slackWebhookEnc: text("slack_webhook_enc"),
  teamsWebhookEnc: text("teams_webhook_enc"),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
});

export const quickAccessItems = mysqlTable("quick_access_items", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  userId: char("user_id", { length: 36 })
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: varchar("kind", { length: 40 }).notNull(),
  label: varchar("label", { length: 160 }).notNull(),
  href: text("href").notNull(),
  resourceId: char("resource_id", { length: 36 }),
  sortOrder: int("sort_order").notNull().default(0),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
});

export const driveNodes = mysqlTable(
  "drive_nodes",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: char("parent_id", { length: 36 }),
    name: varchar("name", { length: 255 }).notNull(),
    nodeType: varchar("node_type", { length: 10 }).notNull(),
    s3Key: text("s3_key"),
    mimeType: varchar("mime_type", { length: 120 }),
    sizeBytes: int("size_bytes"),
    ...timestamps,
  },
  (t) => [index("drive_nodes_user_parent_idx").on(t.userId, t.parentId)],
);

export const devGeneratorHistory = mysqlTable(
  "dev_generator_history",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    userId: char("user_id", { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    category: varchar("category", { length: 40 }),
    model: varchar("model", { length: 120 }).notNull(),
    files: json("files").$type<Array<{ name: string; content: string }>>().notNull(),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
  },
  (t) => [index("dev_generator_history_user_idx").on(t.userId, t.createdAt)],
);

export const integrations = mysqlTable("integrations", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  provider: varchar("provider", { length: 40 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("disconnected"),
  configEnc: text("config_enc"),
  connectedBy: char("connected_by", { length: 36 }),
  connectedAt: datetime("connected_at", { mode: "date", fsp: 3 }),
  ...timestamps,
});

export const sslChecks = mysqlTable(
  "ssl_checks",
  {
    id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
    domainId: char("domain_id", { length: 36 })
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    hostname: varchar("hostname", { length: 255 }).notNull(),
    issuer: varchar("issuer", { length: 255 }),
    validFrom: datetime("valid_from", { mode: "date", fsp: 3 }),
    validTo: datetime("valid_to", { mode: "date", fsp: 3 }),
    daysRemaining: int("days_remaining"),
    tlsVersion: varchar("tls_version", { length: 20 }),
    status: sslStatusEnum.notNull().default("unknown"),
    san: json("san").$type<string[]>().notNull().default([]),
    chain: json("chain").$type<string[]>().notNull().default([]),
    lastCheckedAt: datetime("last_checked_at", { mode: "date", fsp: 3 }),
    ...timestamps,
  },
  (t) => [index("ssl_checks_domain_idx").on(t.domainId)],
);

export const networkChecks = mysqlTable("network_checks", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  target: varchar("target", { length: 255 }).notNull(),
  kind: varchar("kind", { length: 20 }).notNull(),
  resolvedIp: varchar("resolved_ip", { length: 64 }),
  dnsOk: boolean("dns_ok"),
  pingOk: boolean("ping_ok"),
  httpStatus: int("http_status"),
  httpsStatus: int("https_status"),
  portResults: json("port_results").$type<Record<string, boolean>>().notNull().default({}),
  latencyMs: int("latency_ms"),
  packetLoss: int("packet_loss"),
  overall: healthStatusEnum.notNull().default("unknown"),
  raw: json("raw").$type<Record<string, unknown>>(),
  createdBy: char("created_by", { length: 36 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
});

export const settings = mysqlTable("settings", {
  key: varchar("key", { length: 80 }).primaryKey(),
  value: json("value").$type<unknown>().notNull(),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
});

export const ipAllowlist = mysqlTable("ip_allowlist", {
  id: char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID()),
  cidr: varchar("cidr", { length: 64 }).notNull(),
  label: varchar("label", { length: 120 }),
  createdBy: char("created_by", { length: 36 }),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).default(sql`(CURRENT_TIMESTAMP(3))`).notNull(),
});

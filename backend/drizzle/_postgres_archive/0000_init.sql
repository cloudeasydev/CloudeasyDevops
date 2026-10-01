CREATE TYPE "environment" AS ENUM ('development', 'staging', 'production');
CREATE TYPE "project_status" AS ENUM ('active', 'paused', 'archived');
CREATE TYPE "cloud_provider" AS ENUM ('gcp', 'aws', 'azure', 'digitalocean', 'hostinger', 'other');
CREATE TYPE "server_status" AS ENUM ('online', 'offline', 'warning', 'unknown');
CREATE TYPE "secret_provider" AS ENUM ('internal', 'gcp', 'aws', 'azure');
CREATE TYPE "dns_provider" AS ENUM ('cloudflare', 'route53', 'google_cloud_dns', 'namecheap', 'godaddy', 'manual');
CREATE TYPE "dns_record_type" AS ENUM ('A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA');
CREATE TYPE "ssl_status" AS ENUM ('healthy', 'warning', 'critical', 'expired', 'unknown');
CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'expired', 'revoked');
CREATE TYPE "user_status" AS ENUM ('active', 'suspended', 'invited');
CREATE TYPE "ssh_session_status" AS ENUM ('connecting', 'active', 'closed', 'failed');
CREATE TYPE "deployment_status" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'cancelled');
CREATE TYPE "health_status" AS ENUM ('healthy', 'warning', 'critical', 'unknown');
CREATE TYPE "cicd_provider" AS ENUM ('github_actions', 'gitlab_ci', 'circleci', 'jenkins', 'other');

CREATE TABLE "roles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "key" varchar(64) NOT NULL,
  "name" varchar(80) NOT NULL,
  "description" text,
  "is_system" boolean NOT NULL DEFAULT true,
  "permissions" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "roles_key_idx" ON "roles" ("key");

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(320) NOT NULL,
  "name" varchar(160) NOT NULL,
  "avatar_url" text,
  "status" "user_status" NOT NULL DEFAULT 'active',
  "role_id" uuid REFERENCES "roles"("id"),
  "is_owner" boolean NOT NULL DEFAULT false,
  "mfa_enabled" boolean NOT NULL DEFAULT false,
  "mfa_secret_enc" text,
  "last_login_at" timestamptz,
  "timezone" varchar(64) DEFAULT 'UTC',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "users_email_idx" ON "users" ("email");

CREATE TABLE "sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "ip_address" varchar(64),
  "user_agent" text,
  "expires_at" timestamptz NOT NULL,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "sessions_token_hash_idx" ON "sessions" ("token_hash");
CREATE INDEX "sessions_user_idx" ON "sessions" ("user_id");

CREATE TABLE "otp_challenges" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(320) NOT NULL,
  "code_hash" text NOT NULL,
  "attempts" integer NOT NULL DEFAULT 0,
  "consumed_at" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "ip_address" varchar(64),
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "otp_email_idx" ON "otp_challenges" ("email");

CREATE TABLE "login_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "email" varchar(320) NOT NULL,
  "action" varchar(40) NOT NULL,
  "status" varchar(20) NOT NULL,
  "ip_address" varchar(64),
  "user_agent" text,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "login_audits_email_idx" ON "login_audits" ("email");

CREATE TABLE "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(160) NOT NULL,
  "code" varchar(32) NOT NULL,
  "description" text,
  "client" varchar(160),
  "owner_id" uuid REFERENCES "users"("id"),
  "environment" "environment" NOT NULL DEFAULT 'development',
  "status" "project_status" NOT NULL DEFAULT 'active',
  "tags" jsonb NOT NULL DEFAULT '[]',
  "cloud_provider" "cloud_provider",
  "cloud_project_id" varchar(160),
  "region" varchar(80),
  "account_ref" varchar(160),
  "repo_provider" varchar(40),
  "repo_url" text,
  "default_branch" varchar(80) DEFAULT 'main',
  "deployment_branch" varchar(80),
  "cicd_provider" "cicd_provider",
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "projects_code_idx" ON "projects" ("code");
CREATE INDEX "projects_env_idx" ON "projects" ("environment");
CREATE INDEX "projects_status_idx" ON "projects" ("status");

CREATE TABLE "project_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role_key" varchar(64) NOT NULL DEFAULT 'developer',
  "environment_access" jsonb NOT NULL DEFAULT '["development","staging"]',
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "project_members_unique" ON "project_members" ("project_id", "user_id");

CREATE TABLE "invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" varchar(320) NOT NULL,
  "role_id" uuid NOT NULL REFERENCES "roles"("id"),
  "invited_by" uuid REFERENCES "users"("id"),
  "project_ids" jsonb NOT NULL DEFAULT '[]',
  "permissions" jsonb NOT NULL DEFAULT '[]',
  "token_hash" text NOT NULL,
  "status" "invitation_status" NOT NULL DEFAULT 'pending',
  "expires_at" timestamptz NOT NULL,
  "accepted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "servers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" varchar(160) NOT NULL,
  "hostname" varchar(255) NOT NULL,
  "ip_address" varchar(64) NOT NULL,
  "ssh_port" integer NOT NULL DEFAULT 22,
  "username" varchar(80) NOT NULL DEFAULT 'ubuntu',
  "os" varchar(80),
  "cloud_provider" "cloud_provider",
  "region" varchar(80),
  "environment" "environment" NOT NULL,
  "server_type" varchar(80),
  "cpu" varchar(40),
  "ram" varchar(40),
  "disk" varchar(40),
  "ssh_key_ref" varchar(160),
  "ssh_key_enc" text,
  "status" "server_status" NOT NULL DEFAULT 'unknown',
  "last_connected_at" timestamptz,
  "tags" jsonb NOT NULL DEFAULT '[]',
  "notes" text,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "servers_project_idx" ON "servers" ("project_id");
CREATE INDEX "servers_status_idx" ON "servers" ("status");

CREATE TABLE "kubernetes_clusters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" varchar(160) NOT NULL,
  "provider" "cloud_provider",
  "region" varchar(80),
  "environment" "environment" NOT NULL,
  "version" varchar(40),
  "node_count" integer DEFAULT 0,
  "endpoint" text,
  "status" "health_status" NOT NULL DEFAULT 'unknown',
  "namespace_default" varchar(80) DEFAULT 'default',
  "tags" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "databases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" varchar(160) NOT NULL,
  "engine" varchar(40) NOT NULL,
  "version" varchar(40),
  "host" varchar(255),
  "port" integer,
  "environment" "environment" NOT NULL,
  "provider" "cloud_provider",
  "region" varchar(80),
  "instance_class" varchar(80),
  "storage_gb" integer,
  "status" "health_status" NOT NULL DEFAULT 'unknown',
  "ha_enabled" boolean NOT NULL DEFAULT false,
  "tags" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "storage_resources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "name" varchar(160) NOT NULL,
  "kind" varchar(40) NOT NULL,
  "provider" "cloud_provider",
  "region" varchar(80),
  "environment" "environment" NOT NULL,
  "bucket" varchar(255),
  "size_gb" integer,
  "public_access" boolean NOT NULL DEFAULT false,
  "status" "health_status" NOT NULL DEFAULT 'unknown',
  "tags" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "infra_resources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "kind" varchar(40) NOT NULL,
  "name" varchar(160) NOT NULL,
  "environment" "environment" NOT NULL,
  "provider" "cloud_provider",
  "region" varchar(80),
  "endpoint" text,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "status" "health_status" NOT NULL DEFAULT 'unknown',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "domains" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "hostname" varchar(255) NOT NULL,
  "environment" "environment" NOT NULL,
  "registrar" varchar(80),
  "dns_provider" "dns_provider" DEFAULT 'manual',
  "status" "health_status" NOT NULL DEFAULT 'unknown',
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "domains_hostname_idx" ON "domains" ("hostname");

CREATE TABLE "dns_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "domain_id" uuid NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "type" "dns_record_type" NOT NULL,
  "name" varchar(255) NOT NULL,
  "value" text NOT NULL,
  "ttl" integer NOT NULL DEFAULT 300,
  "priority" integer,
  "provider" "dns_provider" DEFAULT 'manual',
  "provider_record_id" varchar(160),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "dns_records_domain_idx" ON "dns_records" ("domain_id");

CREATE TABLE "dns_record_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "record_id" uuid,
  "domain_id" uuid NOT NULL,
  "action" varchar(20) NOT NULL,
  "before" jsonb,
  "after" jsonb,
  "actor_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "secrets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "environment" "environment" NOT NULL,
  "service" varchar(80) NOT NULL DEFAULT 'app',
  "key" varchar(160) NOT NULL,
  "provider" "secret_provider" NOT NULL DEFAULT 'internal',
  "provider_path" text,
  "description" text,
  "disabled" boolean NOT NULL DEFAULT false,
  "current_version" integer NOT NULL DEFAULT 1,
  "rotated_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX "secrets_unique" ON "secrets" ("project_id", "environment", "service", "key");

CREATE TABLE "secret_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "secret_id" uuid NOT NULL REFERENCES "secrets"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "value_enc" text,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "secret_access_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "secret_id" uuid NOT NULL REFERENCES "secrets"("id") ON DELETE CASCADE,
  "user_id" uuid,
  "action" varchar(40) NOT NULL,
  "ip_address" varchar(64),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "deployments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "environment" "environment" NOT NULL,
  "version" varchar(80),
  "commit_sha" varchar(40),
  "branch" varchar(80),
  "status" "deployment_status" NOT NULL DEFAULT 'pending',
  "triggered_by" uuid,
  "duration_ms" integer,
  "logs" text,
  "started_at" timestamptz,
  "finished_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "deployments_project_idx" ON "deployments" ("project_id");

CREATE TABLE "ssh_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "server_id" uuid NOT NULL REFERENCES "servers"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "status" "ssh_session_status" NOT NULL DEFAULT 'connecting',
  "ip_address" varchar(64),
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "ended_at" timestamptz,
  "last_activity_at" timestamptz NOT NULL DEFAULT now(),
  "mfa_verified" boolean NOT NULL DEFAULT false
);
CREATE INDEX "ssh_sessions_user_idx" ON "ssh_sessions" ("user_id");

CREATE TABLE "ssh_command_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "ssh_sessions"("id") ON DELETE CASCADE,
  "command" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "scope" varchar(40) NOT NULL DEFAULT 'project',
  "category" varchar(80) NOT NULL,
  "title" varchar(200) NOT NULL,
  "slug" varchar(200) NOT NULL,
  "content" text NOT NULL DEFAULT '',
  "tags" jsonb NOT NULL DEFAULT '[]',
  "version" integer NOT NULL DEFAULT 1,
  "updated_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "document_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "content" text NOT NULL,
  "updated_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid,
  "action" varchar(80) NOT NULL,
  "resource" varchar(80) NOT NULL,
  "resource_id" uuid,
  "project_id" uuid,
  "ip_address" varchar(64),
  "session_id" uuid,
  "status" varchar(20) NOT NULL DEFAULT 'success',
  "before" jsonb,
  "after" jsonb,
  "metadata" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "audit_action_idx" ON "audit_logs" ("action");
CREATE INDEX "audit_project_idx" ON "audit_logs" ("project_id");
CREATE INDEX "audit_created_idx" ON "audit_logs" ("created_at");

CREATE TABLE "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid REFERENCES "users"("id") ON DELETE CASCADE,
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "kind" varchar(40) NOT NULL,
  "severity" varchar(20) NOT NULL DEFAULT 'info',
  "href" text,
  "read_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "notifications_user_idx" ON "notifications" ("user_id");

CREATE TABLE "notification_preferences" (
  "user_id" uuid PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "email_enabled" boolean NOT NULL DEFAULT true,
  "slack_enabled" boolean NOT NULL DEFAULT false,
  "teams_enabled" boolean NOT NULL DEFAULT false,
  "ssl_expiry" boolean NOT NULL DEFAULT true,
  "server_down" boolean NOT NULL DEFAULT true,
  "dns_changes" boolean NOT NULL DEFAULT true,
  "deployments" boolean NOT NULL DEFAULT true,
  "ssh_login" boolean NOT NULL DEFAULT true,
  "secrets" boolean NOT NULL DEFAULT true,
  "slack_webhook_enc" text,
  "teams_webhook_enc" text,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "quick_access_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(40) NOT NULL,
  "label" varchar(160) NOT NULL,
  "href" text NOT NULL,
  "resource_id" uuid,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "provider" varchar(40) NOT NULL,
  "name" varchar(120) NOT NULL,
  "status" varchar(20) NOT NULL DEFAULT 'disconnected',
  "config_enc" text,
  "connected_by" uuid,
  "connected_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "ssl_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "domain_id" uuid NOT NULL REFERENCES "domains"("id") ON DELETE CASCADE,
  "hostname" varchar(255) NOT NULL,
  "issuer" varchar(255),
  "valid_from" timestamptz,
  "valid_to" timestamptz,
  "days_remaining" integer,
  "tls_version" varchar(20),
  "status" "ssl_status" NOT NULL DEFAULT 'unknown',
  "san" jsonb NOT NULL DEFAULT '[]',
  "chain" jsonb NOT NULL DEFAULT '[]',
  "last_checked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "ssl_checks_domain_idx" ON "ssl_checks" ("domain_id");

CREATE TABLE "network_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "target" varchar(255) NOT NULL,
  "kind" varchar(20) NOT NULL,
  "resolved_ip" varchar(64),
  "dns_ok" boolean,
  "ping_ok" boolean,
  "http_status" integer,
  "https_status" integer,
  "port_results" jsonb NOT NULL DEFAULT '{}',
  "latency_ms" integer,
  "packet_loss" integer,
  "overall" "health_status" NOT NULL DEFAULT 'unknown',
  "raw" jsonb,
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "settings" (
  "key" varchar(80) PRIMARY KEY,
  "value" jsonb NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE "ip_allowlist" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "cidr" varchar(64) NOT NULL,
  "label" varchar(120),
  "created_by" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE `audit_logs` (
	`id` char(36) NOT NULL,
	`user_id` char(36),
	`action` varchar(80) NOT NULL,
	`resource` varchar(80) NOT NULL,
	`resource_id` char(36),
	`project_id` char(36),
	`ip_address` varchar(64),
	`session_id` char(36),
	`status` varchar(20) NOT NULL DEFAULT 'success',
	`before` json,
	`after` json,
	`metadata` json,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `blog_posts` (
	`id` char(36) NOT NULL,
	`author_id` char(36) NOT NULL,
	`title` varchar(200) NOT NULL,
	`slug` varchar(200) NOT NULL,
	`excerpt` varchar(500),
	`content` text NOT NULL DEFAULT (''),
	`is_public` boolean NOT NULL DEFAULT false,
	`published_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `blog_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `blog_posts_slug_idx` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `databases` (
	`id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`engine` varchar(40) NOT NULL,
	`version` varchar(40),
	`host` varchar(255),
	`port` int,
	`environment` enum('development','staging','production') NOT NULL DEFAULT 'development',
	`cloud_provider` enum('gcp','aws','azure','digitalocean','hostinger','other'),
	`region` varchar(80),
	`instance_class` varchar(80),
	`storage_gb` int,
	`health_status` enum('healthy','warning','critical','unknown') NOT NULL DEFAULT 'unknown',
	`ha_enabled` boolean NOT NULL DEFAULT false,
	`tags` json NOT NULL DEFAULT ('[]'),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `databases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `deployments` (
	`id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`environment` enum('development','staging','production') NOT NULL DEFAULT 'development',
	`version` varchar(80),
	`commit_sha` varchar(40),
	`branch` varchar(80),
	`deployment_status` enum('pending','running','succeeded','failed','cancelled') NOT NULL DEFAULT 'pending',
	`triggered_by` char(36),
	`duration_ms` int,
	`logs` text,
	`started_at` datetime(3),
	`finished_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `deployments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dev_generator_history` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`prompt` text NOT NULL,
	`category` varchar(40),
	`model` varchar(120) NOT NULL,
	`files` json NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `dev_generator_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dns_record_history` (
	`id` char(36) NOT NULL,
	`record_id` char(36),
	`domain_id` char(36) NOT NULL,
	`action` varchar(20) NOT NULL,
	`before` json,
	`after` json,
	`actor_id` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `dns_record_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `dns_records` (
	`id` char(36) NOT NULL,
	`domain_id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`dns_record_type` enum('A','AAAA','CNAME','MX','TXT','NS','SRV','CAA') NOT NULL,
	`name` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`ttl` int NOT NULL DEFAULT 300,
	`priority` int,
	`dns_provider` enum('cloudflare','route53','google_cloud_dns','namecheap','godaddy','manual') DEFAULT 'manual',
	`provider_record_id` varchar(160),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `dns_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` char(36) NOT NULL,
	`document_id` char(36) NOT NULL,
	`version` int NOT NULL,
	`content` text NOT NULL,
	`updated_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `document_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` char(36) NOT NULL,
	`project_id` char(36),
	`scope` varchar(40) NOT NULL DEFAULT 'project',
	`category` varchar(80) NOT NULL,
	`title` varchar(200) NOT NULL,
	`slug` varchar(200) NOT NULL,
	`content` text NOT NULL DEFAULT (''),
	`tags` json NOT NULL DEFAULT ('[]'),
	`version` int NOT NULL DEFAULT 1,
	`updated_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `domains` (
	`id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`hostname` varchar(255) NOT NULL,
	`environment` enum('development','staging','production') NOT NULL DEFAULT 'development',
	`registrar` varchar(80),
	`dns_provider` enum('cloudflare','route53','google_cloud_dns','namecheap','godaddy','manual') DEFAULT 'manual',
	`health_status` enum('healthy','warning','critical','unknown') NOT NULL DEFAULT 'unknown',
	`notes` text,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `domains_id` PRIMARY KEY(`id`),
	CONSTRAINT `domains_hostname_idx` UNIQUE(`hostname`)
);
--> statement-breakpoint
CREATE TABLE `drive_nodes` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`parent_id` char(36),
	`name` varchar(255) NOT NULL,
	`node_type` varchar(10) NOT NULL,
	`s3_key` text,
	`mime_type` varchar(120),
	`size_bytes` int,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `drive_nodes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `infra_resources` (
	`id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`kind` varchar(40) NOT NULL,
	`name` varchar(160) NOT NULL,
	`environment` enum('development','staging','production') NOT NULL DEFAULT 'development',
	`cloud_provider` enum('gcp','aws','azure','digitalocean','hostinger','other'),
	`region` varchar(80),
	`endpoint` text,
	`metadata` json NOT NULL DEFAULT ('{}'),
	`health_status` enum('healthy','warning','critical','unknown') NOT NULL DEFAULT 'unknown',
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `infra_resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` char(36) NOT NULL,
	`provider` varchar(40) NOT NULL,
	`name` varchar(120) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'disconnected',
	`config_enc` text,
	`connected_by` char(36),
	`connected_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `integrations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invitations` (
	`id` char(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`role_id` char(36) NOT NULL,
	`invited_by` char(36),
	`project_ids` json NOT NULL DEFAULT ('[]'),
	`permissions` json NOT NULL DEFAULT ('[]'),
	`token_hash` varchar(64) NOT NULL,
	`invitation_status` enum('pending','accepted','expired','revoked') NOT NULL DEFAULT 'pending',
	`expires_at` datetime(3) NOT NULL,
	`accepted_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `invitations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ip_allowlist` (
	`id` char(36) NOT NULL,
	`cidr` varchar(64) NOT NULL,
	`label` varchar(120),
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `ip_allowlist_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `kubernetes_clusters` (
	`id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`cloud_provider` enum('gcp','aws','azure','digitalocean','hostinger','other'),
	`region` varchar(80),
	`environment` enum('development','staging','production') NOT NULL DEFAULT 'development',
	`version` varchar(40),
	`node_count` int DEFAULT 0,
	`endpoint` text,
	`health_status` enum('healthy','warning','critical','unknown') NOT NULL DEFAULT 'unknown',
	`namespace_default` varchar(80) DEFAULT 'default',
	`tags` json NOT NULL DEFAULT ('[]'),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `kubernetes_clusters_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `login_audits` (
	`id` char(36) NOT NULL,
	`user_id` char(36),
	`email` varchar(320) NOT NULL,
	`action` varchar(40) NOT NULL,
	`status` varchar(20) NOT NULL,
	`ip_address` varchar(64),
	`user_agent` text,
	`metadata` json,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `login_audits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `network_checks` (
	`id` char(36) NOT NULL,
	`target` varchar(255) NOT NULL,
	`kind` varchar(20) NOT NULL,
	`resolved_ip` varchar(64),
	`dns_ok` boolean,
	`ping_ok` boolean,
	`http_status` int,
	`https_status` int,
	`port_results` json NOT NULL DEFAULT ('{}'),
	`latency_ms` int,
	`packet_loss` int,
	`health_status` enum('healthy','warning','critical','unknown') NOT NULL DEFAULT 'unknown',
	`raw` json,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `network_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`user_id` char(36) NOT NULL,
	`email_enabled` boolean NOT NULL DEFAULT true,
	`slack_enabled` boolean NOT NULL DEFAULT false,
	`teams_enabled` boolean NOT NULL DEFAULT false,
	`ssl_expiry` boolean NOT NULL DEFAULT true,
	`server_down` boolean NOT NULL DEFAULT true,
	`dns_changes` boolean NOT NULL DEFAULT true,
	`deployments` boolean NOT NULL DEFAULT true,
	`ssh_login` boolean NOT NULL DEFAULT true,
	`secrets` boolean NOT NULL DEFAULT true,
	`slack_webhook_enc` text,
	`teams_webhook_enc` text,
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `notification_preferences_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` char(36) NOT NULL,
	`user_id` char(36),
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`kind` varchar(40) NOT NULL,
	`severity` varchar(20) NOT NULL DEFAULT 'info',
	`href` text,
	`read_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `otp_challenges` (
	`id` char(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`code_hash` text NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`consumed_at` datetime(3),
	`expires_at` datetime(3) NOT NULL,
	`ip_address` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `otp_challenges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `password_resets` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`expires_at` datetime(3) NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `password_resets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_members` (
	`id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`role_key` varchar(64) NOT NULL DEFAULT 'developer',
	`environment_access` json NOT NULL DEFAULT ('["development","staging"]'),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `project_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `project_members_unique` UNIQUE(`project_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` char(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`code` varchar(32) NOT NULL,
	`description` text,
	`client` varchar(160),
	`owner_id` char(36),
	`environment` enum('development','staging','production') NOT NULL DEFAULT 'development',
	`project_status` enum('active','paused','archived') NOT NULL DEFAULT 'active',
	`tags` json NOT NULL DEFAULT ('[]'),
	`cloud_provider` enum('gcp','aws','azure','digitalocean','hostinger','other'),
	`cloud_project_id` varchar(160),
	`region` varchar(80),
	`account_ref` varchar(160),
	`repo_provider` varchar(40),
	`repo_url` text,
	`default_branch` varchar(80) DEFAULT 'main',
	`deployment_branch` varchar(80),
	`cicd_provider` enum('github_actions','gitlab_ci','circleci','jenkins','other'),
	`metadata` json NOT NULL DEFAULT ('{}'),
	`archived_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`),
	CONSTRAINT `projects_code_idx` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `quick_access_items` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`kind` varchar(40) NOT NULL,
	`label` varchar(160) NOT NULL,
	`href` text NOT NULL,
	`resource_id` char(36),
	`sort_order` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `quick_access_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` char(36) NOT NULL,
	`key` varchar(64) NOT NULL,
	`name` varchar(80) NOT NULL,
	`description` text,
	`is_system` boolean NOT NULL DEFAULT true,
	`permissions` json NOT NULL DEFAULT ('[]'),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_key_idx` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `secret_access_logs` (
	`id` char(36) NOT NULL,
	`secret_id` char(36) NOT NULL,
	`user_id` char(36),
	`action` varchar(40) NOT NULL,
	`ip_address` varchar(64),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `secret_access_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `secret_versions` (
	`id` char(36) NOT NULL,
	`secret_id` char(36) NOT NULL,
	`version` int NOT NULL,
	`value_enc` text,
	`created_by` char(36),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `secret_versions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `secrets` (
	`id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`environment` enum('development','staging','production') NOT NULL DEFAULT 'development',
	`service` varchar(80) NOT NULL DEFAULT 'app',
	`key` varchar(160) NOT NULL,
	`secret_provider` enum('internal','gcp','aws','azure') NOT NULL DEFAULT 'internal',
	`provider_path` text,
	`description` text,
	`disabled` boolean NOT NULL DEFAULT false,
	`current_version` int NOT NULL DEFAULT 1,
	`rotated_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `secrets_id` PRIMARY KEY(`id`),
	CONSTRAINT `secrets_unique` UNIQUE(`project_id`,`environment`,`service`,`key`)
);
--> statement-breakpoint
CREATE TABLE `servers` (
	`id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`hostname` varchar(255) NOT NULL,
	`ip_address` varchar(64) NOT NULL,
	`ssh_port` int NOT NULL DEFAULT 22,
	`username` varchar(80) NOT NULL DEFAULT 'ubuntu',
	`os` varchar(80),
	`cloud_provider` enum('gcp','aws','azure','digitalocean','hostinger','other'),
	`region` varchar(80),
	`environment` enum('development','staging','production') NOT NULL DEFAULT 'development',
	`server_type` varchar(80),
	`cpu` varchar(40),
	`ram` varchar(40),
	`disk` varchar(40),
	`ssh_key_ref` varchar(160),
	`ssh_key_enc` text,
	`server_status` enum('online','offline','warning','unknown') NOT NULL DEFAULT 'unknown',
	`last_connected_at` datetime(3),
	`tags` json NOT NULL DEFAULT ('[]'),
	`notes` text,
	`archived_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `servers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`token_hash` varchar(64) NOT NULL,
	`ip_address` varchar(64),
	`user_agent` text,
	`expires_at` datetime(3) NOT NULL,
	`revoked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_hash_idx` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` varchar(80) NOT NULL,
	`value` json NOT NULL,
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `settings_key` PRIMARY KEY(`key`)
);
--> statement-breakpoint
CREATE TABLE `ssh_command_logs` (
	`id` char(36) NOT NULL,
	`session_id` char(36) NOT NULL,
	`command` text NOT NULL,
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `ssh_command_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssh_sessions` (
	`id` char(36) NOT NULL,
	`server_id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`ssh_session_status` enum('connecting','active','closed','failed') NOT NULL DEFAULT 'connecting',
	`ip_address` varchar(64),
	`started_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`ended_at` datetime(3),
	`last_activity_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`mfa_verified` boolean NOT NULL DEFAULT false,
	CONSTRAINT `ssh_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssl_checks` (
	`id` char(36) NOT NULL,
	`domain_id` char(36) NOT NULL,
	`hostname` varchar(255) NOT NULL,
	`issuer` varchar(255),
	`valid_from` datetime(3),
	`valid_to` datetime(3),
	`days_remaining` int,
	`tls_version` varchar(20),
	`ssl_status` enum('healthy','warning','critical','expired','unknown') NOT NULL DEFAULT 'unknown',
	`san` json NOT NULL DEFAULT ('[]'),
	`chain` json NOT NULL DEFAULT ('[]'),
	`last_checked_at` datetime(3),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `ssl_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `storage_resources` (
	`id` char(36) NOT NULL,
	`project_id` char(36) NOT NULL,
	`name` varchar(160) NOT NULL,
	`kind` varchar(40) NOT NULL,
	`cloud_provider` enum('gcp','aws','azure','digitalocean','hostinger','other'),
	`region` varchar(80),
	`environment` enum('development','staging','production') NOT NULL DEFAULT 'development',
	`bucket` varchar(255),
	`size_gb` int,
	`public_access` boolean NOT NULL DEFAULT false,
	`health_status` enum('healthy','warning','critical','unknown') NOT NULL DEFAULT 'unknown',
	`tags` json NOT NULL DEFAULT ('[]'),
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `storage_resources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`name` varchar(160) NOT NULL,
	`password_hash` text,
	`avatar_url` text,
	`user_status` enum('active','suspended','invited') NOT NULL DEFAULT 'active',
	`role_id` char(36),
	`is_owner` boolean NOT NULL DEFAULT false,
	`mfa_enabled` boolean NOT NULL DEFAULT false,
	`mfa_secret_enc` text,
	`last_login_at` datetime(3),
	`timezone` varchar(64) DEFAULT 'UTC',
	`created_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	`updated_at` datetime(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP(3)),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_idx` UNIQUE(`email`)
);
--> statement-breakpoint
ALTER TABLE `blog_posts` ADD CONSTRAINT `blog_posts_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `databases` ADD CONSTRAINT `databases_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `deployments` ADD CONSTRAINT `deployments_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dev_generator_history` ADD CONSTRAINT `dev_generator_history_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dns_records` ADD CONSTRAINT `dns_records_domain_id_domains_id_fk` FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dns_records` ADD CONSTRAINT `dns_records_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_versions` ADD CONSTRAINT `document_versions_document_id_documents_id_fk` FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `documents` ADD CONSTRAINT `documents_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `domains` ADD CONSTRAINT `domains_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `drive_nodes` ADD CONSTRAINT `drive_nodes_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `infra_resources` ADD CONSTRAINT `infra_resources_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_invited_by_users_id_fk` FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kubernetes_clusters` ADD CONSTRAINT `kubernetes_clusters_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `password_resets` ADD CONSTRAINT `password_resets_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_members` ADD CONSTRAINT `project_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quick_access_items` ADD CONSTRAINT `quick_access_items_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `secret_access_logs` ADD CONSTRAINT `secret_access_logs_secret_id_secrets_id_fk` FOREIGN KEY (`secret_id`) REFERENCES `secrets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `secret_versions` ADD CONSTRAINT `secret_versions_secret_id_secrets_id_fk` FOREIGN KEY (`secret_id`) REFERENCES `secrets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `secrets` ADD CONSTRAINT `secrets_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `servers` ADD CONSTRAINT `servers_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ssh_command_logs` ADD CONSTRAINT `ssh_command_logs_session_id_ssh_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `ssh_sessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ssh_sessions` ADD CONSTRAINT `ssh_sessions_server_id_servers_id_fk` FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ssh_sessions` ADD CONSTRAINT `ssh_sessions_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ssh_sessions` ADD CONSTRAINT `ssh_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `ssl_checks` ADD CONSTRAINT `ssl_checks_domain_id_domains_id_fk` FOREIGN KEY (`domain_id`) REFERENCES `domains`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `storage_resources` ADD CONSTRAINT `storage_resources_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `audit_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `audit_project_idx` ON `audit_logs` (`project_id`);--> statement-breakpoint
CREATE INDEX `audit_created_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `blog_posts_author_idx` ON `blog_posts` (`author_id`);--> statement-breakpoint
CREATE INDEX `blog_posts_public_idx` ON `blog_posts` (`is_public`,`updated_at`);--> statement-breakpoint
CREATE INDEX `deployments_project_idx` ON `deployments` (`project_id`);--> statement-breakpoint
CREATE INDEX `dev_generator_history_user_idx` ON `dev_generator_history` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `dns_records_domain_idx` ON `dns_records` (`domain_id`);--> statement-breakpoint
CREATE INDEX `drive_nodes_user_parent_idx` ON `drive_nodes` (`user_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `login_audits_email_idx` ON `login_audits` (`email`);--> statement-breakpoint
CREATE INDEX `notifications_user_idx` ON `notifications` (`user_id`);--> statement-breakpoint
CREATE INDEX `otp_email_idx` ON `otp_challenges` (`email`);--> statement-breakpoint
CREATE INDEX `projects_env_idx` ON `projects` (`environment`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`project_status`);--> statement-breakpoint
CREATE INDEX `servers_project_idx` ON `servers` (`project_id`);--> statement-breakpoint
CREATE INDEX `servers_status_idx` ON `servers` (`server_status`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `ssh_sessions_user_idx` ON `ssh_sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `ssl_checks_domain_idx` ON `ssl_checks` (`domain_id`);
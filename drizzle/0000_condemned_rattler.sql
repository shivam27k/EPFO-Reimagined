CREATE TABLE `claim_events` (
	`id` text PRIMARY KEY NOT NULL,
	`claim_id` text NOT NULL,
	`status` text NOT NULL,
	`actor` text NOT NULL,
	`explanation` text NOT NULL,
	`occurred_at` text NOT NULL,
	FOREIGN KEY (`claim_id`) REFERENCES `claims`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `claim_events_claim_id_idx` ON `claim_events` (`claim_id`);--> statement-breakpoint
CREATE TABLE `claims` (
	`id` text PRIMARY KEY NOT NULL,
	`demo_run_id` text NOT NULL,
	`type` text NOT NULL,
	`amount` integer NOT NULL,
	`status` text NOT NULL,
	`submitted_at` text,
	FOREIGN KEY (`demo_run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `claims_demo_run_id_idx` ON `claims` (`demo_run_id`);--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`employment_id` text NOT NULL,
	`wage_month` text NOT NULL,
	`employee_epf` integer NOT NULL,
	`employer_epf` integer NOT NULL,
	`employer_eps` integer NOT NULL,
	`posting_status` text NOT NULL,
	FOREIGN KEY (`employment_id`) REFERENCES `employments`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `contributions_employment_id_idx` ON `contributions` (`employment_id`);--> statement-breakpoint
CREATE TABLE `conversation_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`demo_run_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`demo_run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_messages_demo_run_id_idx` ON `conversation_messages` (`demo_run_id`);--> statement-breakpoint
CREATE TABLE `demo_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`persona` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `demo_users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `demo_runs_user_id_idx` ON `demo_runs` (`user_id`);--> statement-breakpoint
CREATE INDEX `demo_runs_created_at_idx` ON `demo_runs` (`created_at`);--> statement-breakpoint
CREATE TABLE `demo_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`persona` text NOT NULL,
	`display_name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_users_username_idx` ON `demo_users` (`username`);--> statement-breakpoint
CREATE TABLE `employments` (
	`id` text PRIMARY KEY NOT NULL,
	`demo_run_id` text NOT NULL,
	`member_id` text NOT NULL,
	`establishment_name` text NOT NULL,
	`joined_at` text NOT NULL,
	`exited_at` text,
	`epf_member` integer NOT NULL,
	`eps_member` integer NOT NULL,
	FOREIGN KEY (`demo_run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `employments_demo_run_id_idx` ON `employments` (`demo_run_id`);--> statement-breakpoint
CREATE TABLE `kyc_records` (
	`id` text PRIMARY KEY NOT NULL,
	`demo_run_id` text NOT NULL,
	`type` text NOT NULL,
	`value_masked` text NOT NULL,
	`status` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`demo_run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `kyc_records_demo_run_id_idx` ON `kyc_records` (`demo_run_id`);--> statement-breakpoint
CREATE TABLE `member_profiles` (
	`demo_run_id` text PRIMARY KEY NOT NULL,
	`uan` text NOT NULL,
	`aadhaar_name` text NOT NULL,
	`bank_name` text NOT NULL,
	`pan_name` text NOT NULL,
	`date_of_birth` text NOT NULL,
	`mobile_masked` text NOT NULL,
	`onboarding_complete` integer NOT NULL,
	FOREIGN KEY (`demo_run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `scenario_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`demo_run_id` text NOT NULL,
	`scenario_key` text NOT NULL,
	`stage` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`demo_run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scenario_runs_demo_run_id_idx` ON `scenario_runs` (`demo_run_id`);--> statement-breakpoint
CREATE TABLE `service_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`demo_run_id` text NOT NULL,
	`type` text NOT NULL,
	`owner` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`resolved_at` text,
	FOREIGN KEY (`demo_run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `service_requests_demo_run_id_idx` ON `service_requests` (`demo_run_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`demo_run_id` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `demo_users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`demo_run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_demo_run_id_idx` ON `sessions` (`demo_run_id`);
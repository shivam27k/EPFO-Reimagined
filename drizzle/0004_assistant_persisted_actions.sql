CREATE TABLE `assistant_continuations` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`expires_at` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`consumed_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_continuations_run_idx` ON `assistant_continuations` (`run_id`);--> statement-breakpoint
CREATE TABLE `assistant_document_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`kind` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `assistant_document_sources_run_idx` ON `assistant_document_sources` (`run_id`);--> statement-breakpoint
CREATE TABLE `assistant_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`source_turn_id` text NOT NULL,
	`call_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`state_version` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`displayed_at` text,
	`consumed_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_proposals_run_call_idx` ON `assistant_proposals` (`run_id`,`call_id`);--> statement-breakpoint
CREATE INDEX `assistant_proposals_pending_idx` ON `assistant_proposals` (`run_id`,`status`);--> statement-breakpoint
CREATE TABLE `assistant_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`proposal_id` text NOT NULL,
	`call_id` text NOT NULL,
	`decision_turn_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`result_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_receipts_run_proposal_idx` ON `assistant_receipts` (`run_id`,`proposal_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_receipts_run_call_idx` ON `assistant_receipts` (`run_id`,`call_id`);--> statement-breakpoint
CREATE TABLE `assistant_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`call_id` text NOT NULL,
	`request_hash` text NOT NULL,
	`result_json` text,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_tool_calls_run_call_idx` ON `assistant_tool_calls` (`run_id`,`call_id`);--> statement-breakpoint
CREATE TABLE `assistant_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`request_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`mode` text NOT NULL,
	`route` text NOT NULL,
	`text_masked` text NOT NULL,
	`source_hashes_json` text NOT NULL,
	`synthetic_disclosure` integer NOT NULL,
	`proposal_id` text,
	`proposal_hash` text,
	`decision` text,
	`calls` integer DEFAULT 0 NOT NULL,
	`active_ms` integer DEFAULT 0 NOT NULL,
	`read_retried` integer DEFAULT false NOT NULL,
	`active_call_id` text,
	`active_since` text,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assistant_turns_run_request_idx` ON `assistant_turns` (`run_id`,`request_key`);
--> statement-breakpoint
CREATE TRIGGER assistant_receipts_no_update
BEFORE UPDATE ON assistant_receipts
BEGIN
  SELECT RAISE(ABORT, 'Assistant receipts are immutable');
END;

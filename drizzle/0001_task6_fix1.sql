CREATE TABLE `onboarding_drafts` (
	`demo_run_id` text PRIMARY KEY NOT NULL,
	`current_step` integer NOT NULL,
	`disclosure_accepted` integer NOT NULL,
	`values_json` text NOT NULL,
	`uan_masked` text,
	`mobile_masked` text,
	`member_id_masked` text,
	`pan_masked` text,
	`bank_account_masked` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`demo_run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `simulation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`demo_run_id` text NOT NULL,
	`kind` text NOT NULL,
	`interval_start` text NOT NULL,
	`interval_end` text NOT NULL,
	`interval_label` text NOT NULL,
	`months` integer NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`demo_run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `simulation_events_demo_run_id_idx` ON `simulation_events` (`demo_run_id`);
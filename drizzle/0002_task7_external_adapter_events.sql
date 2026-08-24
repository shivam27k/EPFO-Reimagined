CREATE TABLE `external_adapter_events` (
	`id` text PRIMARY KEY NOT NULL,
	`demo_run_id` text NOT NULL,
	`actor` text NOT NULL,
	`event_type` text NOT NULL,
	`previous_state_json` text NOT NULL,
	`new_state_json` text NOT NULL,
	`explanation` text NOT NULL,
	`simulated` integer NOT NULL,
	`recorded_at` text NOT NULL,
	FOREIGN KEY (`demo_run_id`) REFERENCES `demo_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `external_adapter_events_demo_run_id_idx` ON `external_adapter_events` (`demo_run_id`);
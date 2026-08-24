ALTER TABLE `claims` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `claims_idempotency_key_idx` ON `claims` (`idempotency_key`);
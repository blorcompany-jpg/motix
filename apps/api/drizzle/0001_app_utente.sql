DROP INDEX "set_logs_session_exercise_idx";--> statement-breakpoint
DROP INDEX "hydration_logs_user_idx";--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "pattern" text DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "loadable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "unit" text DEFAULT 'reps' NOT NULL;--> statement-breakpoint
ALTER TABLE "hydration_logs" ADD COLUMN "day" date NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "set_logs_set_uq" ON "set_logs" USING btree ("session_exercise_id","set_number");--> statement-breakpoint
CREATE INDEX "hydration_logs_user_idx" ON "hydration_logs" USING btree ("user_id","day");
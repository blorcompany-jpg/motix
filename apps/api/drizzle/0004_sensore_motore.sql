CREATE TABLE "sensor_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sensor_id" uuid NOT NULL,
	"reporter_id" uuid,
	"note" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "changes" jsonb;--> statement-breakpoint
ALTER TABLE "sensor_readings" ADD COLUMN "peak_velocity" numeric(6, 3);--> statement-breakpoint
ALTER TABLE "sensor_readings" ADD COLUMN "velocity_loss_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "sensor_readings" ADD COLUMN "range_m" numeric(5, 3);--> statement-breakpoint
ALTER TABLE "sensors" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sensors" ADD COLUMN "battery_pct" integer;--> statement-breakpoint
ALTER TABLE "sensors" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "sensor_issues" ADD CONSTRAINT "sensor_issues_sensor_id_sensors_id_fk" FOREIGN KEY ("sensor_id") REFERENCES "public"."sensors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensor_issues" ADD CONSTRAINT "sensor_issues_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sensor_issues_sensor_idx" ON "sensor_issues" USING btree ("sensor_id");
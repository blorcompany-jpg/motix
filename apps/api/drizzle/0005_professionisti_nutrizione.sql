CREATE TYPE "public"."automation_kind" AS ENUM('welcome', 'check_in_reminder', 'inactive', 'at_risk');--> statement-breakpoint
CREATE TYPE "public"."food_category" AS ENUM('cereals', 'protein', 'dairy', 'vegetables', 'fruit', 'legumes', 'fats', 'other');--> statement-breakpoint
CREATE TYPE "public"."health_source" AS ENUM('apple_health', 'health_connect', 'manual');--> statement-breakpoint
CREATE TYPE "public"."meal" AS ENUM('breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner');--> statement-breakpoint
CREATE TYPE "public"."package_status" AS ENUM('requested', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."profession" AS ENUM('personal_trainer', 'athletic_trainer', 'physiotherapist', 'nutritionist');--> statement-breakpoint
ALTER TYPE "public"."store" ADD VALUE 'web';--> statement-breakpoint
ALTER TYPE "public"."store" ADD VALUE 'structure';--> statement-breakpoint
CREATE TABLE "automation_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "automation_kind" NOT NULL,
	"dedupe_key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"weight_kg" numeric(5, 1),
	"waist_cm" numeric(5, 1),
	"energy" integer,
	"sleep" integer,
	"stress" integer,
	"training" integer,
	"nutrition" integer,
	"notes" text,
	"photo_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comment" text,
	"comment_by_trainer_id" uuid,
	"commented_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"meal" "meal" NOT NULL,
	"food_id" uuid NOT NULL,
	"grams" numeric(6, 1) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "food_category" NOT NULL,
	"kcal" numeric(6, 1) NOT NULL,
	"protein" numeric(5, 1) NOT NULL,
	"carbs" numeric(5, 1) NOT NULL,
	"fat" numeric(5, 1) NOT NULL,
	"fiber" numeric(5, 1) DEFAULT '0' NOT NULL,
	"trainer_id" uuid,
	"slug" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_days" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"steps" integer,
	"sleep_minutes" integer,
	"resting_hr" integer,
	"active_kcal" integer,
	"source" "health_source" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "health_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trainer_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"days" jsonb NOT NULL,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"sessions" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structure_packages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid NOT NULL,
	"seats" integer NOT NULL,
	"unit_price_eur" numeric(7, 2) NOT NULL,
	"status" "package_status" DEFAULT 'requested' NOT NULL,
	"requested_by" uuid NOT NULL,
	"paid_at" timestamp with time zone,
	"confirmed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structure_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"package_id" uuid NOT NULL,
	"user_id" uuid,
	"subscription_id" uuid,
	"assigned_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "trainer_automations" (
	"trainer_id" uuid NOT NULL,
	"kind" "automation_kind" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"text" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainer_automations_trainer_id_kind_pk" PRIMARY KEY("trainer_id","kind")
);
--> statement-breakpoint
ALTER TABLE "client_links" ADD COLUMN "check_in_every_days" integer;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "profession" "profession" DEFAULT 'personal_trainer' NOT NULL;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "register_name" text;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "register_number" text;--> statement-breakpoint
ALTER TABLE "trainers" ADD COLUMN "register_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "automation_sends" ADD CONSTRAINT "automation_sends_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_sends" ADD CONSTRAINT "automation_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_comment_by_trainer_id_trainers_id_fk" FOREIGN KEY ("comment_by_trainer_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_days" ADD CONSTRAINT "health_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_templates" ADD CONSTRAINT "plan_templates_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_packages" ADD CONSTRAINT "structure_packages_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_packages" ADD CONSTRAINT "structure_packages_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_packages" ADD CONSTRAINT "structure_packages_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_seats" ADD CONSTRAINT "structure_seats_package_id_structure_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."structure_packages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_seats" ADD CONSTRAINT "structure_seats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structure_seats" ADD CONSTRAINT "structure_seats_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_automations" ADD CONSTRAINT "trainer_automations_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "automation_sends_uq" ON "automation_sends" USING btree ("trainer_id","user_id","kind","dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "check_ins_user_day_uq" ON "check_ins" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "food_logs_user_day_idx" ON "food_logs" USING btree ("user_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "foods_slug_uq" ON "foods" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "foods_trainer_idx" ON "foods" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX "meal_plans_user_idx" ON "meal_plans" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "plan_templates_trainer_idx" ON "plan_templates" USING btree ("trainer_id");--> statement-breakpoint
CREATE INDEX "structure_packages_structure_idx" ON "structure_packages" USING btree ("structure_id");--> statement-breakpoint
CREATE INDEX "structure_seats_package_idx" ON "structure_seats" USING btree ("package_id");
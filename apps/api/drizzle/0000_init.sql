CREATE TYPE "public"."approval_status" AS ENUM('pending', 'approved', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."auth_provider" AS ENUM('email', 'apple', 'google');--> statement-breakpoint
CREATE TYPE "public"."acquisition_channel" AS ENUM('structure', 'trainer', 'ads', 'organic');--> statement-breakpoint
CREATE TYPE "public"."client_link_status" AS ENUM('requested_by_user', 'requested_by_trainer', 'active', 'declined', 'closed');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('terms', 'health_data', 'share_structure', 'share_trainer', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."hydration_container" AS ENUM('glass', 'bottle_05', 'bottle_1', 'bottle_15', 'flask_05', 'custom');--> statement-breakpoint
CREATE TYPE "public"."conversation_type" AS ENUM('direct', 'group');--> statement-breakpoint
CREATE TYPE "public"."email_token_purpose" AS ENUM('verify_email', 'reset_password');--> statement-breakpoint
CREATE TYPE "public"."exercise_source" AS ENUM('ai', 'team', 'trainer');--> statement-breakpoint
CREATE TYPE "public"."goal" AS ENUM('lose_weight', 'tone', 'strength', 'endurance', 'health');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'accepted', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."level" AS ENUM('beginner', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('video', 'image');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('pending', 'approved', 'removed');--> statement-breakpoint
CREATE TYPE "public"."parental_consent_status" AS ENUM('pending', 'confirmed', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."plan_author" AS ENUM('ai', 'trainer');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('active', 'archived');--> statement-breakpoint
CREATE TYPE "public"."device_platform" AS ENUM('ios', 'android', 'web');--> statement-breakpoint
CREATE TYPE "public"."point_reason" AS ENUM('subscription', 'renewal', 'bonus', 'redemption', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."post_visibility" AS ENUM('structure', 'global');--> statement-breakpoint
CREATE TYPE "public"."redemption_status" AS ENUM('requested', 'approved', 'rejected', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('pending', 'rewarded', 'void');--> statement-breakpoint
CREATE TYPE "public"."report_outcome" AS ENUM('pending', 'dismissed', 'removed', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."report_target" AS ENUM('post', 'comment', 'message', 'user', 'trainer_video');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('draft', 'pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('user', 'personal_trainer', 'owner', 'instructor', 'admin');--> statement-breakpoint
CREATE TYPE "public"."sensor_owner" AS ENUM('btech', 'structure', 'user');--> statement-breakpoint
CREATE TYPE "public"."sensor_status" AS ENUM('in_stock', 'active', 'faulty', 'retired');--> statement-breakpoint
CREATE TYPE "public"."set_source" AS ENUM('manual', 'sensor');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('female', 'male', 'other', 'undisclosed');--> statement-breakpoint
CREATE TYPE "public"."shop_category" AS ENUM('sensor', 'equipment', 'apparel', 'accessories');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('instructor', 'personal_trainer');--> statement-breakpoint
CREATE TYPE "public"."store" AS ENUM('app_store', 'google_play');--> statement-breakpoint
CREATE TYPE "public"."structure_type" AS ENUM('gym', 'asd', 'ssd', 'other');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trial', 'active', 'cancelled', 'expired', 'free');--> statement-breakpoint
CREATE TYPE "public"."trainer_structure_status" AS ENUM('invited_by_structure', 'requested_by_trainer', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'pending_parental_consent', 'suspended', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."video_visibility" AS ENUM('clients', 'community');--> statement-breakpoint
CREATE TYPE "public"."profile_visibility" AS ENUM('private', 'public');--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"structure_id" uuid,
	"trainer_id" uuid,
	"channel" "acquisition_channel",
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"data" jsonb,
	"ip" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon_url" text
);
--> statement-breakpoint
CREATE TABLE "challenge_participants" (
	"challenge_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_participants_challenge_id_user_id_pk" PRIMARY KEY("challenge_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid,
	"title" text NOT NULL,
	"kind" text DEFAULT '14_days' NOT NULL,
	"target_sessions" integer,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"status" "client_link_status" NOT NULL,
	"data_consent" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone,
	CONSTRAINT "conversation_participants_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "conversation_type" DEFAULT 'direct' NOT NULL,
	"title" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" "device_platform" NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "email_token_purpose" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"video_url" text,
	"muscles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"equipment" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"level" "level" DEFAULT 'beginner' NOT NULL,
	"contraindications" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source" "exercise_source" DEFAULT 'ai' NOT NULL,
	"review_status" "review_status" DEFAULT 'draft' NOT NULL,
	"reviewed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hydration_goals" (
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"goal_ml" integer NOT NULL,
	CONSTRAINT "hydration_goals_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "hydration_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"container" "hydration_container" NOT NULL,
	"amount_ml" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instructor_assignments" (
	"instructor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instructor_assignments_instructor_id_user_id_pk" PRIMARY KEY("instructor_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "instructors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"structure_id" uuid NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"weight_kg" numeric(5, 1),
	"circumferences" jsonb,
	"health_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"text" text,
	"attachments" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parental_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_name" text NOT NULL,
	"parent_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" "parental_consent_status" DEFAULT 'pending' NOT NULL,
	"method" text DEFAULT 'email_link' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_ip" text
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"author" "plan_author" NOT NULL,
	"author_trainer_id" uuid,
	"week_start" date NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rationale" text,
	"status" "plan_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"reason" "point_reason" NOT NULL,
	"points" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"subscription_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"media_url" text,
	"media_type" "media_type",
	"text" text,
	"visibility" "post_visibility" DEFAULT 'structure' NOT NULL,
	"structure_id" uuid,
	"moderation_status" "moderation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_user_id" uuid NOT NULL,
	"referred_user_id" uuid NOT NULL,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"rewarded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"target_type" "report_target" NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"outcome" "report_outcome" DEFAULT 'pending' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reward_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reward_id" uuid NOT NULL,
	"trainer_id" uuid NOT NULL,
	"points" integer NOT NULL,
	"status" "redemption_status" DEFAULT 'requested' NOT NULL,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image_url" text,
	"points_required" integer NOT NULL,
	"stock" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "risk_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"value" numeric(4, 3) NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensor_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"set_log_id" uuid NOT NULL,
	"sensor_id" uuid,
	"reps" integer NOT NULL,
	"avg_velocity" numeric(6, 3),
	"regularity" numeric(5, 2),
	"time_under_tension_ms" integer,
	"per_rep" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"serial" text NOT NULL,
	"firmware" text,
	"owner_type" "sensor_owner" DEFAULT 'btech' NOT NULL,
	"owner_structure_id" uuid,
	"owner_user_id" uuid,
	"free_of_charge" boolean DEFAULT false NOT NULL,
	"status" "sensor_status" DEFAULT 'in_stock' NOT NULL,
	"paired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"trainer_video_id" uuid,
	"position" integer NOT NULL,
	"target_sets" integer NOT NULL,
	"target_reps" integer NOT NULL,
	"target_load_kg" numeric(6, 2),
	"rest_seconds" integer
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_exercise_id" uuid NOT NULL,
	"set_number" integer NOT NULL,
	"reps" integer NOT NULL,
	"load_kg" numeric(6, 2),
	"source" "set_source" DEFAULT 'manual' NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"category" "shop_category" NOT NULL,
	"image_url" text,
	"blor_url" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sport_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"weight_kg" numeric(5, 1),
	"height_cm" integer,
	"goal" "goal",
	"level" "level",
	"days_per_week" integer,
	"equipment" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"limitations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "staff_role" NOT NULL,
	"token_hash" text NOT NULL,
	"status" "invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"display_name" text NOT NULL,
	"type" "structure_type" NOT NULL,
	"vat_number" text,
	"address" text,
	"city" text NOT NULL,
	"province" text NOT NULL,
	"phone" text,
	"members_estimate" integer,
	"code" text,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"owner_user_id" uuid NOT NULL,
	"pilot" boolean DEFAULT false NOT NULL,
	"commercial_notes" text,
	"affiliated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "subscription_status" NOT NULL,
	"trial_started_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"first_charge_at" timestamp with time zone,
	"commitment_ends_at" timestamp with time zone,
	"installments_paid" integer DEFAULT 0 NOT NULL,
	"store" "store",
	"store_transaction_id" text,
	"cancelled_at" timestamp with time zone,
	"renewed_from_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainer_structures" (
	"trainer_id" uuid NOT NULL,
	"structure_id" uuid NOT NULL,
	"status" "trainer_structure_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trainer_structures_trainer_id_structure_id_pk" PRIMARY KEY("trainer_id","structure_id")
);
--> statement-breakpoint
CREATE TABLE "trainer_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trainer_id" uuid NOT NULL,
	"exercise_id" uuid,
	"title" text NOT NULL,
	"video_url" text NOT NULL,
	"visibility" "video_visibility" DEFAULT 'clients' NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"specializations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bio" text,
	"invite_code" text NOT NULL,
	"public_profile" boolean DEFAULT true NOT NULL,
	"status" "approval_status" DEFAULT 'pending' NOT NULL,
	"status_reason" text,
	"points_balance" integer DEFAULT 0 NOT NULL,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"user_id" uuid NOT NULL,
	"badge_id" uuid NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_badges_user_id_badge_id_pk" PRIMARY KEY("user_id","badge_id")
);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "user_consents" (
	"user_id" uuid NOT NULL,
	"type" "consent_type" NOT NULL,
	"granted" boolean NOT NULL,
	"version" text DEFAULT '1' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_consents_user_id_type_pk" PRIMARY KEY("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"auth_provider" "auth_provider" DEFAULT 'email' NOT NULL,
	"provider_subject" text,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"birth_date" date,
	"sex" "sex",
	"role" "role" DEFAULT 'user' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"profile_visibility" "profile_visibility" DEFAULT 'private' NOT NULL,
	"avatar_url" text,
	"structure_id" uuid,
	"structure_joined_at" timestamp with time zone,
	"acquisition_channel" "acquisition_channel" DEFAULT 'organic' NOT NULL,
	"acquisition_campaign" text,
	"referral_code" text,
	"email_verified_at" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid,
	"user_id" uuid NOT NULL,
	"title" text,
	"scheduled_date" date NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"perceived_effort" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_links" ADD CONSTRAINT "client_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_links" ADD CONSTRAINT "client_links_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_tokens" ADD CONSTRAINT "email_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hydration_goals" ADD CONSTRAINT "hydration_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hydration_logs" ADD CONSTRAINT "hydration_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_assignments" ADD CONSTRAINT "instructor_assignments_instructor_id_instructors_id_fk" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructor_assignments" ADD CONSTRAINT "instructor_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instructors" ADD CONSTRAINT "instructors_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parental_consents" ADD CONSTRAINT "parental_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_author_trainer_id_trainers_id_fk" FOREIGN KEY ("author_trainer_id") REFERENCES "public"."trainers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_movements" ADD CONSTRAINT "point_movements_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_movements" ADD CONSTRAINT "point_movements_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_user_id_users_id_fk" FOREIGN KEY ("referrer_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_user_id_users_id_fk" FOREIGN KEY ("referred_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_reward_id_rewards_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."rewards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemptions" ADD CONSTRAINT "reward_redemptions_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "risk_scores" ADD CONSTRAINT "risk_scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_set_log_id_set_logs_id_fk" FOREIGN KEY ("set_log_id") REFERENCES "public"."set_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_sensor_id_sensors_id_fk" FOREIGN KEY ("sensor_id") REFERENCES "public"."sensors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_owner_structure_id_structures_id_fk" FOREIGN KEY ("owner_structure_id") REFERENCES "public"."structures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensors" ADD CONSTRAINT "sensors_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_session_id_workout_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_exercises" ADD CONSTRAINT "session_exercises_trainer_video_id_trainer_videos_id_fk" FOREIGN KEY ("trainer_video_id") REFERENCES "public"."trainer_videos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_session_exercise_id_session_exercises_id_fk" FOREIGN KEY ("session_exercise_id") REFERENCES "public"."session_exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sport_profiles" ADD CONSTRAINT "sport_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_invites" ADD CONSTRAINT "staff_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structures" ADD CONSTRAINT "structures_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_structures" ADD CONSTRAINT "trainer_structures_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_structures" ADD CONSTRAINT "trainer_structures_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_videos" ADD CONSTRAINT "trainer_videos_trainer_id_trainers_id_fk" FOREIGN KEY ("trainer_id") REFERENCES "public"."trainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainer_videos" ADD CONSTRAINT "trainer_videos_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainers" ADD CONSTRAINT "trainers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_badges_id_fk" FOREIGN KEY ("badge_id") REFERENCES "public"."badges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_consents" ADD CONSTRAINT "user_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_structure_id_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."structures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_type_idx" ON "analytics_events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_structure_idx" ON "analytics_events" USING btree ("structure_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "badges_code_uq" ON "badges" USING btree ("code");--> statement-breakpoint
CREATE INDEX "client_links_user_idx" ON "client_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "client_links_trainer_idx" ON "client_links" USING btree ("trainer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "device_tokens_token_uq" ON "device_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "email_tokens_hash_uq" ON "email_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "exercises_slug_uq" ON "exercises" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "hydration_logs_user_idx" ON "hydration_logs" USING btree ("user_id","logged_at");--> statement-breakpoint
CREATE UNIQUE INDEX "instructors_user_uq" ON "instructors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "instructors_structure_idx" ON "instructors" USING btree ("structure_id");--> statement-breakpoint
CREATE INDEX "measurements_user_idx" ON "measurements" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "parental_consents_user_uq" ON "parental_consents" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parental_consents_token_uq" ON "parental_consents" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "plans_user_idx" ON "plans" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "point_movements_trainer_idx" ON "point_movements" USING btree ("trainer_id","created_at");--> statement-breakpoint
CREATE INDEX "post_comments_post_idx" ON "post_comments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "posts_feed_idx" ON "posts" USING btree ("visibility","created_at");--> statement-breakpoint
CREATE INDEX "posts_structure_idx" ON "posts" USING btree ("structure_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_referred_uq" ON "referrals" USING btree ("referred_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_hash_uq" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_outcome_idx" ON "reports" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "reward_redemptions_trainer_idx" ON "reward_redemptions" USING btree ("trainer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "risk_scores_user_day_uq" ON "risk_scores" USING btree ("user_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "sensor_readings_set_uq" ON "sensor_readings" USING btree ("set_log_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sensors_serial_uq" ON "sensors" USING btree ("serial");--> statement-breakpoint
CREATE INDEX "session_exercises_session_idx" ON "session_exercises" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "set_logs_session_exercise_idx" ON "set_logs" USING btree ("session_exercise_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_invites_token_uq" ON "staff_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "staff_invites_structure_idx" ON "staff_invites" USING btree ("structure_id");--> statement-breakpoint
CREATE UNIQUE INDEX "structures_code_uq" ON "structures" USING btree ("code");--> statement-breakpoint
CREATE INDEX "structures_status_idx" ON "structures" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "trainer_videos_trainer_idx" ON "trainer_videos" USING btree ("trainer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trainers_user_uq" ON "trainers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trainers_invite_code_uq" ON "trainers" USING btree ("invite_code");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_referral_code_uq" ON "users" USING btree ("referral_code");--> statement-breakpoint
CREATE INDEX "users_structure_idx" ON "users" USING btree ("structure_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "workout_sessions_user_idx" ON "workout_sessions" USING btree ("user_id","scheduled_date");
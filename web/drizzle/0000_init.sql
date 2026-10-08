CREATE TYPE "public"."discipline" AS ENUM('batting', 'bowling');--> statement-breakpoint
CREATE TYPE "public"."format" AS ENUM('test', 'odi', 't20i');--> statement-breakpoint
CREATE TYPE "public"."format_key" AS ENUM('test-m', 'odi-m', 't20i-m', 'test-w', 'odi-w', 't20i-w');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TABLE "career_stats" (
	"player_id" integer NOT NULL,
	"format_key" "format_key" NOT NULL,
	"matches" integer,
	"bat_innings" integer,
	"not_outs" integer,
	"runs" integer,
	"balls" integer,
	"outs" integer,
	"highest" integer,
	"highest_not_out" boolean,
	"hundreds" integer,
	"fifties" integer,
	"fours" integer,
	"sixes" integer,
	"dots" integer,
	"bat_avg" real,
	"bat_sr" real,
	"bowl_innings" integer,
	"bowl_balls" integer,
	"runs_conceded" integer,
	"wickets" integer,
	"maidens" integer,
	"bowl_dots" integer,
	"four_wkts" integer,
	"five_wkts" integer,
	"best_wickets" integer,
	"best_runs" integer,
	"bowl_avg" real,
	"bowl_econ" real,
	"bowl_sr" real,
	"strengths" smallint,
	"weaknesses" smallint,
	"stats_hash" text NOT NULL,
	"analysis_hash" text NOT NULL,
	CONSTRAINT "career_stats_player_id_format_key_pk" PRIMARY KEY("player_id","format_key")
);
--> statement-breakpoint
CREATE TABLE "dataset_meta" (
	"id" serial PRIMARY KEY NOT NULL,
	"build_id" text NOT NULL,
	"schema_version" smallint NOT NULL,
	"source_fingerprint" text,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"generated_at" timestamp with time zone NOT NULL,
	"manifest" jsonb NOT NULL,
	"cohorts" jsonb,
	"counts" jsonb,
	"changes" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "dismissal_counts" (
	"player_id" integer NOT NULL,
	"format_key" "format_key" NOT NULL,
	"discipline" "discipline" NOT NULL,
	"kind" text NOT NULL,
	"subject" text NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "innings" (
	"player_id" integer NOT NULL,
	"format_key" "format_key" NOT NULL,
	"discipline" "discipline" NOT NULL,
	"match_id" text NOT NULL,
	"played_on" date NOT NULL,
	"opponent" text NOT NULL,
	"innings_no" smallint,
	"runs" smallint,
	"balls_faced" smallint,
	"fours" smallint,
	"sixes" smallint,
	"position" smallint,
	"out" boolean,
	"chase" boolean,
	"dismissal" text,
	"dismissed_by_id" text,
	"balls_bowled" smallint,
	"runs_conceded" smallint,
	"wickets" smallint,
	"maidens" smallint
);
--> statement-breakpoint
CREATE TABLE "match_replays" (
	"match_id" text PRIMARY KEY NOT NULL,
	"gz" "bytea" NOT NULL,
	"bytes" integer NOT NULL,
	"balls" integer NOT NULL,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"gender" "gender" NOT NULL,
	"format" "format" NOT NULL,
	"format_key" "format_key" NOT NULL,
	"match_type_number" integer,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"season" text NOT NULL,
	"event_name" text,
	"event_stage" text,
	"event_group" text,
	"event_match_number" smallint,
	"venue" text NOT NULL,
	"venue_key" text NOT NULL,
	"city" text,
	"country" text,
	"team1_id" text NOT NULL,
	"team1" text NOT NULL,
	"team2_id" text NOT NULL,
	"team2" text NOT NULL,
	"toss_winner" text,
	"toss_decision" text,
	"result_type" text NOT NULL,
	"winner_id" text,
	"winner" text,
	"margin_runs" smallint,
	"margin_wickets" smallint,
	"margin_innings" boolean NOT NULL,
	"method" text,
	"eliminator" text,
	"result_text" text NOT NULL,
	"player_of_match" jsonb NOT NULL,
	"innings" jsonb NOT NULL,
	"scheduled_overs" smallint,
	"missing" text[] DEFAULT '{}'::text[] NOT NULL,
	"has_replay" boolean NOT NULL,
	"featured_rank" smallint,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text,
	"gender" "gender" NOT NULL,
	"country" text,
	"teams" text[] DEFAULT '{}'::text[] NOT NULL,
	"team_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"role" text,
	"batting_hand" text,
	"bowling_type" text,
	"cricinfo_id" text,
	"born" text,
	"debut" date,
	"last_played" date,
	"sample_balls" integer NOT NULL,
	"overall_rating" real,
	"form_index" real,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_source_id_unique" UNIQUE("source_id"),
	CONSTRAINT "players_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "profile_dimensions" (
	"player_id" integer NOT NULL,
	"format_key" "format_key" NOT NULL,
	"axis" text NOT NULL,
	"label" text NOT NULL,
	"discipline" "discipline" NOT NULL,
	"value" real NOT NULL,
	"percentile" real NOT NULL,
	"balls" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "splits" (
	"player_id" integer NOT NULL,
	"format_key" "format_key" NOT NULL,
	"discipline" "discipline" NOT NULL,
	"dimension" text NOT NULL,
	"subject" text NOT NULL,
	"label" text,
	"balls" integer NOT NULL,
	"runs" integer NOT NULL,
	"outs" integer,
	"wickets" integer,
	"dots" integer,
	"fours" integer,
	"sixes" integer,
	"innings" smallint
);
--> statement-breakpoint
CREATE TABLE "team_summaries" (
	"team_id" text NOT NULL,
	"format_key" "format_key" NOT NULL,
	"matches" integer NOT NULL,
	"won" integer NOT NULL,
	"lost" integer NOT NULL,
	"tied" integer NOT NULL,
	"drawn" integer NOT NULL,
	"no_result" integer NOT NULL,
	"win_pct" real,
	"first_date" date,
	"last_date" date,
	"detail" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	CONSTRAINT "team_summaries_team_id_format_key_pk" PRIMARY KEY("team_id","format_key")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"gender" "gender" NOT NULL,
	"label" text NOT NULL,
	"first_match" date,
	"last_match" date,
	"matches" integer NOT NULL,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "traits" (
	"player_id" integer NOT NULL,
	"format_key" "format_key" NOT NULL,
	"kind" text NOT NULL,
	"rank" smallint NOT NULL,
	"claim_id" text NOT NULL,
	"discipline" "discipline" NOT NULL,
	"dimension_key" text NOT NULL,
	"dimension" text NOT NULL,
	"subject_key" text NOT NULL,
	"subject" text NOT NULL,
	"metric" text NOT NULL,
	"metric_label" text NOT NULL,
	"value" real NOT NULL,
	"baseline" real,
	"cohort_median" real NOT NULL,
	"percentile" real NOT NULL,
	"balls" integer NOT NULL,
	"confidence" text NOT NULL,
	"higher_is_better" boolean NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"key" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"country" text,
	"formats" jsonb NOT NULL,
	"content_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "win_models" (
	"format_key" "format_key" PRIMARY KEY NOT NULL,
	"model" jsonb NOT NULL,
	"venues" jsonb NOT NULL,
	"validation" jsonb NOT NULL,
	"golden" jsonb NOT NULL,
	"matches" integer NOT NULL,
	"half_life_years" real,
	"holdout_from" date,
	"content_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "yearly_stats" (
	"player_id" integer NOT NULL,
	"format_key" "format_key" NOT NULL,
	"year" smallint NOT NULL,
	"bat_innings" integer,
	"runs" integer,
	"balls" integer,
	"outs" integer,
	"fours" integer,
	"sixes" integer,
	"bowl_innings" integer,
	"bowl_balls" integer,
	"runs_conceded" integer,
	"wickets" integer,
	CONSTRAINT "yearly_stats_player_id_format_key_year_pk" PRIMARY KEY("player_id","format_key","year")
);
--> statement-breakpoint
ALTER TABLE "career_stats" ADD CONSTRAINT "career_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dismissal_counts" ADD CONSTRAINT "dismissal_counts_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "innings" ADD CONSTRAINT "innings_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_replays" ADD CONSTRAINT "match_replays_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_dimensions" ADD CONSTRAINT "profile_dimensions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "splits" ADD CONSTRAINT "splits_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_summaries" ADD CONSTRAINT "team_summaries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traits" ADD CONSTRAINT "traits_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "yearly_stats" ADD CONSTRAINT "yearly_stats_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "career_stats_fk_runs_idx" ON "career_stats" USING btree ("format_key","runs" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "career_stats_fk_wickets_idx" ON "career_stats" USING btree ("format_key","wickets" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "dataset_meta_status_finished_idx" ON "dataset_meta" USING btree ("status","finished_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "dismissal_counts_player_fk_idx" ON "dismissal_counts" USING btree ("player_id","format_key");--> statement-breakpoint
CREATE INDEX "innings_player_fk_idx" ON "innings" USING btree ("player_id","format_key");--> statement-breakpoint
CREATE INDEX "matches_end_date_idx" ON "matches" USING btree ("end_date" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "matches_fk_end_date_idx" ON "matches" USING btree ("format_key","end_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "matches_team1_end_date_idx" ON "matches" USING btree ("team1_id","end_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "matches_team2_end_date_idx" ON "matches" USING btree ("team2_id","end_date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "players_gender_last_played_idx" ON "players" USING btree ("gender","last_played");--> statement-breakpoint
CREATE INDEX "profile_dimensions_player_fk_idx" ON "profile_dimensions" USING btree ("player_id","format_key");--> statement-breakpoint
CREATE INDEX "splits_player_fk_idx" ON "splits" USING btree ("player_id","format_key");--> statement-breakpoint
CREATE INDEX "teams_gender_name_idx" ON "teams" USING btree ("gender","name");--> statement-breakpoint
CREATE INDEX "traits_player_fk_idx" ON "traits" USING btree ("player_id","format_key");
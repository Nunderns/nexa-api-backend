-- Reach counters on the post itself. Denormalized like `comment_count`: the
-- detail page reads them on every load.
ALTER TABLE "posts" ADD COLUMN "view_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "posts" ADD COLUMN "share_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "posts" ADD COLUMN "repost_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "posts" ADD COLUMN "award_count" INTEGER NOT NULL DEFAULT 0;

-- Raw view events. `viewer_key` is a hash (never a raw user id or IP) so the
-- table can be used for deduplication without being able to re-identify
-- anonymous readers.
CREATE TABLE "post_views" (
    "id" SERIAL NOT NULL,
    "post_id" INTEGER NOT NULL,
    "viewer_key" VARCHAR(64) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL DEFAULT 'XX',
    "viewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_views_pkey" PRIMARY KEY ("id")
);

-- Serves the per-visitor dedupe window.
CREATE INDEX "post_views_post_id_viewer_key_viewed_at_idx" ON "post_views"("post_id", "viewer_key", "viewed_at");

-- Serves the hourly rollup read and any time-range filter.
CREATE INDEX "post_views_post_id_viewed_at_idx" ON "post_views"("post_id", "viewed_at");

-- Hourly pre-aggregation split by country, so the insights screen never scans
-- the raw event table.
CREATE TABLE "post_view_stats" (
    "post_id" INTEGER NOT NULL,
    "bucket_start" TIMESTAMPTZ NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_view_stats_pkey" PRIMARY KEY ("post_id", "bucket_start", "country_code")
);

-- Covers "views of this post over time" and "by country" as index scans.
CREATE INDEX "post_view_stats_post_id_bucket_start_idx" ON "post_view_stats"("post_id", "bucket_start");

-- Feed and profile read paths, which were full scans before this migration.
CREATE INDEX "posts_community_id_is_deleted_score_idx" ON "posts"("community_id", "is_deleted", "score");
CREATE INDEX "posts_author_id_is_deleted_idx" ON "posts"("author_id", "is_deleted");
CREATE INDEX "posts_created_at_idx" ON "posts"("created_at");

-- AddForeignKey
ALTER TABLE "post_views" ADD CONSTRAINT "post_views_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "post_view_stats" ADD CONSTRAINT "post_view_stats_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `bucket_start` is only ever written as the truncated hour, but nothing in the
-- schema forces it. A stray un-truncated timestamp would silently create a
-- second bucket for the same hour and split the chart's totals in half, so the
-- invariant the rollup relies on is enforced here.
--
-- Compared field by field rather than with `date_trunc('hour', ...)`, because
-- `date_trunc` on a `timestamptz` truncates in the *session* time zone: the
-- constraint would then hold or fail depending on who is connected.
ALTER TABLE "post_view_stats" ADD CONSTRAINT "post_view_stats_bucket_start_truncated_check" CHECK (
  EXTRACT(MINUTE FROM "bucket_start") = 0
  AND EXTRACT(SECOND FROM "bucket_start") = 0
  AND EXTRACT(MILLISECOND FROM "bucket_start") = 0
);
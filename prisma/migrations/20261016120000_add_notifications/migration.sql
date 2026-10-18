-- Notifications and per-user notification preferences.
--
-- Only notification objects are created here. Rows never hold user-written
-- text or message contents: title/body are server-side templates and
-- metadata carries identifiers only.

CREATE TYPE "NotificationType" AS ENUM ('POST_REPLY', 'COMMENT_REPLY', 'USER_MENTION', 'POST_UPVOTE', 'COMMENT_UPVOTE', 'DIRECT_MESSAGE', 'SYSTEM');

-- What `resource_id` points at. Polymorphic, so there is no foreign key.
CREATE TYPE "NotificationResourceType" AS ENUM ('POST', 'COMMENT', 'CHAT');

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "recipient_id" INTEGER NOT NULL,
    "actor_id" INTEGER,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(300) NOT NULL,
    "resource_type" "NotificationResourceType",
    "resource_id" INTEGER,
    "metadata" JSONB,
    "dedupe_key" VARCHAR(120),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    -- A resource reference is either complete or absent.
    CONSTRAINT "notifications_resource_check" CHECK (("resource_type" IS NULL) = ("resource_id" IS NULL)),
    -- `read_at` is set exactly when the row is read, so the two cannot drift.
    CONSTRAINT "notifications_read_check" CHECK ("is_read" = ("read_at" IS NOT NULL))
);

-- Missing row = every category enabled, so existing users need no backfill.
CREATE TABLE "notification_preferences" (
    "user_id" INTEGER NOT NULL,
    "post_replies" BOOLEAN NOT NULL DEFAULT true,
    "comment_replies" BOOLEAN NOT NULL DEFAULT true,
    "mentions" BOOLEAN NOT NULL DEFAULT true,
    "votes" BOOLEAN NOT NULL DEFAULT true,
    "direct_messages" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("user_id")
);

-- Newest-first listing with a stable (created_at, id) cursor.
CREATE INDEX "notifications_recipient_id_created_at_id_idx" ON "notifications"("recipient_id", "created_at" DESC, "id" DESC);

-- Unread listing and the unread count.
CREATE INDEX "notifications_recipient_id_is_read_created_at_idx" ON "notifications"("recipient_id", "is_read", "created_at" DESC);

-- Serves the SET NULL cascade when an actor is deleted.
CREATE INDEX "notifications_actor_id_idx" ON "notifications"("actor_id");

-- Idempotency: one notification per (recipient, event).
CREATE UNIQUE INDEX "notifications_recipient_id_dedupe_key_key" ON "notifications"("recipient_id", "dedupe_key");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

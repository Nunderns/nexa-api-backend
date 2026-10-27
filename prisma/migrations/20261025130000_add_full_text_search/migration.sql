-- Full-text search over posts, communities and users.
--
-- The 'simple' configuration does no stemming, so it treats Portuguese and
-- English content alike; unaccent makes "cafe" match "café". Names and titles
-- weigh A, longer free text weighs B.

CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() is STABLE because its dictionary is looked up at call time, so a
-- generated column cannot use it. Naming the dictionary explicitly pins it,
-- which makes this wrapper safe to declare IMMUTABLE.
CREATE OR REPLACE FUNCTION immutable_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- AlterTable
ALTER TABLE "posts" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', immutable_unaccent(coalesce("title", ''))), 'A') ||
  setweight(to_tsvector('simple', immutable_unaccent(coalesce("content", ''))), 'B')
) STORED;

-- AlterTable
ALTER TABLE "communities" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', immutable_unaccent(coalesce("name", '') || ' ' || coalesce("display_name", ''))), 'A') ||
  setweight(to_tsvector('simple', immutable_unaccent(coalesce("description", ''))), 'B')
) STORED;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', immutable_unaccent(coalesce("username", '') || ' ' || coalesce("display_name", ''))), 'A') ||
  setweight(to_tsvector('simple', immutable_unaccent(coalesce("bio", ''))), 'B')
) STORED;

-- CreateIndex
CREATE INDEX "posts_search_vector_idx" ON "posts" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "communities_search_vector_idx" ON "communities" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "users_search_vector_idx" ON "users" USING GIN ("search_vector");

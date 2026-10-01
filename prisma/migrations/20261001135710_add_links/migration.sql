-- CreateTable
CREATE TABLE "links" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "original_url" TEXT NOT NULL,
    "visits" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "last_visited_at" TIMESTAMPTZ(3),

    CONSTRAINT "links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "links_code_key" ON "links"("code");

-- Hand-written: Prisma cannot express CHECK constraints. The domain checks first, the
-- database checks last; `prisma migrate diff` ignores CHECKs, so they cause no drift.
ALTER TABLE "links"
    ADD CONSTRAINT "links_code_format_check" CHECK ("code" ~ '^[0-9A-Za-z]{7}$'),
    ADD CONSTRAINT "links_visits_non_negative_check" CHECK ("visits" >= 0),
    ADD CONSTRAINT "links_original_url_length_check" CHECK (char_length("original_url") BETWEEN 1 AND 2048);

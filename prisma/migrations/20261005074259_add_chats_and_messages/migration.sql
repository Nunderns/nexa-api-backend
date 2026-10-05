-- CreateTable
CREATE TABLE "chats" (
    "id" SERIAL NOT NULL,
    "user_one_id" INTEGER NOT NULL,
    "user_two_id" INTEGER NOT NULL,
    "last_message_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "chat_id" INTEGER NOT NULL,
    "sender_id" INTEGER NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chats_user_one_id_last_message_at_idx" ON "chats"("user_one_id", "last_message_at");

-- CreateIndex
CREATE INDEX "chats_user_two_id_last_message_at_idx" ON "chats"("user_two_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "chats_user_one_id_user_two_id_key" ON "chats"("user_one_id", "user_two_id");

-- CreateIndex
CREATE INDEX "messages_chat_id_id_idx" ON "messages"("chat_id", "id");

-- CreateIndex
CREATE INDEX "messages_chat_id_created_at_idx" ON "messages"("chat_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_one_id_fkey" FOREIGN KEY ("user_one_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_user_two_id_fkey" FOREIGN KEY ("user_two_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Canonical ordering of the participant pair. Prisma cannot express CHECK
-- constraints, so it is declared here. The unique index above is what
-- actually prevents duplicates; this constraint makes the invariant that the
-- application relies on ("user_one_id is always the lower id") true by
-- construction, so a reversed pair can never be inserted by any code path.
ALTER TABLE "chats" ADD CONSTRAINT "chats_participant_order_check" CHECK ("user_one_id" < "user_two_id");

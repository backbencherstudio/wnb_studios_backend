-- CreateTable
CREATE TABLE "Reels" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    "title" TEXT,
    "description" TEXT,
    "storage_provider" TEXT,
    "s3_bucket" TEXT,
    "s3_key" TEXT,
    "s3_thumb_key" TEXT,
    "original_name" TEXT,
    "file_size_bytes" BIGINT,
    "etag" TEXT,
    "checksum_sha256" TEXT,
    "video" TEXT,
    "userId" TEXT,

    CONSTRAINT "Reels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReelComment" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "reelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "ReelComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ReelLikes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ReelLikes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ReelCommentReplies" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ReelCommentReplies_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "ReelComment_reelId_idx" ON "ReelComment"("reelId");

-- CreateIndex
CREATE INDEX "ReelComment_userId_idx" ON "ReelComment"("userId");

-- CreateIndex
CREATE INDEX "_ReelLikes_B_index" ON "_ReelLikes"("B");

-- CreateIndex
CREATE INDEX "_ReelCommentReplies_B_index" ON "_ReelCommentReplies"("B");

-- AddForeignKey
ALTER TABLE "Reels" ADD CONSTRAINT "Reels_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelComment" ADD CONSTRAINT "ReelComment_reelId_fkey" FOREIGN KEY ("reelId") REFERENCES "Reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReelComment" ADD CONSTRAINT "ReelComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReelLikes" ADD CONSTRAINT "_ReelLikes_A_fkey" FOREIGN KEY ("A") REFERENCES "Reels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReelLikes" ADD CONSTRAINT "_ReelLikes_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReelCommentReplies" ADD CONSTRAINT "_ReelCommentReplies_A_fkey" FOREIGN KEY ("A") REFERENCES "ReelComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReelCommentReplies" ADD CONSTRAINT "_ReelCommentReplies_B_fkey" FOREIGN KEY ("B") REFERENCES "ReelComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

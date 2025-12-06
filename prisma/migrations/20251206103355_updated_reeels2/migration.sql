-- CreateTable
CREATE TABLE "_ReelCommentLikes" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ReelCommentLikes_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ReelCommentLikes_B_index" ON "_ReelCommentLikes"("B");

-- AddForeignKey
ALTER TABLE "_ReelCommentLikes" ADD CONSTRAINT "_ReelCommentLikes_A_fkey" FOREIGN KEY ("A") REFERENCES "ReelComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ReelCommentLikes" ADD CONSTRAINT "_ReelCommentLikes_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

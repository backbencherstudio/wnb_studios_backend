/*
  Warnings:

  - You are about to drop the `_ReelCommentReplies` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "_ReelCommentReplies" DROP CONSTRAINT "_ReelCommentReplies_A_fkey";

-- DropForeignKey
ALTER TABLE "_ReelCommentReplies" DROP CONSTRAINT "_ReelCommentReplies_B_fkey";

-- DropTable
DROP TABLE "_ReelCommentReplies";

-- CreateIndex
CREATE INDEX "ReelComment_parentId_idx" ON "ReelComment"("parentId");

-- AddForeignKey
ALTER TABLE "ReelComment" ADD CONSTRAINT "ReelComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ReelComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

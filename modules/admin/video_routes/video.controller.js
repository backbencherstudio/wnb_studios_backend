import { PrismaClient } from "@prisma/client";
import { mediaQueue } from "../../libs/queue.js";
const prisma = new PrismaClient();

export const uploadAReel = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.files || !req.files.file)
      return res.status(400).json({ error: "Video file is required" });

    const { title, description, genre, category_id, type } = req.body;
    const videoFile = req.files.file[0];
    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

    const content = await prisma.reels.create({
      data: {
        title: title ?? null,
        description: description ?? null,
        original_name: videoFile.originalname,
        file_size_bytes: BigInt(videoFile.size),
        userId: req.user?.userId,
      },
    });

    const videoUrl = `/uploads/videos/${videoFile.filename}`;
    const thumbnailUrl = thumbnailFile
      ? `/uploads/thumbnails/${thumbnailFile.filename}`
      : null;

    res.json({
      id: content.id,
      status: content.content_status,
      videoUrl: videoUrl,
    });

    await mediaQueue.add(
      "push-to-s3",
      {
        contentId: content.id,
        localPath: videoFile.path,
      },
      {
        attempts: 5,
        backoff: { type: "exponential", delay: 30_000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );
  } catch (err) {
    next(err);
    console.log("Error uploading video and thumbnail:", err);
  }
};
export const likeAReel = async (req, res) => {
  const { reelId } = req.params;
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const reel = await prisma.reels.findUnique({
      where: { id: reelId },
      select: { likes: { select: { id: true } } },
    });

    if (!reel) {
      return res.status(404).json({ success: false, error: "Reel not found" });
    }

    const alreadyLiked = reel.likes.some((like) => like.id === userId);

    const updatedReel = await prisma.reels.update({
      where: { id: reelId },
      data: {
        likes: {
          [alreadyLiked ? "disconnect" : "connect"]: { id: userId },
        },
      },
      select: {
        id: true,
        title: true,
        description: true,
        file_size_bytes: true,
        video: true,
        userId: true,
        likes: {
          select: {
            id: true,
            name: true,
            gender: true,
            status: true,
            avatar: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: "Reel like status updated successfully",
      data: updatedReel,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const commentOrReplyOnReel = async (req, res) => {
  try {
    const { reelId } = req.params;
    const { commentText, parentId } = req.body;
    const userId = req.user?.userId;

    if (!userId)
      return res.status(401).json({ success: false, error: "Unauthorized" });
    if (!commentText?.trim())
      return res
        .status(400)
        .json({ success: false, error: "Comment cannot be empty" });

    const reel = await prisma.reels.findUnique({ where: { id: reelId } });
    if (!reel)
      return res.status(404).json({ success: false, error: "Reel not found" });

    if (parentId) {
      const parentComment = await prisma.reelComment.findUnique({
        where: { id: parentId },
      });
      if (!parentComment)
        return res
          .status(404)
          .json({ success: false, error: "Parent comment not found" });
    }

    const comment = await prisma.reelComment.create({
      data: {
        content: commentText,
        reelId,
        userId,
        parentId: parentId ?? null,
      },
    });

    return res
      .status(201)
      .json({ success: true, message: "Comment added successfully" });
  } catch (error) {
    console.error("Error creating comment/reply:", error);
    return res.status(500).json({ success: false, error: "Server error" });
  }
};
export const getReelComments = async (req, res) => {
  try {
    const { reelId } = req.params;

    const comments = await prisma.reelComment.findMany({
      where: { reelId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        likes: {
          select: { id: true },
        },
      },
    });

    const commentMap = {};
    const topLevelComments = [];

    comments.forEach((comment) => {
      comment.likesCount = comment.likes.length || 0;
      comment.replies = [];
      delete comment.likes;

      commentMap[comment.id] = comment;

      if (!comment.parentId) {
        topLevelComments.push(comment);
      }
    });

    comments.forEach((comment) => {
      if (comment.parentId) {
        const parent = commentMap[comment.parentId];
        if (parent) {
          parent.replies.push(comment);
        }
      }
    });

    return res.status(200).json({ success: true, data: topLevelComments });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
export const getAllReels = async (req, res) => {
  try {
    const reels = await prisma.reels.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        likes: true,
        comments: true,
      },
    });

    const formattedReels = reels.map((reel) => ({
      id: reel.id,
      video: reel.video,
      owner: {
        id: reel.user.id,
        name: reel.user.name,
        avatar: reel.user.avatar,
      },
      likesCount: reel.likes.length,
      commentsCount: reel.comments.length,
    }));

    return res.status(200).json({ success: true, data: formattedReels });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};
export const likeAComment = async (req, res) => {
  const { commentId } = req.params;
  const userId = req.user?.userId;

  if (!userId) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const comment = await prisma.reelComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        likes: { select: { id: true } },
      },
    });

    if (!comment) {
      return res
        .status(404)
        .json({ success: false, error: "Comment not found" });
    }

    const alreadyLiked = comment.likes.some((like) => like.id === userId);

    const updatedComment = await prisma.reelComment.update({
      where: { id: commentId },
      data: {
        likes: {
          [alreadyLiked ? "disconnect" : "connect"]: { id: userId },
        },
      },
      select: {
        id: true,
        content: true,
        userId: true,
        likes: {
          select: {
            id: true,
          },
        },
      },
    });

    return res.status(200).json({
      success: true,
      message: alreadyLiked
        ? "Comment unliked successfully"
        : "Comment liked successfully",
      data: updatedComment,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, error: "Internal server error" });
  }
};

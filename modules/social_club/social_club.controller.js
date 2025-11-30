import { PrismaClient } from "@prisma/client";
import { s3 } from "../libs/s3Clinent.js";
import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadToS3 = async (file, folder) => {
  console.log(`Starting upload for ${file.filename} to folder ${folder}`);
  const fileStream = fs.createReadStream(file.path);
  const key = `clubs/${folder}/${Date.now()}_${file.filename}`;

  try {
    const upload = new Upload({
      client: s3,
      params: {
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key,
        Body: fileStream,
        ContentType: file.mimetype,
        ACL: "public-read",
      },
    });

    upload.on("httpUploadProgress", (progress) => {
      console.log(`Upload progress for ${file.filename}:`, progress);
    });

    await upload.done();
    console.log(`Upload completed for ${file.filename}`);

    // Remove local file after upload
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    if (process.env.AWS_S3_ENDPOINT) {
      return `${process.env.AWS_S3_ENDPOINT}/${process.env.AWS_S3_BUCKET}/${key}`;
    } else {
      return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    }
  } catch (error) {
    console.error(`Upload failed for ${file.filename}:`, error);
    throw error;
  }
};

// create a new social club
export const createSocialClub = async (req, res) => {
  try {
    const { name, description, visibility } = req.body;
    const ownerId = req.user?.userId;

    if (!ownerId) {
      return res.status(401).json({ message: "Unauthorized. Please log in." });
    }

    if (!name) {
      return res.status(400).json({ message: "Club name is required." });
    }

    let coverPhotoUrl = null;
    let avatarUrl = null;

    // Handle Cover Image Upload
    if (req.files && req.files["coverPhoto"] && req.files["coverPhoto"][0]) {
      coverPhotoUrl = await uploadToS3(req.files["coverPhoto"][0], "covers");
    }

    // Handle Avatar Upload
    if (req.files && req.files["avatar"] && req.files["avatar"][0]) {
      avatarUrl = await uploadToS3(req.files["avatar"][0], "avatars");
    }

    // Map visibility to Enum
    let privacy = "PUBLIC";
    if (visibility) {
      const v = visibility.toUpperCase();
      if (["PUBLIC", "PRIVATE", "FRIENDS"].includes(v)) {
        privacy = v;
      }
    }

    const newClub = await prisma.club.create({
      data: {
        name,
        description,
        coverPhoto: coverPhotoUrl,
        avatar: avatarUrl,
        visibility: privacy,
        ownerId: ownerId,
        members: {
          create: {
            userId: ownerId,
            role: "ADMIN",
          },
        },
        membersCount: 1,
      },
    });

    res.status(201).json({
      success: true,
      message: "Social club created successfully.",
      data: newClub,
    });
  } catch (error) {
    console.error("Error creating social club:", error);

    // Clean up local files if they exist and error occurred
    if (req.files) {
      if (req.files["coverPhoto"] && req.files["coverPhoto"][0]) {
        const path = req.files["coverPhoto"][0].path;
        if (fs.existsSync(path)) fs.unlinkSync(path);
      }
      if (req.files["avatar"] && req.files["avatar"][0]) {
        const path = req.files["avatar"][0].path;
        if (fs.existsSync(path)) fs.unlinkSync(path);
      }
    }

    res.status(500).json({
      error: "Failed to create social club.",
      details: error.message,
    });
  }
};

// Get all social clubs
export const getAllClubs = async (req, res) => {
  try {
    const clubs = await prisma.club.findMany({
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        _count: {
          select: { posts: true },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.status(200).json({
      success: true,
      message: "Clubs retrieved successfully",
      data: clubs,
    });
  } catch (error) {
    console.error("Error fetching clubs:", error);
    res.status(500).json({ error: "Failed to fetch clubs." });
  }
};

// Get a single social club by ID
export const getClubById = async (req, res) => {
  try {
    const { id } = req.params;

    const club = await prisma.club.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        posts: {
          orderBy: { createdAt: "desc" },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
            _count: {
              select: {
                likes: true,
                comments: true,
              },
            },
          },
        },
      },
    });

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    res.status(200).json({
      success: true,
      message: "Club retrieved successfully",
      data: club,
    });
  } catch (error) {
    console.error("Error fetching club:", error);
    res.status(500).json({ error: "Failed to fetch club." });
  }
};

// Update a social club
export const updateSocialClub = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, visibility } = req.body;
    const userId = req.user?.userId;

    const club = await prisma.club.findUnique({ where: { id } });

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    if (club.ownerId !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to update this club" });
    }

    let coverPhotoUrl = club.coverPhoto;
    let avatarUrl = club.avatar;

    if (req.files) {
      if (req.files["coverPhoto"] && req.files["coverPhoto"][0]) {
        coverPhotoUrl = await uploadToS3(req.files["coverPhoto"][0], "covers");
      }
      if (req.files["avatar"] && req.files["avatar"][0]) {
        avatarUrl = await uploadToS3(req.files["avatar"][0], "avatars");
      }
    }

    let privacy = club.visibility;
    if (visibility) {
      const v = visibility.toUpperCase();
      if (["PUBLIC", "PRIVATE", "FRIENDS"].includes(v)) {
        privacy = v;
      }
    }

    const updatedClub = await prisma.club.update({
      where: { id },
      data: {
        name: name || club.name,
        description: description || club.description,
        visibility: privacy,
        coverPhoto: coverPhotoUrl,
        avatar: avatarUrl,
      },
    });

    res.status(200).json({
      success: true,
      message: "Club updated successfully",
      data: updatedClub,
    });
  } catch (error) {
    console.error("Error updating club:", error);
    res.status(500).json({ error: "Failed to update club." });
  }
};

// Delete a social club
export const deleteSocialClub = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const club = await prisma.club.findUnique({ where: { id } });

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    if (club.ownerId !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this club" });
    }

    await prisma.club.delete({ where: { id } });

    res.status(200).json({
      success: true,
      message: "Club deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting club:", error);
    res.status(500).json({ error: "Failed to delete club." });
  }
};

// Create a post in a club
export const createClubPost = async (req, res) => {
  try {
    const { clubId, content, visibility } = req.body;
    const authorId = req.user?.userId;

    if (!clubId || !content) {
      return res
        .status(400)
        .json({ message: "Club ID and content are required" });
    }

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    let mediaUrl = null;
    let mediaType = null;

    if (req.file) {
      mediaUrl = await uploadToS3(req.file, "posts");
      if (req.file.mimetype.startsWith("image/")) {
        mediaType = "PHOTO";
      } else if (req.file.mimetype.startsWith("video/")) {
        mediaType = "VIDEO";
      }
    }

    let postVisibility = "PUBLIC";
    if (visibility) {
      const v = visibility.toUpperCase();
      if (["PUBLIC", "PRIVATE", "FRIENDS"].includes(v)) {
        postVisibility = v;
      }
    }

    const newPost = await prisma.clubPost.create({
      data: {
        content,
        mediaUrl,
        mediaType,
        visibility: postVisibility,
        authorId,
        clubId,
      },
    });

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      data: newPost,
    });
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Failed to create post." });
  }
};

// Join a social club
export const joinSocialClub = async (req, res) => {
  try {
    const { clubId } = req.body;
    const userId = req.user?.userId;

    if (!clubId) {
      return res.status(400).json({ message: "Club ID is required" });
    }

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    const existingMember = await prisma.clubMember.findUnique({
      where: {
        userId_clubId: {
          userId,
          clubId,
        },
      },
    });

    if (existingMember) {
      return res
        .status(400)
        .json({ message: "You are already a member of this club" });
    }

    await prisma.$transaction([
      prisma.clubMember.create({
        data: {
          userId,
          clubId,
          role: "MEMBER",
        },
      }),
      prisma.club.update({
        where: { id: clubId },
        data: {
          membersCount: {
            increment: 1,
          },
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      message: "Joined club successfully",
    });
  } catch (error) {
    console.error("Error joining club:", error);
    res.status(500).json({ error: "Failed to join club." });
  }
};

// Leave a social club
export const leaveSocialClub = async (req, res) => {
  try {
    const { clubId } = req.body;
    const userId = req.user?.userId;

    if (!clubId) {
      return res.status(400).json({ message: "Club ID is required" });
    }

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    if (club.ownerId === userId) {
      return res
        .status(400)
        .json({ message: "Owner cannot leave the club. Delete it instead." });
    }

    const existingMember = await prisma.clubMember.findUnique({
      where: {
        userId_clubId: {
          userId,
          clubId,
        },
      },
    });

    if (!existingMember) {
      return res
        .status(400)
        .json({ message: "You are not a member of this club" });
    }

    await prisma.$transaction([
      prisma.clubMember.delete({
        where: {
          userId_clubId: {
            userId,
            clubId,
          },
        },
      }),
      prisma.club.update({
        where: { id: clubId },
        data: {
          membersCount: {
            decrement: 1,
          },
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      message: "Left club successfully",
    });
  } catch (error) {
    console.error("Error leaving club:", error);
    res.status(500).json({ error: "Failed to leave club." });
  }
};

// Get trending social clubs (based on member count)
export const trendingSocialClubs = async (req, res) => {
  try {
    const clubs = await prisma.club.findMany({
      orderBy: {
        membersCount: "desc",
      },
      take: 10, // Top 10 trending clubs
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Trending clubs retrieved successfully",
      data: clubs,
    });
  } catch (error) {
    console.error("Error fetching trending clubs:", error);
    res.status(500).json({ error: "Failed to fetch trending clubs." });
  }
};

// Get my clubs (joined and owned)
export const myClubs = async (req, res) => {
  try {
    const userId = req.user?.userId;

    console.log("user id", userId);

    const clubs = await prisma.club.findMany({
      where: {
        members: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        members: {
          where: {
            userId: userId,
          },
          select: {
            role: true,
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });

    res.status(200).json({
      success: true,
      message: "My clubs retrieved successfully",
      data: clubs,
    });
  } catch (error) {
    console.error("Error fetching my clubs:", error);
    res.status(500).json({ error: "Failed to fetch my clubs." });
  }
};

// Get feeds for a specific club
export const getFeedsForEachClub = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    // Check visibility logic if needed (e.g., private clubs)
    // For now, assuming public or member check is handled by middleware or simple logic
    // If private, check membership
    if (club.visibility === "PRIVATE") {
      const userId = req.user?.userId;
      const isMember = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId, clubId } },
      });
      if (!isMember) {
        return res
          .status(403)
          .json({ message: "Access denied. Private club." });
      }
    }

    const posts = await prisma.clubPost.findMany({
      where: { clubId },
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Club feeds retrieved successfully",
      data: posts,
    });
  } catch (error) {
    console.error("Error fetching club feeds:", error);
    res.status(500).json({ error: "Failed to fetch club feeds." });
  }
};

// Get feeds from all joined clubs
export const getFeedsFromJoinedClubs = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const posts = await prisma.clubPost.findMany({
      where: {
        club: {
          members: {
            some: {
              userId: userId,
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        club: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Joined clubs feeds retrieved successfully",
      data: posts,
    });
  } catch (error) {
    console.error("Error fetching joined clubs feeds:", error);
    res.status(500).json({ error: "Failed to fetch joined clubs feeds." });
  }
};

// Get public feeds (from public clubs)
export const getPublicFeeds = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const posts = await prisma.clubPost.findMany({
      where: {
        club: {
          visibility: "PUBLIC",
        },
        visibility: "PUBLIC",
      },
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        club: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Public feeds retrieved successfully",
      data: posts,
    });
  } catch (error) {
    console.error("Error fetching public feeds:", error);
    res.status(500).json({ error: "Failed to fetch public feeds." });
  }
};

// Like a post
export const createPostLike = async (req, res) => {
  try {
    const { postId } = req.body;
    const userId = req.user?.userId;

    if (!postId) {
      return res.status(400).json({ message: "Post ID is required" });
    }

    const post = await prisma.clubPost.findUnique({ where: { id: postId } });
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const existingLike = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (existingLike) {
      return res
        .status(400)
        .json({ message: "You have already liked this post" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, avatar: true, email: true }, // email as fallback for username? Schema has username.
    });

    await prisma.postLike.create({
      data: {
        postId,
        userId,
        name: user.name,
        avatar: user.avatar,
        username: user.name, // Using name as username for now
      },
    });

    res.status(200).json({
      success: true,
      message: "Post liked successfully",
    });
  } catch (error) {
    console.error("Error liking post:", error);
    res.status(500).json({ error: "Failed to like post." });
  }
};

// Unlike a post
export const removePostLike = async (req, res) => {
  try {
    const { postId } = req.body;
    const userId = req.user?.userId;

    if (!postId) {
      return res.status(400).json({ message: "Post ID is required" });
    }

    const existingLike = await prisma.postLike.findUnique({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    if (!existingLike) {
      return res.status(400).json({ message: "You have not liked this post" });
    }

    await prisma.postLike.delete({
      where: {
        userId_postId: {
          userId,
          postId,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Post unliked successfully",
    });
  } catch (error) {
    console.error("Error unliking post:", error);
    res.status(500).json({ error: "Failed to unlike post." });
  }
};

// Add a comment to a post
export const addPostComment = async (req, res) => {
  try {
    const { postId, content } = req.body;
    const userId = req.user?.userId;

    if (!postId || !content) {
      return res
        .status(400)
        .json({ message: "Post ID and content are required" });
    }

    const post = await prisma.clubPost.findUnique({ where: { id: postId } });
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, avatar: true },
    });

    const newComment = await prisma.postComment.create({
      data: {
        postId,
        userId,
        content,
        name: user.name,
        avatar: user.avatar,
        username: user.name,
      },
    });

    res.status(201).json({
      success: true,
      message: "Comment added successfully",
      data: newComment,
    });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Failed to add comment." });
  }
};

// Delete a comment
export const deletePostComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user?.userId;

    const comment = await prisma.postComment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (comment.userId !== userId) {
      // Check if user is club admin/owner?
      // For now, only allow comment author to delete.
      return res
        .status(403)
        .json({ message: "You are not authorized to delete this comment" });
    }

    await prisma.postComment.delete({ where: { id: commentId } });

    res.status(200).json({
      success: true,
      message: "Comment deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting comment:", error);
    res.status(500).json({ error: "Failed to delete comment." });
  }
};

// Get comments for a post
export const getPostComments = async (req, res) => {
  try {
    const { postId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const comments = await prisma.postComment.findMany({
      where: {
        postId,
        parentId: null, // Fetch top-level comments
      },
      orderBy: { createdAt: "desc" },
      skip: parseInt(skip),
      take: parseInt(limit),
      include: {
        replies: {
          include: {
            user: {
              select: { id: true, name: true, avatar: true },
            },
            _count: {
              select: { likes: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: { likes: true, replies: true },
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Comments retrieved successfully",
      data: comments,
    });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: "Failed to fetch comments." });
  }
};

// Reply to a comment
export const replyToPostComment = async (req, res) => {
  try {
    const { postId, commentId, content } = req.body; // commentId is the parent comment ID
    const userId = req.user?.userId;

    if (!postId || !commentId || !content) {
      return res
        .status(400)
        .json({ message: "Post ID, Comment ID, and content are required" });
    }

    const parentComment = await prisma.postComment.findUnique({
      where: { id: commentId },
    });
    if (!parentComment) {
      return res.status(404).json({ message: "Parent comment not found" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, avatar: true },
    });

    const reply = await prisma.postComment.create({
      data: {
        postId,
        userId,
        content,
        parentId: commentId,
        name: user.name,
        avatar: user.avatar,
        username: user.name,
      },
    });

    res.status(201).json({
      success: true,
      message: "Reply added successfully",
      data: reply,
    });
  } catch (error) {
    console.error("Error replying to comment:", error);
    res.status(500).json({ error: "Failed to reply to comment." });
  }
};

// Like a comment
export const likePostComment = async (req, res) => {
  try {
    const { commentId } = req.body;
    const userId = req.user?.userId;

    if (!commentId) {
      return res.status(400).json({ message: "Comment ID is required" });
    }

    const comment = await prisma.postComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    const existingLike = await prisma.postCommentLike.findUnique({
      where: {
        userId_commentId: {
          userId,
          commentId,
        },
      },
    });

    if (existingLike) {
      return res
        .status(400)
        .json({ message: "You have already liked this comment" });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, avatar: true },
    });

    await prisma.postCommentLike.create({
      data: {
        commentId,
        userId,
        name: user.name,
        avatar: user.avatar,
        username: user.name,
      },
    });

    res.status(200).json({
      success: true,
      message: "Comment liked successfully",
    });
  } catch (error) {
    console.error("Error liking comment:", error);
    res.status(500).json({ error: "Failed to like comment." });
  }
};

// Unlike a comment
export const unlikePostComment = async (req, res) => {
  try {
    const { commentId } = req.body;
    const userId = req.user?.userId;

    if (!commentId) {
      return res.status(400).json({ message: "Comment ID is required" });
    }

    const existingLike = await prisma.postCommentLike.findUnique({
      where: {
        userId_commentId: {
          userId,
          commentId,
        },
      },
    });

    if (!existingLike) {
      return res
        .status(400)
        .json({ message: "You have not liked this comment" });
    }

    await prisma.postCommentLike.delete({
      where: {
        userId_commentId: {
          userId,
          commentId,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Comment unliked successfully",
    });
  } catch (error) {
    console.error("Error unliking comment:", error);
    res.status(500).json({ error: "Failed to unlike comment." });
  }
};

// Change club privacy
export const changeClubPrivacy = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { visibility } = req.body;
    const userId = req.user?.userId;

    const club = await prisma.club.findUnique({ where: { id: clubId } });

    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    if (club.ownerId !== userId) {
      return res
        .status(403)
        .json({
          message: "You are not authorized to change privacy settings",
        });
    }

    let newVisibility;

    if (visibility) {
      const v = visibility.toUpperCase();
      if (["PUBLIC", "PRIVATE", "FRIENDS"].includes(v)) {
        newVisibility = v;
      } else {
        return res.status(400).json({ message: "Invalid visibility status" });
      }
    } else {
      // Toggle behavior if no visibility provided
      newVisibility = club.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC";
    }

    const updatedClub = await prisma.club.update({
      where: { id: clubId },
      data: { visibility: newVisibility },
    });

    res.status(200).json({
      success: true,
      message: "Club privacy updated successfully",
      data: { visibility: updatedClub.visibility },
    });
  } catch (error) {
    console.error("Error updating club privacy:", error);
    res.status(500).json({ error: "Failed to update club privacy." });
  }
};

// Manage club member role (Promote/Demote)
export const manageClubMemberRole = async (req, res) => {
  try {
    const { clubId, memberId, role } = req.body;
    const userId = req.user?.userId;

    if (!clubId || !memberId || !role) {
      return res
        .status(400)
        .json({ message: "Club ID, Member ID, and Role are required" });
    }

    const validRoles = ["ADMIN", "MODERATOR", "MEMBER"];
    if (!validRoles.includes(role)) {
      return res
        .status(400)
        .json({ message: "Invalid role. Must be ADMIN, MODERATOR, or MEMBER" });
    }

    const club = await prisma.club.findUnique({ where: { id: clubId } });
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    // Only owner can manage roles
    if (club.ownerId !== userId) {
      return res
        .status(403)
        .json({ message: "You are not authorized to manage members" });
    }

    // Prevent changing owner's role
    if (memberId === club.ownerId) {
      return res
        .status(400)
        .json({ message: "Cannot change the role of the club owner" });
    }

    const member = await prisma.clubMember.findUnique({
      where: { userId_clubId: { userId: memberId, clubId } },
    });

    if (!member) {
      return res.status(404).json({ message: "Member not found in club" });
    }

    const updatedMember = await prisma.clubMember.update({
      where: { userId_clubId: { userId: memberId, clubId } },
      data: { role: role },
    });

    res.status(200).json({
      success: true,
      message: `Member role updated to ${role} successfully`,
      data: updatedMember,
    });
  } catch (error) {
    console.error("Error managing member role:", error);
    res.status(500).json({ error: "Failed to manage member role." });
  }
};


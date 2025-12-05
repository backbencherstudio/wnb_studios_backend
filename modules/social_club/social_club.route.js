import express from "express";
import {
  createSocialClub,
  getAllClubs,
  getClubById,
  updateSocialClub,
  deleteSocialClub,
  createClubPost,
  joinSocialClub,
  leaveSocialClub,
  trendingSocialClubs,
  myClubs,
  getFeedsForEachClub,
  getFeedsFromJoinedClubs,
  getPublicFeeds,
  createPostLike,
  removePostLike,
  addPostComment,
  deletePostComment,
  getPostComments,
  replyToPostComment,
  likePostComment,
  unlikePostComment,
  changeClubPrivacy,
  manageClubMemberRole,
} from "./social_club.controller.js";
import { upload } from "../../config/Multer.config.js";
import { verifyUser } from "../../middlewares/verifyUsers.js";
import chatRoutes from "./chat/chat.route.js";
import { listUserRoomsHandler } from "./chat/chat.controller.js";

const router = express.Router();

// Create a new social club
// Access: Private (Authenticated Users)
router.post(
  "/create",
  verifyUser("ANY"), // Allow any authenticated user to create a club
  upload.fields([
    { name: "coverPhoto", maxCount: 1 },
    { name: "avatar", maxCount: 1 },
  ]),
  createSocialClub
);

// Get trending social clubs
// Access: Public (or Private)
router.get("/trending", trendingSocialClubs);

// Get my clubs (joined and owned)
// Access: Private (Authenticated Users)
router.get("/my-clubs", verifyUser("ANY"), myClubs);

// Get feeds from joined clubs
// Access: Private (Authenticated Users)
router.get("/feeds/joined", verifyUser("ANY"), getFeedsFromJoinedClubs);

// Get public feeds
// Access: Public
router.get("/feeds/public", getPublicFeeds);

// Get all social clubs
// Access: Public (or Private if needed)
router.get("/all", getAllClubs);

// Get a single social club by ID
// Access: Public (or Private if needed)
router.get("/:id", getClubById);

// Update a social club
// Access: Private (Owner only)
router.put(
  "/:id",
  verifyUser("ANY"),
  upload.fields([
    { name: "coverPhoto", maxCount: 1 },
    { name: "avatar", maxCount: 1 },
  ]),
  updateSocialClub
);

// Delete a social club
// Access: Private (Owner only)
router.delete("/:id", verifyUser("ANY"), deleteSocialClub);

// Create a post in a club
// Access: Private (Authenticated Users)
router.post(
  "/post/create",
  verifyUser("ANY"),
  upload.single("media"),
  createClubPost
);

// Join a social club
// Access: Private (Authenticated Users)
router.post("/join", verifyUser("ANY"), joinSocialClub);

// Leave a social club
// Access: Private (Authenticated Users)
router.post("/leave", verifyUser("ANY"), leaveSocialClub);

// Get feeds for a specific club
// Access: Public (or Private based on club visibility)
router.get("/:clubId/feeds", verifyUser("ANY"), getFeedsForEachClub);

// Like a post
// Access: Private
router.post("/post/like", verifyUser("ANY"), createPostLike);

// Unlike a post
// Access: Private
router.post("/post/unlike", verifyUser("ANY"), removePostLike);

// Add a comment to a post
// Access: Private
router.post("/post/comment", verifyUser("ANY"), addPostComment);

// Delete a comment
// Access: Private
router.delete("/post/comment/:commentId", verifyUser("ANY"), deletePostComment);

// Get comments for a post
// Access: Public (or Private)
router.get("/post/:postId/comments", verifyUser("ANY"), getPostComments);

// Reply to a comment
// Access: Private
router.post("/post/comment/reply", verifyUser("ANY"), replyToPostComment);

// Like a comment
// Access: Private
router.post("/post/comment/like", verifyUser("ANY"), likePostComment);

// Unlike a comment
// Access: Private
router.post("/post/comment/unlike", verifyUser("ANY"), unlikePostComment);

// Change club privacy
// Access: Private (Owner only)
router.put("/:clubId/privacy", verifyUser("ANY"), changeClubPrivacy);

// Manage club member role (Promote/Demote)
// Access: Private (Owner only)
router.post("/member/role", verifyUser("ANY"), manageClubMemberRole);

// Mount chat routes for each club
router.use("/:clubId/chat", chatRoutes);

// Get list of rooms the authenticated user has joined
router.get("/chat/rooms", verifyUser("ANY"), listUserRoomsHandler);

export default router;

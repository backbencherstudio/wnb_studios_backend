import express from "express";
import { verifyUser } from "../../../middlewares/verifyUsers.js";
import {
	getMessages,
	postMessage,
	markRead,
	getRoomInfo,
	joinRoomHandler,
	leaveRoomHandler,
	listUserRoomsHandler,
} from "./chat.controller.js";
import { upload } from "../../../config/Multer.config.js";

const router = express.Router({ mergeParams: true });

// GET /api/social-club/:clubId/chat/messages
router.get("/messages", verifyUser("ANY"), getMessages);

// POST /api/social-club/:clubId/chat/messages
router.post("/messages", verifyUser("ANY"), upload.single("file"), postMessage);

// POST /api/social-club/:clubId/chat/mark-read
router.post("/mark-read", verifyUser("ANY"), markRead);

// GET /api/social-club/:clubId/chat/room
router.get("/room", verifyUser("ANY"), getRoomInfo);

// Join club chat room (creates room if necessary)
router.post("/join", verifyUser("ANY"), joinRoomHandler);

// Leave club chat room
router.post("/leave", verifyUser("ANY"), leaveRoomHandler);

// Upload a single attachment and return its S3 URL
router.post("/attachments", verifyUser("ANY"), upload.single("file"), async (req, res) => {
	try {
		if (!req.file) return res.status(400).json({ success: false, message: "file is required" });
		// upload handled in postMessage flow, but expose quick upload
		const { uploadFileToS3 } = await import("../../libs/s3Uploader.js");
		const url = await uploadFileToS3(req.file, `club_${req.params.clubId}/chat`);
		return res.json({ success: true, data: { url } });
	} catch (error) {
		console.error("attachment upload error:", error);
		return res.status(500).json({ success: false, message: error.message });
	}
});

export default router;

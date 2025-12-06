import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { verifyUser } from "../../../middlewares/verifyUsers.js";
import { commentOrReplyOnReel, getAllReels, getReelComments, likeAComment, likeAReel, uploadAReel } from "./video.controller.js";

const router = express.Router();
const app = express();

const uploadDir = path.resolve(process.cwd(), "tmp_uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({storage,limits: { fileSize: 30 * 1024 * 1024 * 1024 },});

router.post("/video",upload.fields([{ name: "file", maxCount: 1 },]),verifyUser("normal", "admin"),uploadAReel);
router.post("/likeAreels/:reelId", verifyUser("normal", "admin"), likeAReel);
router.post("/likeAcomment/:commentId", verifyUser("normal", "admin"), likeAComment);
router.post("/comment/:reelId", verifyUser("normal", "admin"), commentOrReplyOnReel)
router.get("/getAllCommnets/:reelId", verifyUser("normal", "admin"), getReelComments)
router.get("/getAllreels", getAllReels)
app.use("/uploads", express.static(path.resolve(process.cwd(), "tmp_uploads")));

export default router;

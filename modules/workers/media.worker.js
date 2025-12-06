import "dotenv/config";
import { Worker } from "bullmq";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import util from "util";
import { Upload } from "@aws-sdk/lib-storage";
import { s3 } from "../libs/s3Clinent.js";
import { PrismaClient } from "@prisma/client";
import { connection } from "../libs/queue.js";

const prisma = new PrismaClient();
const unlink = util.promisify(fs.unlink);
const stat = util.promisify(fs.stat);

const bucket = process.env.AWS_S3_BUCKET;
const partSize = (Number(process.env.UPLOAD_PART_SIZE_MB) || 10) * 1024 * 1024;
const queueSize = Number(process.env.UPLOAD_QUEUE_SIZE) || 4;

/* -----------------------------------------------------------
   Detect whether ID belongs to CONTENT or REELS
------------------------------------------------------------*/
async function getModelForId(id) {
  const content = await prisma.content.findUnique({ where: { id } });
  if (content) return "content";

  const reel = await prisma.reels.findUnique({ where: { id } });
  if (reel) return "reels";

  throw new Error(`Record with ID ${id} not found in content or reels`);
}

/* -----------------------------------------------------------
   Smart updater — only writes valid fields
------------------------------------------------------------*/
async function updateRecord(id, data) {
  const model = await getModelForId(id);

  if (model === "content") {
    return prisma.content.update({
      where: { id },
      data,
    });
  }

  const allowed = {};

  if (data.s3_bucket) allowed.s3_bucket = data.s3_bucket;
  if (data.s3_key) allowed.s3_key = data.s3_key;
  if (data.s3_thumb_key) allowed.s3_thumb_key = data.s3_thumb_key;
  if (data.etag) allowed.etag = data.etag;
  if (data.checksum_sha256) allowed.checksum_sha256 = data.checksum_sha256;
  if (data.file_size_bytes) allowed.file_size_bytes = data.file_size_bytes;

  return prisma.reels.update({
    where: { id },
    data: allowed,
  });
}

/* -----------------------------------------------------------
   On failure → 
   content → update failure_reason
   reels   → don't touch DB (only return error)
------------------------------------------------------------*/
async function markFailed(id, reason) {
  const model = await getModelForId(id);

  if (model === "content") {
    return prisma.content.update({
      where: { id },
      data: {
        content_status: "failed",
        failure_reason: String(reason),
      },
    });
  }

  // Reels: do nothing, only let worker throw error
  return null;
}

/* ----------------------------------------------------------- */

async function generateChecksum(localPath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash("sha256");
    const s = fs.createReadStream(localPath);
    s.on("data", (d) => h.update(d));
    s.on("end", () => resolve(h.digest("hex")));
    s.on("error", reject);
  });
}

async function uploadToS3(localPath, contentId, ext, mime, prefix = "videos") {
  const key = `${prefix}/${contentId}${ext}`;

  const uploader = new Upload({
    client: s3,
    params: {
      Bucket: bucket,
      Key: key,
      Body: fs.createReadStream(localPath),
      ContentType: mime,
      Metadata: { contentId: String(contentId) },
    },
    queueSize,
    partSize,
    leavePartsOnError: false,
  });

  return uploader.done();
}

/* -----------------------------------------------------------
   WORKER FOR MEDIA JOBS
------------------------------------------------------------*/
const worker = new Worker(
  "media",
  async (job) => {
    if (job.name !== "push-to-s3") return;

    const { contentId, localPath, thumbnailPath } = job.data;

    try {
      await fs.promises.access(localPath);
      const model = await getModelForId(contentId);

      // Only content uses statuses
      if (model === "content") {
        await updateRecord(contentId, { content_status: "uploading_s3" });
      }

      const fileInfo = await stat(localPath);
      const ext = path.extname(localPath);
      const mime = getMimeType(ext);
      const checksum = await generateChecksum(localPath);

      // Upload main video
      const result = await uploadToS3(localPath, contentId, ext, mime);

      // Upload thumbnail if provided
      let thumbResult = null;
      if (thumbnailPath) {
        const thumbExt = path.extname(thumbnailPath);
        const thumbMime = getMimeType(thumbExt);
        thumbResult = await uploadToS3(
          thumbnailPath,
          contentId,
          thumbExt,
          thumbMime,
          "thumbnails"
        );
      }

      // Store updated S3 fields (works for both content + reels)
      await updateRecord(contentId, {
        s3_bucket: bucket,
        s3_key: result?.Key,
        s3_thumb_key: thumbResult?.Key ?? null,
        etag: result?.ETag ?? null,
        checksum_sha256: checksum,
        file_size_bytes: BigInt(fileInfo.size),
        ...(model === "content" ? { content_status: "published" } : {}),
      });

      await unlink(localPath).catch(() => {});
      if (thumbnailPath) await unlink(thumbnailPath).catch(() => {});

      return { success: true };
    } catch (err) {
      console.error("[job] failed:", err);
      await markFailed(contentId, err.message || String(err));

      throw new Error(`Upload failed: ${err.message}`);
    }
  },
  { connection, concurrency: 2 }
);

worker.on("failed", (job, err) =>
  console.error("[worker] failed event", job?.id, err?.message)
);

worker.on("completed", (job) =>
  console.log("[worker] completed event", job?.id)
);

/* ----------------------------------------------------------- */
function getMimeType(ext) {
  switch (ext.toLowerCase()) {
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".mkv":
      return "video/x-matroska";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

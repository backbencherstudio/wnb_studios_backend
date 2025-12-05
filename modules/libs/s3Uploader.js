import { Upload } from "@aws-sdk/lib-storage";
import fs from "fs";
import { s3 } from "./s3Clinent.js";

export async function uploadFileToS3(file, folder = "attachments") {
  if (!file || !file.path) throw new Error("No file provided");

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

    try {
      // Default to 15 seconds (15000ms) to fail faster than most client timeouts (30s)
      const timeoutMs = parseInt(process.env.S3_UPLOAD_TIMEOUT_MS || "15000", 10);

      let timeoutId;
      const uploadPromise = upload.done();

      const timed = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          try {
            // attempt to abort multipart upload
            if (typeof upload.abort === "function") upload.abort();
          } catch (e) {
            // ignore
          }
          reject(new Error(`S3 upload aborted after ${timeoutMs}ms timeout`));
        }, timeoutMs);
      });

      await Promise.race([uploadPromise, timed]);
      clearTimeout(timeoutId);
    } catch (err) {
      // Improve error for common misconfiguration: MinIO creds used against AWS
      if (err && err.Code === "InvalidAccessKeyId" && !process.env.AWS_S3_ENDPOINT) {
        throw new Error(
          "S3 upload failed: InvalidAccessKeyId. It looks like you're using MinIO credentials but AWS S3 endpoint is not set.\n" +
            "If you're using MinIO, set `AWS_S3_ENDPOINT` to your MinIO URL (e.g. http://localhost:9000) and `AWS_S3_FORCE_PATH_STYLE=true` in your .env, then restart the server."
        );
      }
      throw err;
    }

    // Remove local file after upload
    try {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (e) {
      // ignore
    }

    if (process.env.AWS_S3_ENDPOINT) {
      return `${process.env.AWS_S3_ENDPOINT}/${process.env.AWS_S3_BUCKET}/${key}`;
    } else {
      return `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    }
  } catch (error) {
    // Attempt to cleanup local file
    try {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    } catch (e) {}
    throw error;
  }
}

export default { uploadFileToS3 };

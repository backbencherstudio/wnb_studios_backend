import { PrismaClient } from "@prisma/client";
import { getIO } from "../../../lib/socket.js";
import { uploadFileToS3 } from "../../libs/s3Uploader.js";

// Reuse Prisma client to avoid too many connections in dev environment
const prisma = global.prisma || new PrismaClient();
if (process.env.NODE_ENV !== "production") global.prisma = prisma;

// Production-ready limits & validation
const MAX_MESSAGE_LENGTH = 4000;
const MAX_ATTACHMENTS = 10;
const ALLOWED_ATTACHMENT_TYPES = ["PHOTO", "VIDEO"];

// Helper: verify membership or ownership
async function verifyMembershipOrOwner(userId, clubId) {
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) return { ok: false, status: 404, message: "Club not found" };

  const member = await prisma.clubMember.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });
  const isOwner = club.ownerId === userId;
  if (!member && !isOwner)
    return { ok: false, status: 403, message: "Not a club member" };

  return { ok: true, club, member, isOwner };
}

// Helper to ensure room exists for club
async function ensureRoomForClub(clubId) {
  const club = await prisma.club.findUnique({ where: { id: clubId } });
  if (!club) {
    throw new Error("Club not found");
  }

  let room = await prisma.clubChatRoom.findUnique({ where: { clubId } });
  if (!room) {
    room = await prisma.clubChatRoom.create({ data: { clubId } });
  }
  return room;
}

export const joinClubRoom = async (clubId, userId) => {
  const v = await verifyMembershipOrOwner(userId, clubId);
  if (!v.ok) throw new Error(v.message);
  const room = await ensureRoomForClub(clubId);
  return room;
};

export const leaveClubRoom = async (clubId, userId) => {
  const v = await verifyMembershipOrOwner(userId, clubId);
  if (!v.ok) throw new Error(v.message);
  const room = await prisma.clubChatRoom.findUnique({ where: { clubId } });
  if (!room) throw new Error("Room not found");
  return room;
};

export const listOfJoinedChatRooms = async (userId) => {
  const memberships = await prisma.clubMember.findMany({
    where: { userId },
    select: { clubId: true },
  });
  const clubIds = memberships.map((m) => m.clubId);
  if (!clubIds.length) return [];

  const rooms = await prisma.clubChatRoom.findMany({
    where: { clubId: { in: clubIds } },
    include: {
      club: {
        select: { id: true, name: true, avatar: true, membersCount: true },
      },
    },
  });
  return rooms;
};

export const getMessages = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { limit = 50, before } = req.query;
    const user = req.user;
    // membership check
    const v = await verifyMembershipOrOwner(user.userId, clubId);
    if (!v.ok)
      return res
        .status(v.status || 403)
        .json({ success: false, message: v.message });

    const room = await prisma.clubChatRoom.findUnique({ where: { clubId } });
    if (!room) return res.json({ messages: [], hasMore: false });

    const take = Math.min(parseInt(limit, 10) || 50, 200);

    const where = { roomId: room.id };
    if (before) {
      const date = new Date(before);
      if (!isNaN(date.getTime())) {
        where.createdAt = { lt: date };
      } else {
        const m = await prisma.chatMessage.findUnique({
          where: { id: before },
        });
        if (m) where.createdAt = { lt: m.createdAt };
      }
    }

    const messages = await prisma.chatMessage.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take,
      include: {
        attachments: true,
        sender: { select: { id: true, name: true, avatar: true } },
        reads: { where: { userId: user.id }, select: { userId: true } },
      },
    });

    const hasMore = messages.length === take;

    // Compute read counts for all messages in a single query
    const messageIds = messages.map((m) => m.id);
    let readCountsMap = {};
    if (messageIds.length) {
      const reads = await prisma.messageRead.findMany({
        where: { messageId: { in: messageIds } },
        select: { messageId: true },
      });
      readCountsMap = reads.reduce((acc, r) => {
        acc[r.messageId] = (acc[r.messageId] || 0) + 1;
        return acc;
      }, {});
    }

    // Map messages to include useful read metadata
    const mapped = messages
      .map((m) => ({
        id: m.id,
        type: m.type,
        text: m.text,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        sender: m.sender || null,
        attachments: m.attachments || [],
        readByMe: Array.isArray(m.reads) && m.reads.length > 0,
        readCount: readCountsMap[m.id] || 0,
      }))
      .reverse();

    return res.json({ success: true, message: "Messages fetched", data: mapped, hasMore });
  } catch (error) {
    console.error("getMessages error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const postMessage = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { text, type = "TEXT", attachments = [] } = req.body;
    const user = req.user;
    // validate user
    if (!user || !user.userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });

    // membership check
    const v = await verifyMembershipOrOwner(user.userId, clubId);
    if (!v.ok)
      return res
        .status(v.status || 403)
        .json({ success: false, message: v.message });
    // basic validations
    if (typeof text === "string" && text.length > MAX_MESSAGE_LENGTH)
      return res.status(400).json({
        success: false,
        message: `Message too long (max ${MAX_MESSAGE_LENGTH})`,
      });
    if (!Array.isArray(attachments))
      return res
        .status(400)
        .json({ success: false, message: "attachments must be an array" });
    if (attachments.length > MAX_ATTACHMENTS)
      return res.status(400).json({
        success: false,
        message: `Max ${MAX_ATTACHMENTS} attachments allowed`,
      });
    // validate attachment types
    for (const a of attachments) {
      if (!a || !a.url)
        return res
          .status(400)
          .json({ message: "Each attachment must have a url" });
      if (a.type && !ALLOWED_ATTACHMENT_TYPES.includes(a.type))
        return res
          .status(400)
          .json({ message: `Invalid attachment type: ${a.type}` });
    }

    const room = await ensureRoomForClub(clubId);


    let attachmentsToCreate = attachments;
    if (
      (!attachments || attachments.length === 0) &&
      (req.file || (req.files && req.files.file))
    ) {
      // single file uploaded as 'file' via Multer
      const file = req.file || (req.files.file[0] || req.files.file);
      try {
        const url = await uploadFileToS3(file, `club_${clubId}/chat`);
        attachmentsToCreate = [{ url, type: file.mimetype && file.mimetype.startsWith("video") ? "VIDEO" : "PHOTO" }];
      } catch (err) {
        console.error("S3 upload failed:", err);
        return res.status(500).json({ success: false, message: "Attachment upload failed" });
      }
    }

    const message = await prisma.chatMessage.create({
      data: {
        type,
        text: text || null,
        senderId: user.userId,
        roomId: room.id,
        attachments:
          attachmentsToCreate && attachmentsToCreate.length
            ? { create: attachmentsToCreate.map((a) => ({ url: a.url, type: a.type || "PHOTO" })) }
            : undefined,
      },
      include: {
        attachments: true,
        sender: { select: { id: true, name: true, avatar: true } },
      },
    });

    const fullMessage = message;

    // Emit via socket if available
    const io = getIO();
    if (io) {
      io.to(room.id).emit("new_message", fullMessage);
    }

    return res
      .status(201)
      .json({ success: true, message: "Message posted", data: fullMessage });
  } catch (error) {
    console.error("postMessage error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const markRead = async (req, res) => {
  try {
    const { clubId } = req.params;
    const { messageIds } = req.body;
    const user = req.user;

    if (!Array.isArray(messageIds) || messageIds.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "messageIds required" });

    // membership check
    const v = await verifyMembershipOrOwner(user.userId, clubId);
    if (!v.ok)
      return res
        .status(v.status || 403)
        .json({ success: false, message: v.message });
    // Use createMany with skipDuplicates to mark reads efficiently
    const payload = messageIds.map((m) => ({ messageId: m, userId: user.userId }));
    const result = await prisma.messageRead.createMany({
      data: payload,
      skipDuplicates: true,
    });

    // result.count is number of inserted rows
    return res.json({ createdCount: result.count || 0 });
  } catch (error) {
    console.error("markRead error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const getRoomInfo = async (req, res) => {
  try {
    const { clubId } = req.params;
    const room = await prisma.clubChatRoom.findUnique({ where: { clubId } });
    if (!room)
      return res
        .status(404)
        .json({ success: false, message: "Room not found" });
    return res.json({ room });
  } catch (error) {
    console.error("getRoomInfo error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// HTTP handlers for join/leave rooms and listing user's rooms
export const joinRoomHandler = async (req, res) => {
  try {
    const { clubId } = req.params;

    const user = req.user;
    console.log("user Id", user.userId);
    if (!user)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const room = await joinClubRoom(clubId, user.userId);
    return res.json({ success: true, message: "Joined room", data: room });
  } catch (error) {
    console.error("joinRoomHandler error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const leaveRoomHandler = async (req, res) => {
  try {
    const { clubId } = req.params;
    const user = req.user;
    if (!user || !user.userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const room = await leaveClubRoom(clubId, user.userId);
    return res.json({ success: true, message: "Left room", data: room });
  } catch (error) {
    console.error("leaveRoomHandler error:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
};

export const listUserRoomsHandler = async (req, res) => {
  try {
    const user = req.user;
    if (!user || !user.userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    const rooms = await listOfJoinedChatRooms(user.userId);
    return res.json({ success: true, data: rooms });
  } catch (error) {
    console.error("listUserRoomsHandler error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

export default { getMessages, postMessage, markRead, getRoomInfo };

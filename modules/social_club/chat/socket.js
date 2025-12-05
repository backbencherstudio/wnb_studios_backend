import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Initialize chat handlers. Pass socket.io server instance.
export function initClubChat(io) {
  io.on("connection", (socket) => {
    // Expect auth token in handshake auth: { token }
    const { token } = socket.handshake.auth || {};

    if (!token) {
      socket.emit("error", { message: "Authentication required" });
      socket.disconnect(true);
      return;
    }

    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = user;
    } catch (err) {
      socket.emit("error", { message: "Invalid token" });
      socket.disconnect(true);
      return;
    }

    // Join a club room after validating membership
    socket.on("join_club", async ({ clubId }, cb) => {
      try {
        if (!clubId) throw new Error("clubId required");

        // Check membership or ownership
        const member = await prisma.clubMember.findUnique({
          where: { userId_clubId: { userId: user.id, clubId } },
        });

        const club = await prisma.club.findUnique({ where: { id: clubId } });

        const isOwner = club && club.ownerId === user.id;

        if (!member && !isOwner) {
          return cb && cb({ ok: false, message: "Not a club member" });
        }

        // Ensure chat room exists for club
        let room = await prisma.clubChatRoom.findUnique({ where: { clubId } });
        if (!room) {
          room = await prisma.clubChatRoom.create({ data: { clubId } });
        }

        socket.join(room.id);

        // Fetch recent messages (limit 50)
        const messages = await prisma.chatMessage.findMany({
          where: { roomId: room.id },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { attachments: true },
        });

        // send joined confirmation + recent messages (reverse to oldest first)
        cb && cb({ ok: true, roomId: room.id, recent: messages.reverse() });
      } catch (error) {
        console.error("join_club error:", error);
        cb && cb({ ok: false, message: error.message });
      }
    });

    socket.on("leave_club", async ({ clubId }, cb) => {
      try {
        if (!clubId) throw new Error("clubId required");
        const room = await prisma.clubChatRoom.findUnique({ where: { clubId } });
        if (!room) return cb && cb({ ok: false, message: "Room not found" });
        socket.leave(room.id);
        cb && cb({ ok: true });
      } catch (error) {
        cb && cb({ ok: false, message: error.message });
      }
    });

    // Send message to club room
    socket.on("send_message", async (payload, cb) => {
      try {
        const { roomId, text, type = "TEXT", attachments = [] } = payload || {};
        if (!roomId) throw new Error("roomId required");

        // Verify user is still a member of the club attached to roomId
        const room = await prisma.clubChatRoom.findUnique({ where: { id: roomId } });
        if (!room) throw new Error("Room not found");

        const member = await prisma.clubMember.findUnique({
          where: { userId_clubId: { userId: user.id, clubId: room.clubId } },
        });
        const club = await prisma.club.findUnique({ where: { id: room.clubId } });
        const isOwner = club && club.ownerId === user.id;

        if (!member && !isOwner) throw new Error("Not a club member");

        // persist message
        const message = await prisma.chatMessage.create({
          data: {
            type: type,
            text: text || null,
            senderId: user.id,
            roomId: room.id,
          },
          include: { attachments: true },
        });

        // if attachments passed (simple array of { url, type }) create attachments
        if (Array.isArray(attachments) && attachments.length) {
          for (const a of attachments) {
            await prisma.messageAttachment.create({
              data: { url: a.url, type: a.type || "PHOTO", messageId: message.id },
            });
          }
        }

        const fullMessage = await prisma.chatMessage.findUnique({
          where: { id: message.id },
          include: { attachments: true },
        });

        io.to(room.id).emit("new_message", fullMessage);
        cb && cb({ ok: true, message: fullMessage });
      } catch (error) {
        console.error("send_message error:", error);
        cb && cb({ ok: false, message: error.message });
      }
    });

    // Typing indicator
    socket.on("typing", ({ roomId, isTyping }) => {
      if (!roomId) return;
      socket.to(roomId).emit("typing", { user: { id: socket.user.id, name: socket.user.name }, isTyping });
    });

    // Mark messages as read
    socket.on("mark_read", async ({ messageIds }, cb) => {
      try {
        if (!Array.isArray(messageIds) || messageIds.length === 0) {
          return cb && cb({ ok: false, message: "messageIds required" });
        }

        const created = [];
        for (const messageId of messageIds) {
          try {
            const r = await prisma.messageRead.upsert({
              where: { messageId_userId: { messageId, userId: socket.user.id } },
              update: {},
              create: { messageId, userId: socket.user.id },
            });
            created.push(r);
          } catch (e) {
            // ignore duplicates
          }
        }

        cb && cb({ ok: true, createdCount: created.length });
      } catch (error) {
        console.error("mark_read error:", error);
        cb && cb({ ok: false, message: error.message });
      }
    });

    socket.on("disconnect", (reason) => {
      // cleanup if necessary
    });
  });
}

export default initClubChat;

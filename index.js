import { PrismaClient } from "@prisma/client";
import http from "http";
import { Server as IOServer } from "socket.io";
import app from "./app.js";
import { spawn } from 'node:child_process';
import { initClubChat } from "./modules/social_club/chat/socket.js";
import { setIO } from "./lib/socket.js";

const PORT = process.env.PORT || 4005;

const prisma = new PrismaClient();
const worker = spawn(process.execPath, ['./modules/workers/media.worker.js'], {
  stdio: 'inherit',
  env: process.env,
});

const server = http.createServer(app);

const io = new IOServer(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Initialize club chat socket handlers
setIO(io);
initClubChat(io);

server.listen(PORT, async () => {
  try {
    console.log(`Server running on http://localhost:${PORT}`);
    await prisma.$connect();
    console.log("Database connected to prisma");
  } catch (err) {
    console.error("Database connection error:", err);
  }
});

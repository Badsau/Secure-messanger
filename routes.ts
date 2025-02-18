import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { setupWebSocket } from "./websocket";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from 'express';

// Configure multer for file uploads
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const uploadStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
});

const upload = multer({ 
  storage: uploadStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG and GIF are allowed.'));
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  const httpServer = createServer(app);
  const wsManager = setupWebSocket(httpServer);

  // Serve uploaded files
  app.use('/uploads', express.static(uploadsDir));

  app.get("/api/users", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const users = await storage.getAllUsers();
    const filtered = users
      .filter(u => u.id !== req.user?.id)
      .map(({ id, username, isOnline, avatarUrl }) => ({ 
        id, 
        username, 
        isOnline,
        avatarUrl 
      }));
    res.json(filtered);
  });

  app.get("/api/messages/:userId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const messages = await storage.getMessages(
      req.user!.id,
      parseInt(req.params.userId),
    );
    res.json(messages);
  });

  app.post("/api/user/avatar", upload.single('avatar'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      if (!req.file) {
        throw new Error('No file uploaded');
      }

      const avatarUrl = `/uploads/${req.file.filename}`;
      const user = await storage.updateUserAvatar(req.user!.id, avatarUrl);
      res.json(user);
    } catch (error) {
      console.error("[Avatar] Error updating avatar:", error);
      res.status(500).json({ message: error instanceof Error ? error.message : "Failed to update avatar" });
    }
  });

  return httpServer;
}
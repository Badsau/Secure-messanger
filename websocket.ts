import { WebSocketServer, WebSocket } from "ws";
import { Server } from "http";
import { storage } from "./storage";
import { Message } from "@shared/schema";

interface ExtendedWebSocket extends WebSocket {
  userId?: number;
}

interface WebSocketMessage {
  type: "message" | "typing" | "read" | "auth";
  content?: string;
  receiverId?: number;
  messageId?: number;
  userId?: number;
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  const clients = new Map<number, ExtendedWebSocket>();

  console.log("[WebSocket] Server initialized with path: /ws");

  wss.on("connection", async (ws: ExtendedWebSocket) => {
    console.log("[WebSocket] New connection established");

    ws.on("message", async (data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        console.log(`[WebSocket] Received message type: ${message.type}`);

        // Handle initial authentication
        if (!ws.userId) {
          if (message.type === "auth" && message.userId) {
            console.log(`[WebSocket] Authenticating user: ${message.userId}`);
            ws.userId = message.userId;
            const existingSocket = clients.get(message.userId);
            if (existingSocket) {
              console.log(`[WebSocket] Closing existing connection for user: ${message.userId}`);
              existingSocket.close();
              clients.delete(message.userId);
            }
            clients.set(message.userId, ws);
            await storage.setUserOnlineStatus(message.userId, true);
            console.log(`[WebSocket] User authenticated: ${message.userId}`);
            return;
          }
          console.log("[WebSocket] Ignoring message from unauthenticated connection");
          return;
        }

        switch (message.type) {
          case "message":
            if (message.content && message.receiverId) {
              console.log(`[WebSocket] Creating message from ${ws.userId} to ${message.receiverId}`);
              const newMessage = await storage.createMessage({
                content: message.content,
                senderId: ws.userId,
                receiverId: message.receiverId,
                type: "text",
                fileUrl: null,
              });

              // Send to receiver if online
              const receiverSocket = clients.get(message.receiverId);
              if (receiverSocket?.readyState === WebSocket.OPEN) {
                console.log(`[WebSocket] Sending message to receiver: ${message.receiverId}`);
                receiverSocket.send(JSON.stringify({
                  type: "message",
                  message: newMessage,
                }));
              }

              // Send confirmation to sender
              ws.send(JSON.stringify({
                type: "message",
                message: newMessage,
              }));
            }
            break;

          case "typing":
            if (message.receiverId) {
              console.log(`[WebSocket] Sending typing indicator to: ${message.receiverId}`);
              const receiverSocket = clients.get(message.receiverId);
              if (receiverSocket?.readyState === WebSocket.OPEN) {
                receiverSocket.send(JSON.stringify({
                  type: "typing",
                  userId: ws.userId,
                }));
              }
            }
            break;

          case "read":
            if (message.messageId) {
              console.log(`[WebSocket] Marking message as read: ${message.messageId}`);
              await storage.markMessageAsRead(message.messageId);
              const msg = JSON.stringify({
                type: "read",
                messageId: message.messageId,
              });
              ws.send(msg);
            }
            break;
        }
      } catch (error) {
        console.error("[WebSocket] Message error:", error);
      }
    });

    ws.on("close", async () => {
      if (ws.userId) {
        console.log(`[WebSocket] Connection closed for user: ${ws.userId}`);
        await storage.setUserOnlineStatus(ws.userId, false);
        clients.delete(ws.userId);
      }
    });

    ws.on("error", () => {
      if (ws.userId) {
        console.log(`[WebSocket] Error occurred for user: ${ws.userId}`);
        clients.delete(ws.userId);
      }
    });
  });

  return {
    addClient: async (userId: number) => {
      console.log(`[WebSocket] Adding client: ${userId}`);
      const existingSocket = clients.get(userId);
      if (existingSocket) {
        existingSocket.close();
        clients.delete(userId);
      }
      await storage.setUserOnlineStatus(userId, true);
    },
    removeClient: async (userId: number) => {
      console.log(`[WebSocket] Removing client: ${userId}`);
      const socket = clients.get(userId);
      if (socket) {
        socket.close();
        clients.delete(userId);
      }
      await storage.setUserOnlineStatus(userId, false);
    },
  };
}
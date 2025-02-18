import { users, messages, type User, type Message, type LoginData } from "@shared/schema";
import { db } from "./db";
import { eq, or, and } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: Pick<User, "username">): Promise<User>;
  setUserOnlineStatus(id: number, isOnline: boolean): Promise<void>;
  getAllUsers(): Promise<User[]>;

  createMessage(message: { content: string; senderId: number; receiverId: number }): Promise<Message>;
  getMessages(userId1: number, userId2: number): Promise<Message[]>;
  markMessageAsRead(messageId: number): Promise<void>;
  updateUserAvatar(userId: number, avatarUrl: string): Promise<User>;
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: Pick<User, "username">): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async setUserOnlineStatus(id: number, isOnline: boolean): Promise<void> {
    await db.update(users)
      .set({ isOnline })
      .where(eq(users.id, id));
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users);
  }

  async createMessage(message: { content: string; senderId: number; receiverId: number }): Promise<Message> {
    const [newMessage] = await db.insert(messages).values({
      content: message.content,
      senderId: message.senderId,
      receiverId: message.receiverId,
      type: 'text',
      fileUrl: null,
    }).returning();
    return newMessage;
  }

  async getMessages(userId1: number, userId2: number): Promise<Message[]> {
    return db.select()
      .from(messages)
      .where(
        or(
          and(
            eq(messages.senderId, userId1),
            eq(messages.receiverId, userId2)
          ),
          and(
            eq(messages.senderId, userId2),
            eq(messages.receiverId, userId1)
          )
        )
      )
      .orderBy(messages.sent);
  }

  async markMessageAsRead(messageId: number): Promise<void> {
    await db.update(messages)
      .set({ read: true })
      .where(eq(messages.id, messageId));
  }

  async updateUserAvatar(userId: number, avatarUrl: string): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ avatarUrl })
      .where(eq(users.id, userId))
      .returning();
    return user;
  }
}

export const storage = new DatabaseStorage();
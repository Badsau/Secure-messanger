import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const UNIVERSAL_PASSWORD = 'saurabh sharma';

export function setupAuth(app: Express) {
  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET is required");
  }

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: false, // Changed to false for development
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      async (username, password, done) => {
        try {
          console.log(`[Auth] Login attempt for user: ${username}`);
          if (password !== UNIVERSAL_PASSWORD) {
            console.log(`[Auth] Login failed for user: ${username} - Invalid universal password`);
            return done(null, false, { message: "Invalid password" });
          }

          let user = await storage.getUserByUsername(username);

          // If user doesn't exist, create one
          if (!user) {
            console.log(`[Auth] Creating new user: ${username}`);
            user = await storage.createUser({ username });
          }

          console.log(`[Auth] Login successful for user: ${username}`);
          return done(null, user);
        } catch (error) {
          console.error(`[Auth] Error during login:`, error);
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    console.log(`[Auth] Serializing user: ${user.id}`);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    console.log(`[Auth] Deserializing user: ${id}`);
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      console.error(`[Auth] Error deserializing user:`, error);
      done(error);
    }
  });

  app.get("/api/user", (req, res) => {
    console.log(`[Auth] User check - authenticated: ${req.isAuthenticated()}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    console.log(`[Auth] Returning user data for: ${req.user.username}`);
    res.json(req.user);
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) return next(err);
      if (!user) {
        return res.status(401).json({ message: info?.message || "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) return next(err);
        console.log(`[Auth] Login successful for user: ${user.username}`);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    const username = req.user?.username;
    console.log(`[Auth] Logout attempt for user: ${username}`);
    req.logout((err) => {
      if (err) {
        console.error(`[Auth] Logout error:`, err);
        return next(err);
      }
      console.log(`[Auth] Logout successful for user: ${username}`);
      res.sendStatus(200);
    });
  });
}
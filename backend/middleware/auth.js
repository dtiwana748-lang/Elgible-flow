import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { signToken } from "../utils/tokens.js";

const SESSION_IDLE_MS = 12 * 60 * 60 * 1000;

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ message: "Authentication required" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id).select("+activeSessionId +sessionExpiresAt");
    if (!user || !user.active) return res.status(401).json({ message: "Account is inactive" });
    if (!payload.sid || user.activeSessionId !== payload.sid) {
      return res.status(401).json({ message: "This account is active in another session. Please sign in again." });
    }
    if (!user.sessionExpiresAt || user.sessionExpiresAt.getTime() < Date.now()) {
      user.activeSessionId = undefined;
      user.sessionExpiresAt = undefined;
      await user.save();
      return res.status(401).json({ message: "Session expired after 12 hours of inactivity" });
    }

    user.lastSeenAt = new Date();
    user.sessionExpiresAt = new Date(Date.now() + SESSION_IDLE_MS);
    await user.save();
    res.setHeader("X-Auth-Token", signToken(user, payload.sid));

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "You do not have permission for this action" });
    }
    next();
  };
}

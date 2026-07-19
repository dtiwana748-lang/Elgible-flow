import jwt from "jsonwebtoken";
import { User } from "../models/User.js";

export async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ message: "Authentication required" });

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user || !user.active) return res.status(401).json({ message: "Account is inactive" });

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

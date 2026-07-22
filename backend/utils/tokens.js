import jwt from "jsonwebtoken";

export function signToken(user, sessionId) {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, name: user.name, email: user.email, sid: sessionId || user.activeSessionId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "12h" }
  );
}

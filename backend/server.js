import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { connectDb, getDbStatus } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import studentRoutes from "./routes/student.routes.js";
import userRoutes from "./routes/user.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import spreadsheetRoutes from "./routes/spreadsheet.routes.js";
import driveRoutes from "./routes/drive.routes.js";
import recordsRoutes from "./routes/records.routes.js";

const app = express();
const port = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5175"
];
const allowedOrigins = [
  ...defaultAllowedOrigins,
  ...(process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
];

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Origin is not allowed by CORS"));
  },
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 500 }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/health", (_req, res) => {
  const database = getDbStatus();
  res.status(database.connected ? 200 : 503).json({ ok: database.connected, service: "eligible-flow-api", database });
});

app.use("/api", (_req, res, next) => {
  const database = getDbStatus();
  if (database.connected) return next();
  res.status(503).json({
    message: "Database is not connected. Check MongoDB URI, Atlas Network Access IP whitelist, and internet/DNS settings.",
    database
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/spreadsheets", spreadsheetRoutes);
app.use("/api/drives", driveRoutes);
app.use("/api/records", recordsRoutes);

// Serve frontend static files in production
const frontendBuildPath = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendBuildPath));

// Catch-all route to serve index.html for React Router
app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendBuildPath, "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || "Server error" });
});

async function connectWithRetry() {
  try {
    await connectDb();
  } catch (error) {
    const retryMs = Number(process.env.MONGODB_RETRY_MS) || 10000;
    console.error("Database connection failed:", error.message);
    console.error("Check MongoDB URI, Atlas Network Access IP whitelist, and internet/DNS settings.");
    console.error(`Retrying MongoDB connection in ${Math.round(retryMs / 1000)}s...`);
    setTimeout(connectWithRetry, retryMs);
  }
}

app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
  connectWithRetry();
});

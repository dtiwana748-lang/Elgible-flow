import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { connectDb, getDbStatus } from "./config/db.js";
import authRoutes from "./routes/auth.routes.js";
import studentRoutes from "./routes/student.routes.js";
import userRoutes from "./routes/user.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import spreadsheetRoutes from "./routes/spreadsheet.routes.js";
import driveRoutes from "./routes/drive.routes.js";
import recordsRoutes from "./routes/records.routes.js";
import eligibilityRoutes from "./routes/eligibility.routes.js";
import { startAutoSyncInterval } from "./utils/autoSync.js";

const app = express();
const port = process.env.PORT || 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendBuildPath = path.join(__dirname, "../frontend/dist");
const frontendPublicPath = path.join(__dirname, "../frontend/public");

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
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (like same-origin requests, curl, Postman)
    if (!origin) return callback(null, true);
    // Allow any localhost/127.0.0.1 origin on any port for local development
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    // Allow the origin if it's in our allowed list
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Also allow any origin that matches our Render URL just in case
    if (origin.includes("onrender.com")) return callback(null, true);
    // Otherwise block it
    return callback(new Error("Origin is not allowed by CORS"), false);
  },
  credentials: true,
  exposedHeaders: ["X-Auth-Token"]
}));
app.use(express.json({ limit: "50mb" }));
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 500 }));

// Serve static files with cache control
app.use("/uploads", express.static(path.join(__dirname, "uploads"), { maxAge: "1d" }));
app.use(express.static(frontendPublicPath, { maxAge: "1d" }));

// Serve frontend build assets with long cache
app.use("/assets", express.static(path.join(frontendBuildPath, "assets"), {
  maxAge: "1y",
  immutable: true,
  etag: false
}));

// Serve index.html with no cache to prevent stale assets
app.get("/", (req, res) => {
  res.sendFile(path.join(frontendBuildPath, "index.html"), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
});

// Favicon fallback
app.get("/favicon.ico", (_req, res) => {
  res.sendFile(path.join(frontendPublicPath, "logo.png"));
});

// API routes
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
app.use("/api/eligibility", eligibilityRoutes);

// Catch-all for React Router
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendBuildPath, "index.html"), {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    }
  });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  if (req.path.startsWith("/api/")) {
    res.status(err.status || 500).json({ message: err.message || "Server error" });
  } else {
    res.status(err.status || 500).send(`<h1>Server Error</h1><p>${err.message}</p>`);
  }
});

async function startServer() {
  // Debug log
  console.log("=== Server Starting ===");
  console.log("Frontend build path:", frontendBuildPath);
  try {
    const distExists = await fs.access(frontendBuildPath).then(() => true).catch(() => false);
    console.log("Dist folder exists?", distExists);
    if (distExists) {
      const distContents = await fs.readdir(frontendBuildPath);
      console.log("Dist contents:", distContents);
      const assetsPath = path.join(frontendBuildPath, "assets");
      const assetsExists = await fs.access(assetsPath).then(() => true).catch(() => false);
      if (assetsExists) {
        const assetsContents = await fs.readdir(assetsPath);
        console.log("Assets contents:", assetsContents);
      }
    }
  } catch (e) {
    console.error("Error checking dist folder:", e);
  }

  // Connect to DB
  await connectWithRetry();

  // Start background auto-sync interval for connected Google Sheets (every 2 minutes)
  startAutoSyncInterval(2 * 60 * 1000);

  const server = app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
  });
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`Port ${port} is already in use. The API may already be running at http://localhost:${port}.`);
      console.error("Stop the existing backend process before starting another one, or set PORT to a different value.");
      process.exit(0);
    }
    throw error;
  });
}

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

startServer();

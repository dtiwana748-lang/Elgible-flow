import mongoose from "mongoose";

let lastConnectionError = null;

export async function connectDb() {
  mongoose.set("strictQuery", true);
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS) || 8000
    });
    lastConnectionError = null;
    console.log("MongoDB connected");
  } catch (error) {
    lastConnectionError = error;
    throw error;
  }
}

export function getDbStatus() {
  return {
    connected: mongoose.connection.readyState === 1,
    state: mongoose.connection.readyState,
    lastError: lastConnectionError?.message || null
  };
}

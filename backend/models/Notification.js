import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    body: String,
    readAt: Date,
    entity: String,
    entityId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true }
);

export const Notification = mongoose.model("Notification", notificationSchema);

import mongoose from "mongoose";

const driveRoundSchema = new mongoose.Schema(
  {
    drive: { type: mongoose.Schema.Types.ObjectId, ref: "Drive", required: true, index: true },
    roundName: { type: String, required: true, trim: true },
    roundType: { type: String, trim: true },
    roundNumber: { type: Number, required: true },
    date: Date,
    startTime: String,
    endTime: String,
    venue: String,
    meetingLink: String,
    instructions: String,
    resultStatus: { type: String, enum: ["DRAFT", "DECLARED", "LOCKED"], default: "DRAFT" },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
  },
  { timestamps: true }
);

driveRoundSchema.index({ drive: 1, roundNumber: 1 }, { unique: true });

export const DriveRound = mongoose.model("DriveRound", driveRoundSchema);

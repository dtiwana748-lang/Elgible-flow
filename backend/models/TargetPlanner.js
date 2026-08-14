import mongoose from "mongoose";

const targetPlannerSchema = new mongoose.Schema({
  academicYear: { type: String, required: true, index: true },
  outreachMember: { type: String, required: true, trim: true, index: true },
  
  // Data for each quarter
  quarters: {
    "Jul-Sep": {
      targetAllotted: { zsd: { type: Number, default: 0 }, sd: { type: Number, default: 0 }, aPlus: { type: Number, default: 0 }, a: { type: Number, default: 0 } },
      targetAchieved: { zsd: { type: Number, default: 0 }, sd: { type: Number, default: 0 }, aPlus: { type: Number, default: 0 }, a: { type: Number, default: 0 } },
      floated: { type: Number, default: 0 },
      closed: { type: Number, default: 0 },
      delayInClosure: { type: Number, default: 0 },
      sales: { type: Number, default: 0 },
      core: { type: Number, default: 0 }
    },
    "Oct-Dec": {
      targetAllotted: { zsd: { type: Number, default: 0 }, sd: { type: Number, default: 0 }, aPlus: { type: Number, default: 0 }, a: { type: Number, default: 0 } },
      targetAchieved: { zsd: { type: Number, default: 0 }, sd: { type: Number, default: 0 }, aPlus: { type: Number, default: 0 }, a: { type: Number, default: 0 } },
      floated: { type: Number, default: 0 },
      closed: { type: Number, default: 0 },
      delayInClosure: { type: Number, default: 0 },
      sales: { type: Number, default: 0 },
      core: { type: Number, default: 0 }
    },
    "Jan-Mar": {
      targetAllotted: { zsd: { type: Number, default: 0 }, sd: { type: Number, default: 0 }, aPlus: { type: Number, default: 0 }, a: { type: Number, default: 0 } },
      targetAchieved: { zsd: { type: Number, default: 0 }, sd: { type: Number, default: 0 }, aPlus: { type: Number, default: 0 }, a: { type: Number, default: 0 } },
      floated: { type: Number, default: 0 },
      closed: { type: Number, default: 0 },
      delayInClosure: { type: Number, default: 0 },
      sales: { type: Number, default: 0 },
      core: { type: Number, default: 0 }
    },
    "April-Jun": {
      targetAllotted: { zsd: { type: Number, default: 0 }, sd: { type: Number, default: 0 }, aPlus: { type: Number, default: 0 }, a: { type: Number, default: 0 } },
      targetAchieved: { zsd: { type: Number, default: 0 }, sd: { type: Number, default: 0 }, aPlus: { type: Number, default: 0 }, a: { type: Number, default: 0 } },
      floated: { type: Number, default: 0 },
      closed: { type: Number, default: 0 },
      delayInClosure: { type: Number, default: 0 },
      sales: { type: Number, default: 0 },
      core: { type: Number, default: 0 }
    }
  }
}, { timestamps: true });

targetPlannerSchema.index({ academicYear: 1, outreachMember: 1 }, { unique: true });

export const TargetPlanner = mongoose.model("TargetPlanner", targetPlannerSchema);

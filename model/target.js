import mongoose from 'mongoose';

const targetSchema = new mongoose.Schema(
  {
    targetNumber: {
      type: Number,
      required: true,
      min: 0,
    },
    scanImagePath: {
      type: String,
      default: null,
    },
    debugImagePath: {
      type: String,
      default: null,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Session',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    shots: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shot',
      },
    ],
  },
  {
    timestamps: true,
  },
);

targetSchema.index(
  { sessionId: 1, userId: 1, targetNumber: 1 },
  { unique: true },
);

export default mongoose.model('Target', targetSchema);

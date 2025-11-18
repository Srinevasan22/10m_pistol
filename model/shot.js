import mongoose from 'mongoose';

const shotSchema = new mongoose.Schema({
  score: {
    type: Number,
    required: true,
  },
  ringScore: {
    type: Number,
    min: 0,
    max: 10,
  },
  decimalScore: {
    type: Number,
    min: 0,
    max: 10.9,
  },
  isInnerTen: {
    type: Boolean,
    default: false,
  },
  positionX: {
    type: Number,
    default: 0,
  },
  positionY: {
    type: Number,
    default: 0,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Target',
    required: true,
  },
  targetIndex: {
    type: Number,
    min: 0,
  },
  targetNumber: {
    type: Number,
    min: 0,
  },
  targetShotIndex: {
    type: Number,
    min: 0,
  },
  targetShotNumber: {
    type: Number,
    min: 0,
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
  }
});

// Correctly export Shot as the default export
const Shot = mongoose.model('Shot', shotSchema);
export default Shot;

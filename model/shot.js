import mongoose from 'mongoose';

const shotSchema = new mongoose.Schema({
  score: {
    type: Number,
    required: true,
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

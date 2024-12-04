const shotSchema = new mongoose.Schema({
    sessionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Session',
        required: true,
    },
    positionX: {
        type: Number,
        default: 0, // Default to 0 as per your requirements
    },
    positionY: {
        type: Number,
        default: 0, // Default to 0 as per your requirements
    },
    score: {
        type: Number,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

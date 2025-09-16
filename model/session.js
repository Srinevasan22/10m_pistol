import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
    date: {
        type: Date,
        default: Date.now,
    },
    totalShots: {
        type: Number,
        default: 0,
    },
    averageScore: {
        type: Number,
        default: 0,
    },
    maxScore: {
        type: Number,
        default: 0,
    },
    minScore: {
        type: Number,
        default: 0,
    },
    shots: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Shot'
    }],
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    }
});

// Method to populate shot details when retrieving session
sessionSchema.methods.populateShots = async function populateShots({ userId } = {}) {
    const userObjectId = userId instanceof mongoose.Types.ObjectId
        ? userId
        : (mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null);

    await this.populate({
        path: 'shots',
        match: userObjectId ? { userId: userObjectId } : undefined,
    });

    this.shots = Array.isArray(this.shots) ? this.shots.filter(Boolean) : [];

    return this;
};

// Export as default
export default mongoose.model('Session', sessionSchema);

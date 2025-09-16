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

sessionSchema.methods.populateShots = async function populateShots({ userId } = {}) {
    const session = this;

    const userObjectId = userId instanceof mongoose.Types.ObjectId
        ? userId
        : (mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : null);

    await session.populate({
        path: 'shots',
        match: userObjectId ? { userId: userObjectId } : undefined,
    });

    const filteredShots = Array.isArray(session.shots) ? session.shots.filter(Boolean) : [];
    session.set('shots', filteredShots);

    return session;
};

// Export as default
export default mongoose.model('Session', sessionSchema);

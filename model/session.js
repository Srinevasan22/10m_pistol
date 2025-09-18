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
    targets: {
        type: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Target',
            },
        ],
        default: [],
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    }
});

// Method to populate target and shot details when retrieving session
sessionSchema.methods.populateTargets = async function () {
    await this.populate({
        path: 'targets',
        options: { sort: { targetNumber: 1 } },
        populate: {
            path: 'shots',
            options: { sort: { timestamp: 1 } },
        },
    });
    return this;
};

// Export as default
export default mongoose.model('Session', sessionSchema);

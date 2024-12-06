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
sessionSchema.methods.populateShots = function () {
    return this.populate('shots').execPopulate();
};

// Export as default
export default mongoose.model('Session', sessionSchema);
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
    }]
});

export const Session = mongoose.model('Session', sessionSchema);

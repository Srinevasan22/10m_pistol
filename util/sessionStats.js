import Session from "../model/session.js";
import Shot from "../model/shot.js";

export const recalculateSessionStats = async (sessionId) => {
  if (!sessionId) {
    return null;
  }

  const session = await Session.findById(sessionId);

  if (!session) {
    return null;
  }

  const shots = await Shot.find({ sessionId });
  const totalShots = shots.length;

  if (totalShots === 0) {
    session.totalShots = 0;
    session.averageScore = 0;
    session.maxScore = 0;
    session.minScore = 0;
  } else {
    const scores = shots.map((shot) => shot.score);
    const sumScores = scores.reduce((sum, score) => sum + score, 0);

    session.totalShots = totalShots;
    session.averageScore = sumScores / totalShots;
    session.maxScore = Math.max(...scores);
    session.minScore = Math.min(...scores);
  }

  await session.save();

  return session;
};

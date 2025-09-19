import express from "express";
import mongoose from "mongoose";

import {
  addShot,
  getShotsBySession,
  getShotById,
  updateShot,
  deleteShot,
} from "../controller/shotController.js";
import Session from "../model/session.js";

const router = express.Router();

const ensureUserIdFromSession = async (req, res, next) => {
  if (req.params.userId) {
    return next();
  }

  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: "Session ID is required" });
  }

  if (!mongoose.Types.ObjectId.isValid(sessionId)) {
    return res.status(400).json({ error: "Invalid session identifier" });
  }

  try {
    const session = await Session.findById(sessionId).select("userId");

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    req.params.userId = session.userId.toString();
    return next();
  } catch (error) {
    console.error("Failed to resolve user for legacy shot route:", error);
    return res
      .status(500)
      .json({ error: "Failed to resolve user for legacy shot route" });
  }
};

router.post("/:sessionId/shots", ensureUserIdFromSession, addShot);
router.get("/:sessionId/shots", ensureUserIdFromSession, getShotsBySession);
router.get(
  "/:sessionId/shots/:shotId",
  ensureUserIdFromSession,
  getShotById,
);
router.put(
  "/:sessionId/shots/:shotId",
  ensureUserIdFromSession,
  updateShot,
);
router.delete(
  "/:sessionId/shots/:shotId",
  ensureUserIdFromSession,
  deleteShot,
);

export default router;

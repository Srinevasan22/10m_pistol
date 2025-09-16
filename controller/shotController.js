import Shot from "../model/shot.js";
import Session from "../model/session.js";
import mongoose from "mongoose"; // Ensure ObjectId conversion
import { recalculateSessionStats } from "../util/sessionStats.js";

// Add a new shot
export const addShot = async (req, res) => {
  try {
    console.log("Received request body:", req.body);

    if (!req.params.sessionId || !req.params.userId) {
      console.log("No sessionId or userId provided in request params");
      return res
        .status(400)
        .json({ error: "Session ID and User ID are required" });
    }

    const shot = new Shot({
      ...req.body,
      sessionId: mongoose.Types.ObjectId(req.params.sessionId),
      userId: req.params.userId,
      positionX: req.body.positionX || 0,
      positionY: req.body.positionY || 0,
    });

    console.log("Shot to be saved:", shot);

    // Save the shot to the database
    await shot.save();

    // Add the saved shot to the session
    const session = await Session.findById(req.params.sessionId);
    if (!session) {
      console.log("Session not found:", req.params.sessionId);
      return res.status(404).json({ error: "Session not found" });
    }

    // Verify that the session's userId matches the provided userId
    if (session.userId.toString() !== req.params.userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized to add a shot to this session" });
    }

    // Add the shot's ID to the session's shots array
    session.shots.push(shot._id);
    await session.save();

    await recalculateSessionStats(session._id);

    console.log("Shot saved and added to session successfully:", shot);
    res.status(201).json(shot);
  } catch (error) {
    console.error("Error adding shot:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get all shots by session ID
export const getShotsBySession = async (req, res) => {
  try {
    console.log(
      "Fetching shots for sessionId:",
      req.params.sessionId,
      "and userId:",
      req.params.userId,
    );

    // Verify userId is provided
    if (!req.params.userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const shots = await Shot.find({
      sessionId: mongoose.Types.ObjectId(req.params.sessionId), // Ensure ObjectId conversion
      userId: req.params.userId,
    });

    console.log("Shots found:", shots);
    res.json(shots);
  } catch (error) {
    console.error("Error fetching shots by session ID:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Get a shot by ID
export const getShotById = async (req, res) => {
  try {
    console.log("Fetching shot by shotId:", req.params.shotId);
    const shot = await Shot.findById(req.params.shotId);

    if (!shot) {
      console.log("Shot not found:", req.params.shotId);
      return res.status(404).json({ error: "Shot not found" });
    }

    // Verify that the shot belongs to the user
    if (shot.userId.toString() !== req.params.userId) {
      return res.status(403).json({ error: "Unauthorized to view this shot" });
    }

    res.json(shot);
  } catch (error) {
    console.error("Error fetching shot by ID:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Update a shot by ID
export const updateShot = async (req, res) => {
  try {
    console.log("Updating shot with ID:", req.params.shotId);

    const shot = await Shot.findById(req.params.shotId);

    if (!shot) {
      console.log("Shot not found for update:", req.params.shotId);
      return res.status(404).json({ error: "Shot not found" });
    }

    // Verify that the shot belongs to the user
    if (shot.userId.toString() !== req.params.userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized to update this shot" });
    }

    if (req.body.score !== undefined) {
      shot.score = req.body.score;
    }
    if (req.body.positionX !== undefined) {
      shot.positionX = req.body.positionX;
    }
    if (req.body.positionY !== undefined) {
      shot.positionY = req.body.positionY;
    }
    if (req.body.timestamp !== undefined) {
      shot.timestamp = req.body.timestamp;
    }

    await shot.save();

    await recalculateSessionStats(shot.sessionId);

    console.log("Shot updated successfully:", shot);
    res.json(shot);
  } catch (error) {
    console.error("Error updating shot:", error.message);
    res.status(500).json({ error: error.message });
  }
};

// Delete a shot by ID
export const deleteShot = async (req, res) => {
  try {
    console.log("Deleting shot with ID:", req.params.shotId);
    const shot = await Shot.findById(req.params.shotId);

    if (!shot) {
      console.log("Shot not found for deletion:", req.params.shotId);
      return res.status(404).json({ error: "Shot not found" });
    }

    // Verify that the shot belongs to the user
    if (shot.userId.toString() !== req.params.userId) {
      return res
        .status(403)
        .json({ error: "Unauthorized to delete this shot" });
    }

    await shot.remove();

    // Remove the shot reference from the session's shots array
    await Session.findByIdAndUpdate(shot.sessionId, {
      $pull: { shots: req.params.shotId },
    });

    await recalculateSessionStats(shot.sessionId);

    console.log("Shot deleted successfully:", req.params.shotId);
    res.json({ message: "Shot deleted successfully" });
  } catch (error) {
    console.error("Error deleting shot:", error.message);
    res.status(500).json({ error: error.message });
  }
};

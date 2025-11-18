import express from "express";
const router = express.Router();
import {
  addShot,
  getShotsBySession,
  getShotById,
  updateShot,
  deleteShot,
} from "../controller/shotController.js";
import Shot from "../model/shot.js"; // Correct import of Shot model
import { check, validationResult } from "express-validator";
import mongoose from "mongoose"; // Import for ObjectId validation

const hasTargetNumberInput = (body = {}) => {
  const targetNumberKeys = [
    "targetNumber",
    "target_number",
    "targetNo",
    "target_no",
  ];
  const targetIndexKeys = ["targetIndex", "target_index"];

  return (
    targetNumberKeys.some(
      (key) => body[key] !== undefined && body[key] !== null,
    ) ||
    targetIndexKeys.some(
      (key) => body[key] !== undefined && body[key] !== null,
    )
  );
};

// Middleware to validate ObjectId
const validateObjectId = (paramName) => {
  return (req, res, next) => {
    if (!mongoose.Types.ObjectId.isValid(req.params[paramName])) {
      return res
        .status(400)
        .json({ error: `${paramName} is not a valid ObjectId` });
    }
    next();
  };
};

// Route to add a new shot to a specific session for a specific user
// @route POST /users/:userId/sessions/:sessionId/shots
router.post(
  "/users/:userId/sessions/:sessionId/shots",
  [
    validateObjectId("userId"),
    validateObjectId("sessionId"),
    // Validate the score field
    check("score", "Score is required and must be a number")
      .isNumeric()
      .not()
      .isEmpty(),
    check("score", "Score must be between 0 and 10.9").isFloat({
      min: 0,
      max: 10.9,
    }),
    check("targetIndex", "targetIndex must be a non-negative integer")
      .optional({ nullable: true })
      .isInt({ min: 0 }),
    check("targetNumber", "targetNumber must be a non-negative integer")
      .optional({ nullable: true })
      .isInt({ min: 0 }),
    check("targetShotIndex", "targetShotIndex must be a non-negative integer")
      .optional({ nullable: true })
      .isInt({ min: 0 }),
    check(
      "targetShotNumber",
      "targetShotNumber must be a non-negative integer",
    )
      .optional({ nullable: true })
      .isInt({ min: 0 }),
  ],
  (req, res, next) => {
    if (!hasTargetNumberInput(req.body)) {
      return res
        .status(400)
        .json({ error: "targetNumber is required to add a shot" });
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  addShot,
);

// Route to get all shots by session ID for a specific user
// @route GET /users/:userId/sessions/:sessionId/shots
router.get(
  "/users/:userId/sessions/:sessionId/shots",
  [validateObjectId("userId"), validateObjectId("sessionId")],
  getShotsBySession,
);

// Route to get a shot by its ID within a session for a specific user
// @route GET /users/:userId/sessions/:sessionId/shots/:shotId
router.get(
  "/users/:userId/sessions/:sessionId/shots/:shotId",
  [
    validateObjectId("userId"),
    validateObjectId("sessionId"),
    validateObjectId("shotId"),
  ],
  async (req, res) => {
    try {
      const shot = await getShotById(req, res);
      if (!shot) {
        return res.status(404).json({ message: "Shot not found" });
      }
      res.status(200).json(shot);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Route to update a shot by its ID within a session for a specific user
// @route PUT /users/:userId/sessions/:sessionId/shots/:shotId
router.put(
  "/users/:userId/sessions/:sessionId/shots/:shotId",
  [
    validateObjectId("userId"),
    validateObjectId("sessionId"),
    validateObjectId("shotId"),
    // Validate the score field if it's present
    check("score", "Score must be a number").optional().isNumeric(),
    check("score", "Score must be between 0 and 10.9")
      .optional()
      .isFloat({ min: 0, max: 10.9 }),
    check("targetIndex", "targetIndex must be a non-negative integer")
      .optional({ nullable: true })
      .isInt({ min: 0 }),
    check("targetNumber", "targetNumber must be a non-negative integer")
      .optional({ nullable: true })
      .isInt({ min: 0 }),
    check("targetShotIndex", "targetShotIndex must be a non-negative integer")
      .optional({ nullable: true })
      .isInt({ min: 0 }),
    check(
      "targetShotNumber",
      "targetShotNumber must be a non-negative integer",
    )
      .optional({ nullable: true })
      .isInt({ min: 0 }),
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
  async (req, res) => {
    try {
      const shot = await updateShot(req, res);
      if (!shot) {
        return res.status(404).json({ message: "Shot not found" });
      }
      res.status(200).json(shot);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Route to delete a shot by its ID within a session for a specific user
// @route DELETE /users/:userId/sessions/:sessionId/shots/:shotId
router.delete(
  "/users/:userId/sessions/:sessionId/shots/:shotId",
  [
    validateObjectId("userId"),
    validateObjectId("sessionId"),
    validateObjectId("shotId"),
  ],
  async (req, res) => {
    try {
      const result = await deleteShot(req, res);
      if (!result) {
        return res.status(404).json({ message: "Shot not found" });
      }
      res.status(200).json({ message: "Shot deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// NEW: Route to get all shots (irrespective of session or user)
// @route GET /shots
router.get("/debug/shots", async (req, res) => {
  try {
    const shots = await Shot.find();
    res.status(200).json(shots);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

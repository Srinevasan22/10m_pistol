import express from "express";
import {
  createUser,
  getAllUsers,
  getUserById,
  deleteUserById,
  exportUserData,
  updateUserById,
} from "../controller/userController.js";

import { check, validationResult } from "express-validator";

const router = express.Router();

// @desc    Create a new user
// @route   POST /pistol/users
// @access  Public
router.post(
  "/",
  [
    // Validate the username field
    check("username", "Username is required").not().isEmpty(),
    check("username", "Username must be a string").isString(),
  ],
  (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    return next();
  },
  createUser
);

// @desc    Get all users
// @route   GET /pistol/users
// @access  Public
router.get("/", getAllUsers);

// @desc    Export all data for a user as CSV
// @route   GET /pistol/users/:userId/export
// @access  Public (for now)
router.get("/:userId/export", exportUserData);

// @desc    Get user by ID
// @route   GET /pistol/users/:userId
// @access  Public
router.get("/:userId", getUserById);

// @desc    Update user by ID
// @route   PATCH /pistol/users/:userId
// @access  Public
router.patch("/:userId", updateUserById);

// @desc    Update user by ID
// @route   PUT /pistol/users/:userId
// @access  Public
router.put("/:userId", updateUserById);

// @desc    Delete user by ID
// @route   DELETE /pistol/users/:userId
// @access  Public
router.delete("/:userId", deleteUserById);

export default router;

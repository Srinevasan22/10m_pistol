import express from "express";
import {
  createUser,
  getAllUsers,
  getUserById,
  deleteUserById,
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

// @desc    Get user by ID
// @route   GET /pistol/users/:userId
// @access  Public
router.get("/:userId", getUserById);

// @desc    Delete user by ID
// @route   DELETE /pistol/users/:userId
// @access  Public
router.delete("/:userId", deleteUserById);

export default router;

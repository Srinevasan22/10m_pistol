import express from "express";
import {
  createUser,
  getAllUsers,
  getUserById,       // Import getUserById
  deleteUserById     // Import deleteUserById
} from "../controller/userController.js";

const router = express.Router();

// @desc    Create a new user
// @route   POST /pistol/users
// @access  Public
router.post("/", createUser);

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

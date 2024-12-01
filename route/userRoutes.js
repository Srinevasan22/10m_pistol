import express from "express";
import { createUser, getAllUsers } from "../controller/userController.js";

const router = express.Router();

// @desc    Create a new user
// @route   POST /pistol/users
// @access  Public
router.post("/", createUser);

// @desc    Get all users
// @route   GET /pistol/users
// @access  Public
router.get("/", getAllUsers);

export default router;

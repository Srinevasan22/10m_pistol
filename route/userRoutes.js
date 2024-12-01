import express from "express";
import User from "../model/user.js";

const router = express.Router();

// @desc    Create a new user
// @route   POST /pistol/users
// @access  Public
router.post("/", async (req, res) => {
  const { username, createdAt } = req.body;

  try {
    const user = new User({ username, createdAt });
    const newUser = await user.save();
    console.log("User created:", newUser); // Log the created user
    res.status(201).json(newUser);
  } catch (error) {
    console.error("Error creating user:", error.message); // Log any errors
    res.status(400).json({ message: "Failed to create user", error: error.message });
  }
});

// @desc    Get all users
// @route   GET /pistol/users
// @access  Public
router.get("/", async (req, res) => {
  try {
    const users = await User.find();
    console.log("Fetched users:", users); // Log the fetched users
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error.message); // Log any errors
    res.status(500).json({ message: "Failed to get users", error: error.message });
  }
});

export default router;

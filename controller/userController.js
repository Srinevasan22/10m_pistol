import User from '../model/user.js';

// Create a new user
export const createUser = async (req, res) => {
  const { username, createdAt } = req.body;

  try {
    const user = new User({ username, createdAt });
    const newUser = await user.save();
    console.log("User created:", newUser); // Log the created user
    res.status(201).json(newUser);
  } catch (error) {
    if (error.code === 11000) { // Duplicate key error code for MongoDB
      res.status(400).json({
        message: "Username already exists. Please choose a different username."
      });
    } else {
      console.error("Error creating user:", error.message); // Log any other errors
      res.status(400).json({ message: "Failed to create user", error: error.message });
    }
  }
};

// Get all users
export const getAllUsers = async (req, res) => {
  try {
    const users = await User.find();
    console.log("Fetched users:", users); // Log the fetched users
    res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users:", error.message); // Log any errors
    res.status(500).json({ message: "Failed to get users", error: error.message });
  }
};

// Get user by ID
export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      console.log("User not found with ID:", req.params.userId); // Log if user not found
      return res.status(404).json({ message: "User not found" });
    }
    console.log("Fetched user by ID:", user); // Log the fetched user
    res.status(200).json(user);
  } catch (error) {
    console.error("Error fetching user by ID:", error.message); // Log any errors
    res.status(500).json({ message: "Failed to get user", error: error.message });
  }
};

// Delete user by ID
export const deleteUserById = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.userId);
    if (!user) {
      console.log("User not found for deletion with ID:", req.params.userId); // Log if user not found
      return res.status(404).json({ message: "User not found" });
    }
    console.log("User deleted:", user); // Log the deleted user
    res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Error deleting user:", error.message); // Log any errors
    res.status(500).json({ message: "Failed to delete user", error: error.message });
  }
};

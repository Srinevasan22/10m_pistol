import User from '../model/user.js';
import Session from '../model/session.js';
import Shot from '../model/shot.js';

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

// Helper: escape values for CSV
const toCsvValue = (value) => {
  if (value === null || value === undefined) return '';
  const v = value instanceof Date ? value.toISOString() : String(value);
  const needsQuotes = v.includes('"') || v.includes(',') || v.includes('\n') || v.includes('\r');
  if (!needsQuotes) return v;
  return `"${v.replace(/"/g, '""')}"`;
};

// @desc    Export all data for a user as CSV
// @route   GET /pistol/users/:userId/export
// @access  Public for now (consider protecting with auth later)
export const exportUserData = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const sessions = await Session.find({ userId }).lean();

    const header = [
      'userId',
      'username',
      'sessionId',
      'sessionDate',
      'sessionTotalShots',
      'sessionAverageScore',
      'sessionMaxScore',
      'sessionMinScore',
      'shotId',
      'shotScore',
      'shotPositionX',
      'shotPositionY',
      'shotTimestamp',
    ];

    const rows = [header];

    for (const session of sessions) {
      const shots = await Shot.find({ sessionId: session._id }).lean();

      const sessionDate = session.date || session.createdAt || null;
      const totalShots =
        session.totalShots != null
          ? session.totalShots
          : shots.length;
      const avgScore = session.averageScore != null ? session.averageScore : null;
      const maxScore = session.maxScore != null ? session.maxScore : null;
      const minScore = session.minScore != null ? session.minScore : null;

      if (shots.length === 0) {
        rows.push([
          user._id,
          user.username || '',
          session._id,
          sessionDate,
          totalShots,
          avgScore,
          maxScore,
          minScore,
          '',
          '',
          '',
          '',
          '',
        ]);
      } else {
        shots.forEach((shot) => {
          rows.push([
            user._id,
            user.username || '',
            session._id,
            sessionDate,
            totalShots,
            avgScore,
            maxScore,
            minScore,
            shot._id,
            shot.score,
            shot.positionX,
            shot.positionY,
            shot.timestamp,
          ]);
        });
      }
    }

    const csv = rows
      .map((row) => row.map(toCsvValue).join(','))
      .join('\n');

    const filename = `aimsight-data-${user.username || user._id}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error('Error exporting user data:', error);
    res
      .status(500)
      .json({ message: "Failed to export user data", error: error.message });
  }
};

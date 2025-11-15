import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../model/user.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-fallback-secret';
const JWT_EXPIRES_IN = '7d';

const createTokenForUser = (user) =>
  jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const publicUser = (user) => ({
  _id: user._id,
  username: user.username,
  email: user.email,
  provider: user.provider,
  createdAt: user.createdAt,
});

// POST /pistol/auth/register
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password) {
      return res.status(400).json({
        message: 'username, email and password are required',
      });
    }

    const existing = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    });

    if (existing) {
      // Email or username already taken
      return res.status(409).json({
        message: 'User already exists with this email or username',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email: email.toLowerCase(),
      passwordHash,
      provider: 'password',
    });

    const token = createTokenForUser(user);

    return res.status(201).json({
      user: publicUser(user),
      token,
    });
  } catch (error) {
    console.error('Error in registerUser:', error);
    return res.status(500).json({
      message: 'Failed to register user',
      error: error.message,
    });
  }
};

// POST /pistol/auth/login
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'email and password are required' });
    }

    const user = await User.findOne({
      email: email.toLowerCase(),
      provider: 'password',
    });

    if (!user || !user.passwordHash) {
      return res.status(404).json({ message: 'User not found' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const token = createTokenForUser(user);

    return res.status(200).json({
      user: publicUser(user),
      token,
    });
  } catch (error) {
    console.error('Error in loginUser:', error);
    return res.status(500).json({
      message: 'Failed to log in',
      error: error.message,
    });
  }
};

// POST /pistol/auth/google
export const googleAuth = async (req, res) => {
  try {
    const { email, username, googleId } = req.body || {};

    if (!email) {
      return res.status(400).json({ message: 'email is required' });
    }

    let user =
      (googleId && (await User.findOne({ googleId }))) ||
      (await User.findOne({ email: email.toLowerCase() }));

    if (!user) {
      // Create a new user from Google info
      user = await User.create({
        username: username || email,
        email: email.toLowerCase(),
        googleId: googleId || undefined,
        provider: 'google',
      });
    } else if (!user.googleId && googleId) {
      // Link existing password-based user to Google
      user.googleId = googleId;
      user.provider = user.provider || 'google';
      await user.save();
    }

    const token = createTokenForUser(user);

    return res.status(200).json({
      user: publicUser(user),
      token,
    });
  } catch (error) {
    console.error('Error in googleAuth:', error);
    return res.status(500).json({
      message: 'Failed to authenticate with Google',
      error: error.message,
    });
  }
};

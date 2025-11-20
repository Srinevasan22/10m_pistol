import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User from '../model/user.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-fallback-secret';
const JWT_EXPIRES_IN = '7d';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const createTokenForUser = (user) =>
  jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

const publicUser = (user) => ({
  _id: user._id,
  username: user.username,
  email: user.email,
  googleId: user.googleId,
  providers: user.providers,
  createdAt: user.createdAt,
});

const ensureProvider = (user, provider) => {
  if (!user.providers) {
    user.providers = [];
  }
  if (!user.providers.includes(provider)) {
    user.providers.push(provider);
  }
};

const verifyGoogleToken = async (idToken) => {
  if (!GOOGLE_CLIENT_ID) {
    throw new Error('GOOGLE_CLIENT_ID not configured');
  }

  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  return {
    googleId: payload.sub,
    email: payload.email?.toLowerCase() || null,
  };
};

// POST /pistol/auth/register
export const registerUser = async (req, res) => {
  try {
    const { username, email, password } = req.body || {};

    if (!username || !email || !password) {
      return res.status(400).json({
        message: 'username, email and password are required',
      });
    }

    const emailLower = email.toLowerCase();

    let existingByEmail = await User.findOne({ email: emailLower });
    if (existingByEmail) {
      if (!existingByEmail.passwordHash) {
        const passwordHash = await bcrypt.hash(password, 10);
        existingByEmail.passwordHash = passwordHash;
        ensureProvider(existingByEmail, 'local');
        if (!existingByEmail.username) {
          existingByEmail.username = username;
        }
        await existingByEmail.save();

        const token = createTokenForUser(existingByEmail);

        return res.status(200).json({
          message: 'Password added to existing account',
          user: publicUser(existingByEmail),
          token,
        });
      }

      return res.status(409).json({
        message: 'User already exists with this email',
      });
    }

    const existingByUsername = await User.findOne({ username });
    if (existingByUsername) {
      return res.status(409).json({
        message: 'User already exists with this username',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.create({
      username,
      email: emailLower,
      passwordHash,
      providers: ['local'],
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
    });

    if (!user || !user.passwordHash) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      return res.status(400).json({ message: 'Invalid credentials' });
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
    const { idToken } = req.body || {};

    if (!idToken) {
      return res.status(400).json({ message: 'Google ID token is required' });
    }

    const { googleId, email } = await verifyGoogleToken(idToken);

    let user = await User.findOne({ googleId });

    if (!user && email) {
      user = await User.findOne({ email });
      if (user) {
        user.googleId = googleId;
        if (email && !user.email) {
          user.email = email;
        }
        ensureProvider(user, 'google');
        await user.save();
      }
    }

    if (!user) {
      const generatedUsername = email
        ? email.split('@')[0]
        : `google_${googleId.slice(0, 6)}`;
      user = await User.create({
        username: generatedUsername,
        email,
        googleId,
        providers: ['google'],
      });
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

// POST /pistol/auth/link-google
export const linkGoogleAccount = async (req, res) => {
  try {
    const { userId, idToken } = req.body || {};

    if (!userId || !idToken) {
      return res
        .status(400)
        .json({ message: 'userId and Google ID token are required' });
    }

    const { googleId, email } = await verifyGoogleToken(idToken);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.googleId === googleId || user.providers?.includes('google')) {
      return res.status(200).json({
        message: 'Google account already linked',
        alreadyLinked: true,
        user: publicUser(user),
      });
    }

    if (user.email && email && user.email.toLowerCase() !== email) {
      return res.status(400).json({
        message: 'Google email does not match the email of this account',
      });
    }

    user.googleId = googleId;
    if (email && !user.email) {
      user.email = email;
    }
    ensureProvider(user, 'google');

    await user.save();

    const token = createTokenForUser(user);

    return res.status(200).json({
      message: 'Google account linked successfully',
      alreadyLinked: false,
      user: publicUser(user),
      token,
    });
  } catch (error) {
    console.error('Error in linkGoogleAccount:', error);
    return res.status(500).json({
      message: 'Failed to link Google account',
      error: error.message,
    });
  }
};

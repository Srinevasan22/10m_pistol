import express from 'express';
import {
  registerUser,
  loginUser,
  googleAuth,
  linkGoogleAccount,
} from '../controller/authController.js';

const router = express.Router();

// @desc    Register new user (email + password)
// @route   POST /pistol/auth/register
// @access  Public (for now)
router.post('/register', registerUser);

// @desc    Login user (email + password)
// @route   POST /pistol/auth/login
// @access  Public (for now)
router.post('/login', loginUser);

// @desc    Google auth (create or reuse user)
// @route   POST /pistol/auth/google
// @access  Public (for now)
router.post('/google', googleAuth);

// @desc    Link Google account to an existing user
// @route   POST /pistol/auth/link-google
// @access  Requires authentication (userId provided in body)
router.post('/link-google', linkGoogleAccount);

export default router;

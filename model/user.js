import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },

  // Profile fields
  firstName: {
    type: String,
    trim: true,
  },

  lastName: {
    type: String,
    trim: true,
  },

  // NEW: optional email for real login + Google
  email: {
    type: String,
    trim: true,
    lowercase: true,
    unique: true,
    sparse: true, // allows multiple null/undefined
  },

  dateOfBirth: {
    type: Date,
  },

  // NEW: hashed password for email/password accounts
  passwordHash: {
    type: String,
  },

  // NEW: optional Google ID so we can link Google logins
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },

  // NEW: remember how the account was created (dev, password, google)
  providers: {
    type: [String],
    default: [],
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model('User', userSchema);

export default User;

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Models
const SessionSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now },
  totalShots: Number,
  averageScore: Number,
});
const ShotSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },
  score: Number,
  positionX: Number,
  positionY: Number,
});
const Session = mongoose.model('Session', SessionSchema);
const Shot = mongoose.model('Shot', ShotSchema);

// Routes
app.get('/', (req, res) => {
  res.send('10m Pistol API is working!');
});

// Create a new session
app.post('/sessions', async (req, res) => {
  try {
    const session = new Session(req.body);
    await session.save();
    res.status(201).json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch all sessions
app.get('/sessions', async (req, res) => {
  try {
    const sessions = await Session.find();
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();

const connectDB = require('./util/db'); // Import the database connection function

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());

// MongoDB Connection
connectDB(); // Use the centralized database connection

// Models
const Session = require('./model/session'); // Import the Session model
const Shot = require('./model/shot'); // Import the Shot model

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

// Create a new shot
app.post('/shots', async (req, res) => {
  try {
    const shot = new Shot(req.body);
    await shot.save();
    res.status(201).json(shot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch all shots for a session
app.get('/sessions/:sessionId/shots', async (req, res) => {
  try {
    const shots = await Shot.find({ sessionId: req.params.sessionId });
    res.json(shots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

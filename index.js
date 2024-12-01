import express from 'express';
import dotenv from 'dotenv';
import connectDB from './util/db.js';
import sessionRoutes from './route/sessionRoutes.js';
import shotRoutes from './route/shotRoutes.js';
import path from 'path';

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(express.json()); // Parse incoming JSON requests

// Serve favicon.ico
app.use('/favicon.ico', express.static(path.join(__dirname, 'public', 'favicon.ico')));

// Routes
app.use('/api/pistol/sessions', sessionRoutes);
app.use('/api/pistol/shots', shotRoutes);

// Start the server - db test 3
const PORT = process.env.PORT || 5000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});
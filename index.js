import express from 'express';
import dotenv from 'dotenv';
import connectDB from './util/db.js';
import sessionRoutes from './route/sessionRoutes.js';
import shotRoutes from './route/shotRoutes.js';

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(express.json()); // Parse incoming JSON requests

// Routes
app.use('/pistol/sessions', sessionRoutes);
app.use('/pistol/shots', shotRoutes);

// Start the server - db test 2
const PORT = process.env.PORT || 5000;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
});

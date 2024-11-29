import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './db.js';
import sessionRoutes from './routes/sessionRoutes.js';
import shotRoutes from './routes/shotRoutes.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3030;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
connectDB();

// Routes
app.use('/api/sessions', sessionRoutes);
app.use('/api/shots', shotRoutes);

// Default route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the 10m Pistol API' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import winston from 'winston';

dotenv.config();

// Set the strictQuery setting to true to prepare for Mongoose 7
mongoose.set('strictQuery', true);

// Set up Winston logger for better error logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

const connectDB = async () => {
  try {
    // Updated connection string to use 127.0.0.1 instead of localhost
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/10m_pistol';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      family: 4, // Force using IPv4, not IPv6
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    });
    console.log('MongoDB Connected...');
    logger.info('MongoDB Connected...');
  } catch (err) {
    console.error(`MongoDB Connection Error: ${err.message}`);
    logger.error(`MongoDB Connection Error: ${err.message}`);
    process.exit(1);
  }
};

// Add event listeners for better logging of MongoDB events
mongoose.connection.on('connected', () => {
  console.log('Mongoose connected to DB');
  logger.info('Mongoose connected to DB');
});

mongoose.connection.on('error', (err) => {
  console.error(`Mongoose connection error: ${err}`);
  logger.error(`Mongoose connection error: ${err}`);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected from DB');
  logger.warn('Mongoose disconnected from DB');
});

// Handle termination signals properly
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('Mongoose disconnected due to app termination');
  logger.info('Mongoose disconnected due to app termination');
  process.exit(0);
});

export default connectDB;

const mongoose = require('mongoose');
require('dotenv').config();

// Set the strictQuery setting to true to prepare for Mongoose 7
mongoose.set('strictQuery', true);

const connectDB = async () => {
  try {
    // Updated connection string to use 127.0.0.1 instead of localhost
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/your-database-name';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('MongoDB Connected...');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

module.exports = connectDB;

import express from "express";
import dotenv from "dotenv";
import connectDB from "./util/db.js";
import sessionRoutes from "./route/sessionRoutes.js";
import shotRoutes from "./route/shotRoutes.js";
import userRoutes from "./route/userRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import net from "net"; // Import net instead of using require
import morgan from "morgan"; // Import morgan for HTTP request logging
import winston from "winston"; // Import winston for detailed logging
import fs from "fs"; // Import fs to create log directory if it doesn't exist

dotenv.config();

// Define __dirname for ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Connect to MongoDB
connectDB();

const app = express();

// Ensure logs directory exists
const logDir = path.join(__dirname, "logs");
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Set up Winston logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'combined.log') }),
  ],
});

// Middleware
app.use(express.json()); // Parse incoming JSON requests

// Set up Morgan to use Winston for HTTP logging
morgan.token('message', (req, res) => res.locals.errorMessage || '');
const httpLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }
);
app.use(httpLogger);

// Serve favicon.ico
app.use(
  "/favicon.ico",
  express.static(path.join(__dirname, "public", "favicon.ico")),
);

// Routes
app.use("/pistol/users", userRoutes); // New route for user management
app.use("/pistol/sessions", sessionRoutes);
app.use("/pistol/shots", shotRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`${err.message}`);
  res.status(500).json({ error: "An unexpected error occurred." });
});

// Start the server with dynamic port assignment
const getAvailablePort = (startPort) => {
  let port = startPort;

  const checkPort = (resolve, reject) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        port++;
        checkPort(resolve, reject);
      } else {
        reject(err);
      }
    });
    server.once("listening", () => {
      server.close(() => resolve(port));
    });
    server.listen(port, "127.0.0.1");
  };

  return new Promise((resolve, reject) => {
    checkPort(resolve, reject);
  });
};

getAvailablePort(parseInt(process.env.PORT) || 3030).then((availablePort) => {
  app.listen(availablePort, "127.0.0.1", () => {
    console.log(`Server running on http://127.0.0.1:${availablePort}`);
    logger.info(`Server started on port ${availablePort}`);
  });
}).catch((err) => {
  logger.error("Failed to find available port:", err);
  console.error("Failed to find available port:", err);
  process.exit(1);
});
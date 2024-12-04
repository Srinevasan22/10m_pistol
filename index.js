import express from "express";
import dotenv from "dotenv";
import connectDB from "./util/db.js";
import sessionRoutes from "./route/sessionRoutes.js";
import userRoutes from "./route/userRoutes.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import net from "net"; // Import net instead of using require
import morgan from "morgan"; // Import morgan for HTTP request logging
import winston from "winston"; // Import winston for detailed logging
import fs from "fs"; // Import fs to create log directory if it doesn't exist
import helmet from "helmet"; // Import helmet for security enhancements
import cors from "cors"; // Import cors to allow cross-origin requests

dotenv.config();

// Define __dirname for ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Environment variable checks
if (!process.env.MONGO_URI) {
  console.error("ERROR: MONGO_URI not set in environment.");
  process.exit(1);
}

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
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
    }),
    new winston.transports.File({ filename: path.join(logDir, "combined.log") }),
    new winston.transports.Console(), // Log to console as well for visibility
  ],
});

// Handle uncaught exceptions and rejections
process.on("uncaughtException", (error) => {
  logger.error(`Uncaught Exception: ${error.message}`);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});

// Middleware
app.use(express.json()); // Parse incoming JSON requests
app.use(helmet()); // Use Helmet to enhance security
app.use(cors({
  origin: process.env.CORS_ORIGIN || "*", // Set allowed domains from environment variable, fallback to all
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
})); // Enable CORS for all routes

// Set up Morgan to use Winston for HTTP logging (log only errors)
morgan.token("message", (req, res) => res.locals.errorMessage || "");
const httpLogger = morgan(
  ":method :url :status :res[content-length] - :response-time ms",
  {
    skip: (req, res) => res.statusCode < 400, // Log only errors (status codes >= 400)
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  }
);
app.use(httpLogger);

// Serve favicon.ico
app.use(
  "/favicon.ico",
  express.static(path.join(__dirname, "public", "favicon.ico"))
);

// Health Check Endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

// Routes
app.use("/pistol/users", userRoutes); // Base route for users

// Nested session and shot routes to include userId
app.use("/pistol/users/:userId/sessions", sessionRoutes);

// Handle 404 errors (not found routes)
app.use((req, res, next) => {
  res.status(404).json({ error: "Route not found" });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`${err.message}`);
  res.status(500).json({ error: "An unexpected error occurred." });
});

// Log all registered routes for debugging
app._router.stack.forEach(function (middleware) {
  if (middleware.route) { // Routes registered directly on the app
    console.log(middleware.route);
  } else if (middleware.name === 'router') { // Router middleware
    middleware.handle.stack.forEach(function (handler) {
      if (handler.route) {
        console.log(handler.route);
      }
    });
  }
});

// Start the server with dynamic port assignment
const getAvailablePort = (startPort) => {
  let port = startPort;

  const checkPort = (resolve, reject) => {
    const server = net.createServer();
    server.once("error", (err) => {
      if (err.code === "EADDRINUSE") {
        port++; // Try the next port if the current one is in use
        checkPort(resolve, reject);
      } else {
        reject(err); // Reject if there is another error
      }
    });
    server.once("listening", () => {
      server.close(() => resolve(port)); // Resolve when a port is found
    });
    server.listen(port, "127.0.0.1");
  };

  return new Promise((resolve, reject) => {
    checkPort(resolve, reject);
  });
};

// Start the server on an available port, starting from 3030
getAvailablePort(3030)
  .then((port) => {
    const server = app.listen(port, () => {
      logger.info(`Server started on port ${port}`);
    });

    // Graceful shutdown
    process.on("SIGINT", () => {
      server.close(() => {
        logger.info("Server closed due to app termination");
        process.exit(0);
      });
    });
  })
  .catch((err) => {
    logger.error(`Error finding available port: ${err.message}`);
  });

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

dotenv.config();

// Define __dirname for ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(express.json()); // Parse incoming JSON requests

// Serve favicon.ico
app.use(
  "/favicon.ico",
  express.static(path.join(__dirname, "public", "favicon.ico")),
);

// Routes
app.use("/pistol/users", userRoutes); // New route for user management
app.use("/pistol/sessions", sessionRoutes);
app.use("/pistol/shots", shotRoutes);

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

getAvailablePort(parseInt(process.env.PORT) || 5000).then((availablePort) => {
  app.listen(availablePort, "127.0.0.1", () => {
    console.log(`Server running on http://127.0.0.1:${availablePort}`);
  });
}).catch((err) => {
  console.error("Failed to find available port:", err);
  process.exit(1);
});

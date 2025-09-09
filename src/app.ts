import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";

import { sequelize } from "./config/database";
import { redisClient } from "./config/redis";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/errorHandler";
import logger from "./utils/logger";
import { FRONTEND_URL, NODE_ENV, PORT } from "./config";
import { apiLimiter } from "./middleware/rateLimit";
import { bootstrapSuperAdmin } from './bootstrapSuper';

// Load environment variables
dotenv.config();

const app = express();
app.set("trust proxy", 1); //needed for redis rate limiting
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ["GET", "POST"],
  },
});

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

// Basic middleware
app.use(compression());
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// API routes
app.use("/api/v1", apiLimiter, routes);

// Socket.IO for real-time features
io.on("connection", (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on("join-user-room", (userId) => {
    socket.join(`user-${userId}`);
    logger.info(`User ${userId} joined their room`);
  });

  socket.on("disconnect", () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Store io instance globally for use in other modules
app.set("io", io);

// Error handling
app.use(notFound);
app.use(errorHandler);

const SERVER_PORT = PORT || 3000;

// Database connection and server start
const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info("Database connection established successfully");
    // Sync database (be careful with force: true in production)
    await sequelize.sync({ force: false });
    logger.info("Database synchronized successfully");
    await bootstrapSuperAdmin();
    // Test Redis connection
    await redisClient.ping();
    logger.info("Redis connection established successfully");

    // Start server
    server.listen(SERVER_PORT, () => {
      logger.info(
        `Server running on http://localhost:${SERVER_PORT} in ${NODE_ENV} mode`
      );
    });
  } catch (error) {
    logger.error("Unable to start server:", error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await sequelize.close();
  await redisClient.quit();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await sequelize.close();
  await redisClient.quit();
  process.exit(0);
});

startServer();

export default app;

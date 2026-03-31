const express = require("express");
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const multer = require("multer");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const pool = require("./config/db");
const { getAllowedOrigins, getUploadsRoot, isProduction, validateEnv } = require("./config/env");
const { initSocketServer } = require("./socket");
const { ensureAuthTables } = require("./services/authSchemaService");

validateEnv();

const app = express();
const server = http.createServer(app);
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/auth"),
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
});

app.set("trust proxy", 1);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(
  cors({
    origin: (origin, callback) => {
      const allowedOrigins = getAllowedOrigins();

      if (!origin) {
        return callback(null, true);
      }

      if (!allowedOrigins.length && !isProduction) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use("/api", apiLimiter);
app.use("/api/auth", authLimiter);
app.use("/uploads", express.static(getUploadsRoot()));
app.use("/", require("./routes/complianceRoutes"));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/courts", require("./routes/courtRoutes"));
app.use("/api/events", require("./routes/eventRoutes"));
app.use("/api/event-bookings", require("./routes/eventBookingRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/slides", require("./routes/slideRoutes"));
app.use("/api/faqs", require("./routes/faqRoutes"));
app.use("/api/news", require("./routes/newsRoutes"));

app.get("/", (req, res) => {
  res.send("Court Booking API running");
});

app.get("/health", async (_req, res) => {
  try {
    if (startupDbError) {
      return res.status(503).json({
        ok: false,
        service: "court-booking-api",
        environment: process.env.NODE_ENV || "development",
        startup: "database_init_failed",
        error: startupDbError.message,
        timestamp: new Date().toISOString(),
      });
    }

    await pool.query("SELECT 1");
    return res.json({
      ok: true,
      service: "court-booking-api",
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed", error);
    return res.status(503).json({
      ok: false,
      service: "court-booking-api",
      timestamp: new Date().toISOString(),
    });
  }
});

app.use((err, _req, res, next) => {
  if (!err) return next();

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }

  if (err.message === "Origin not allowed by CORS") {
    return res.status(403).json({ message: err.message });
  }

  if (err.message === "Only images allowed") {
    return res.status(400).json({ message: err.message });
  }

  console.error(err);
  return res.status(500).json({ message: "Server error" });
});

const PORT = process.env.PORT || 5000;

initSocketServer(server, Server);

let isShuttingDown = false;
let startupDbError = null;

const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Received ${signal}. Shutting down gracefully...`);

  server.close(async () => {
    try {
      await pool.end();
      process.exit(0);
    } catch (error) {
      console.error("Failed to close database pool cleanly", error);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error("Graceful shutdown timed out");
    process.exit(1);
  }, 10000).unref();
};

const startServer = async () => {
  try {
    await ensureAuthTables();
  } catch (error) {
    startupDbError = error;
    console.error("Database initialization failed during startup", error);
  }

  server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

startServer();

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

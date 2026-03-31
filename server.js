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
  res.type("html").send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Court Booking API</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5efe4;
        --panel: rgba(255, 252, 246, 0.88);
        --text: #16211d;
        --muted: #58655f;
        --line: rgba(22, 33, 29, 0.1);
        --accent: #126a52;
        --accent-soft: #d7efe5;
        --shadow: 0 24px 80px rgba(22, 33, 29, 0.12);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(18, 106, 82, 0.18), transparent 34%),
          radial-gradient(circle at bottom right, rgba(190, 143, 64, 0.18), transparent 28%),
          linear-gradient(135deg, #f8f3e9 0%, #f2eadc 52%, #efe7dc 100%);
        display: grid;
        place-items: center;
        padding: 24px;
      }

      .shell {
        width: min(960px, 100%);
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: var(--shadow);
        overflow: hidden;
        backdrop-filter: blur(14px);
      }

      .hero {
        padding: 36px 36px 22px;
        background:
          linear-gradient(135deg, rgba(18, 106, 82, 0.96), rgba(10, 50, 56, 0.96)),
          linear-gradient(45deg, rgba(255, 255, 255, 0.08), transparent);
        color: #f8fff9;
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        font-size: 13px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .eyebrow::before {
        content: "";
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #71f2bb;
        box-shadow: 0 0 0 6px rgba(113, 242, 187, 0.15);
      }

      h1 {
        margin: 20px 0 10px;
        font-size: clamp(2.3rem, 5vw, 4.2rem);
        line-height: 0.95;
        letter-spacing: -0.04em;
      }

      .subtitle {
        margin: 0;
        max-width: 660px;
        font-size: 1.03rem;
        line-height: 1.7;
        color: rgba(248, 255, 249, 0.82);
      }

      .content {
        display: grid;
        padding: 24px;
      }

      .card {
        padding: 22px;
        border-radius: 22px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
      }

      .card h2 {
        margin: 0 0 14px;
        font-size: 1rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 700;
        font-size: 1.1rem;
      }

      .status::before {
        content: "";
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #1aa66f;
        box-shadow: 0 0 0 7px rgba(26, 166, 111, 0.12);
      }

      .note {
        margin: 18px 0 0;
        line-height: 1.7;
        color: var(--muted);
      }

      .pill {
        display: inline-flex;
        margin-top: 18px;
        padding: 9px 12px;
        border-radius: 999px;
        background: #eef7f2;
        color: var(--accent);
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.04em;
      }

      @media (max-width: 760px) {
        .hero {
          padding: 28px 22px 18px;
        }

        .content {
          padding: 16px;
        }

        .card {
          padding: 18px;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <span class="eyebrow">API Online</span>
        <h1>Court Booking API</h1>
        <p class="subtitle">
          Production backend for court scheduling, event bookings, authentication, and website content management.
        </p>
      </section>

      <section class="content">
        <article class="card">
          <h2>Service Status</h2>
          <div class="status">Backend is running</div>
          <p class="note">
            The production API service is online and ready to handle application requests.
          </p>
          <span class="pill">${process.env.NODE_ENV || "development"} mode</span>
        </article>
      </section>
    </main>
  </body>
</html>`);
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

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
    <title>Court Booking App</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      :root {
        --bg-top: #0d5b4d;
        --bg-bottom: #f6efe2;
        --panel: rgba(255, 255, 255, 0.82);
        --text: #14231f;
        --muted: #5d6a65;
        --line: rgba(20, 35, 31, 0.08);
        --accent: #178062;
        --shadow: 0 28px 90px rgba(17, 33, 29, 0.14);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Poppins", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(255, 255, 255, 0.14), transparent 24%),
          linear-gradient(180deg, var(--bg-top) 0%, #1a6f5d 32%, var(--bg-bottom) 32%, #efe5d5 100%);
        display: grid;
        place-items: center;
        padding: 24px;
      }

      .shell {
        width: min(760px, 100%);
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 32px;
        box-shadow: var(--shadow);
        overflow: hidden;
        backdrop-filter: blur(18px);
      }

      .hero {
        padding: 44px 30px 28px;
        background:
          linear-gradient(135deg, rgba(10, 58, 50, 0.96), rgba(23, 128, 98, 0.92)),
          linear-gradient(45deg, rgba(255, 255, 255, 0.08), transparent);
        color: #f8fff9;
        text-align: center;
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.14);
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .badge::before {
        content: "";
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #7cf0bd;
        box-shadow: 0 0 0 6px rgba(124, 240, 189, 0.14);
      }

      h1 {
        margin: 22px 0 8px;
        font-size: clamp(2.5rem, 6vw, 4.8rem);
        line-height: 0.92;
        letter-spacing: -0.05em;
      }

      .subtitle {
        margin: 0 auto;
        max-width: 520px;
        font-size: 1.05rem;
        line-height: 1.8;
        color: rgba(248, 255, 249, 0.88);
      }

      .content {
        padding: 26px;
      }

      .card {
        padding: 28px;
        border-radius: 24px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.74);
        text-align: center;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-weight: 700;
        font-size: 1.2rem;
      }

      .status::before {
        content: "";
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: #16a36d;
        box-shadow: 0 0 0 7px rgba(22, 163, 109, 0.12);
      }

      .note {
        margin: 16px 0 0;
        line-height: 1.8;
        color: var(--muted);
        font-size: 1rem;
      }

      .mark {
        width: 76px;
        height: 76px;
        margin: 0 auto 18px;
        border-radius: 24px;
        background:
          linear-gradient(135deg, rgba(23, 128, 98, 0.15), rgba(23, 128, 98, 0.28));
        border: 1px solid rgba(23, 128, 98, 0.16);
        display: grid;
        place-items: center;
        font-size: 2rem;
        color: var(--accent);
      }

      @media (max-width: 760px) {
        .hero {
          padding: 34px 22px 22px;
        }

        .content {
          padding: 16px;
        }

        .card {
          padding: 22px;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <span class="badge">System Active</span>
        <h1>Court Booking App</h1>
      </section>

      <section class="content">
        <article class="card">
          <div class="mark">✓</div>
          <div class="status">Court Booking App Working</div>
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

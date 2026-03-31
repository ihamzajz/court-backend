const path = require("path");

const isProduction = process.env.NODE_ENV === "production";

const parseAllowedOrigins = (rawValue) => {
  return String(rawValue || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const requiredEnvKeys = ["DB_HOST", "DB_USER", "DB_NAME", "JWT_SECRET"];

const getAppName = () => String(process.env.APP_NAME || "BookFlow").trim() || "BookFlow";
const getSupportEmail = () => String(process.env.SUPPORT_EMAIL || "").trim();
const getPrivacyContactName = () =>
  String(process.env.PRIVACY_CONTACT_NAME || getAppName()).trim() || getAppName();

const getAllowedOrigins = () => parseAllowedOrigins(process.env.CORS_ORIGIN);

const getUploadsRoot = () => {
  const configuredPath = String(process.env.UPLOADS_DIR || "").trim();
  return configuredPath || path.join(__dirname, "..", "uploads");
};

const validateEnv = () => {
  const missingKeys = requiredEnvKeys.filter((key) => !String(process.env[key] || "").trim());

  if (missingKeys.length) {
    throw new Error(`Missing required environment variables: ${missingKeys.join(", ")}`);
  }

  if (String(process.env.JWT_SECRET).trim().length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters for production-safe signing");
  }

  if (isProduction && getAllowedOrigins().length === 0) {
    throw new Error("CORS_ORIGIN must be set in production");
  }
};

module.exports = {
  getAppName,
  getAllowedOrigins,
  getUploadsRoot,
  getPrivacyContactName,
  getSupportEmail,
  isProduction,
  validateEnv,
};

const fs = require("fs");
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
const getPrivacyWhatsapp = () => String(process.env.PRIVACY_WHATSAPP || "0123-1234567").trim();

const getAllowedOrigins = () => parseAllowedOrigins(process.env.CORS_ORIGIN);

const getDefaultUploadsRoot = () => path.join(__dirname, "..", "uploads");

let warnedUploadsFallback = false;

const getUploadsRoot = () => {
  const configuredPath = String(process.env.UPLOADS_DIR || "").trim();

  if (!configuredPath) {
    return getDefaultUploadsRoot();
  }

  try {
    fs.mkdirSync(configuredPath, { recursive: true });
    return configuredPath;
  } catch (error) {
    if (!warnedUploadsFallback) {
      warnedUploadsFallback = true;
      console.warn(
        `UPLOADS_DIR "${configuredPath}" is not usable. Falling back to local uploads directory.`,
        error.message
      );
    }

    return getDefaultUploadsRoot();
  }
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
  getPrivacyWhatsapp,
  getSupportEmail,
  isProduction,
  validateEnv,
};

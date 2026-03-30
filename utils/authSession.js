const jwt = require("jsonwebtoken");

const pool = require("../config/db");

const ACCESS_TOKEN_EXPIRY = "7d";

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  email: user.email,
  cm_no: user.cm_no,
  role: user.role,
  status: user.status,
  can_book: user.can_book,
  fees_status: user.fees_status,
});

const signAccessToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      role: user.role,
      tokenVersion: Number(user.token_version || 0),
    },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

const createAuthError = (message, statusCode = 401, code = "AUTH_INVALID") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const resolveActiveUserFromToken = async (token) => {
  if (!token) {
    throw createAuthError("Not authorized, no token", 401, "AUTH_MISSING");
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw createAuthError("Token invalid", 401, "AUTH_INVALID");
  }

  const userId = decoded.id || decoded._id;

  const [rows] = await pool.query(
    `SELECT id, name, username, email, cm_no, role, status, can_book, fees_status, token_version
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [userId]
  );

  if (!rows.length) {
    throw createAuthError("User not found", 401, "AUTH_USER_MISSING");
  }

  const user = rows[0];
  const tokenVersion = Number(decoded.tokenVersion || 0);
  const currentTokenVersion = Number(user.token_version || 0);

  if (tokenVersion !== currentTokenVersion) {
    throw createAuthError("Session expired. Please sign in again.", 401, "AUTH_REVOKED");
  }

  if (user.status !== "active") {
    throw createAuthError("Account inactive. Contact admin", 403, "AUTH_INACTIVE");
  }

  return {
    decoded,
    user: sanitizeUser(user),
  };
};

module.exports = {
  resolveActiveUserFromToken,
  sanitizeUser,
  signAccessToken,
};

const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const { disconnectUserSockets, emitRealtime } = require("../socket");
const { sanitizeUser, signAccessToken } = require("../utils/authSession");
const { isDuplicateEntryError } = require("../utils/dbErrors");

exports.registerUser = async (req, res) => {
  const { name, username, email, cm_no, password } = req.body;

  if (!name || !username || !email || !password) {
    return res.status(400).json({ message: "All fields required" });
  }

  if (String(password).length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  try {
    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = username.trim().toLowerCase();

    if (!trimmedName) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!/^[a-z0-9._-]{3,}$/i.test(normalizedUsername)) {
      return res.status(400).json({
        message: "Username must be at least 3 characters and use letters/numbers",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    const [users] = await pool.query(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [normalizedEmail, normalizedUsername]
    );

    if (users.length > 0) {
      return res.status(400).json({
        message: "User with this email or username already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (name, username, email, cm_no, password, role, status, can_book, fees_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trimmedName,
        normalizedUsername,
        normalizedEmail,
        String(cm_no || "").trim() || null,
        hashedPassword,
        "user",
        "inactive",
        "no",
        "paid",
      ]
    );

    emitRealtime("users:updated", { action: "registered" });
    res.status(201).json({
      message: "Registered successfully. Await admin approval.",
    });
  } catch (error) {
    console.error(error);
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ message: "User with this email or username already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

exports.loginUser = async (req, res) => {
  const { identifier, password } = req.body;

  try {
    if (!identifier || !password) {
      return res.status(400).json({ message: "Identifier and password required" });
    }

    const normalizedIdentifier = identifier.trim().toLowerCase();

    const [users] = await pool.query(
      "SELECT * FROM users WHERE email = ? OR username = ?",
      [normalizedIdentifier, normalizedIdentifier]
    );

    if (users.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = users[0];

    if (user.status !== "active") {
      return res.status(403).json({
        message: "Account inactive. Contact admin",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({
      ...sanitizeUser(user),
      token: signAccessToken(user),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  try {
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current password and new password are required" });
    }

    if (String(newPassword).length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const [users] = await pool.query("SELECT * FROM users WHERE id = ?", [req.user.id]);

    if (!users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Current password incorrect",
      });
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    await pool.query(
      "UPDATE users SET password = ?, token_version = token_version + 1 WHERE id = ?",
      [hashed, req.user.id]
    );

    emitRealtime("users:updated", { action: "password-changed", id: req.user.id });
    await disconnectUserSockets(req.user.id);
    res.json({ message: "Password updated successfully. Please sign in again." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteCurrentUser = async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || "");

  try {
    if (!currentPassword) {
      return res.status(400).json({ message: "Current password is required" });
    }

    const [users] = await pool.query("SELECT id, password, role FROM users WHERE id = ?", [req.user.id]);

    if (!users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Current password incorrect" });
    }

    if (user.role === "superadmin") {
      const [superadminRows] = await pool.query(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'superadmin'"
      );

      if (Number(superadminRows[0]?.total || 0) <= 1) {
        return res.status(400).json({ message: "You cannot delete the last superadmin account" });
      }
    }

    await pool.query("DELETE FROM users WHERE id = ?", [req.user.id]);

    emitRealtime("users:updated", { action: "self-deleted", id: req.user.id });
    await disconnectUserSockets(req.user.id);

    return res.json({
      message: "Your account has been deleted successfully.",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getCurrentUser = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, name, username, email, cm_no, role, status, can_book, fees_status
       FROM users
       WHERE id = ?`,
      [req.user.id]
    );

    if (!users.length) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(sanitizeUser(users[0]));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

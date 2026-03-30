const pool = require("../config/db");
const bcrypt = require("bcryptjs");
const { disconnectUserSockets, emitRealtime } = require("../socket");
const { isDuplicateEntryError } = require("../utils/dbErrors");

const USER_ROLES = ["user", "admin", "superadmin"];
const USER_STATUSES = ["active", "inactive"];
const USER_CAN_BOOK = ["yes", "no"];
const USER_FEES_STATUSES = ["paid", "defaulter"];

const normalizeEnumValue = (value, allowedValues, fallback) => {
  const normalized = String(value || "").trim().toLowerCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
};

const isAdminRole = (role) => role === "admin" || role === "superadmin";
const isSuperadminRole = (role) => role === "superadmin";

const ensureAdminCanManageRole = ({ actorRole, targetRole, nextRole }) => {
  if (isSuperadminRole(actorRole)) {
    return null;
  }

  if (isAdminRole(targetRole) || isAdminRole(nextRole)) {
    return "Only superadmin can manage admin or superadmin accounts";
  }

  return null;
};

const countSuperadmins = async () => {
  const [rows] = await pool.query(
    "SELECT COUNT(*) AS total FROM users WHERE role = 'superadmin'"
  );

  return Number(rows[0]?.total || 0);
};

exports.getBookingPlayers = async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, name, cm_no, fees_status
       FROM users
       WHERE status = 'active'
       ORDER BY name ASC`
    );

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

exports.getUsers = async (_req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, name, username, email, cm_no, role, status, can_book, fees_status, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
};

exports.createUser = async (req, res) => {
  const { name, username, email, cm_no, password, role, status, can_book, fees_status } = req.body;

  if (!name || !username || !email || !password) {
    return res.status(400).json({ message: "Name, username, email, and password are required" });
  }

  try {
    const normalizedName = String(name).trim();
    const normalizedUsername = String(username).trim().toLowerCase();
    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedRole = normalizeEnumValue(role, USER_ROLES, "user");
    const normalizedStatus = normalizeEnumValue(status, USER_STATUSES, "inactive");
    const normalizedCanBook = normalizeEnumValue(can_book, USER_CAN_BOOK, "no");
    const normalizedFeesStatus = normalizeEnumValue(fees_status, USER_FEES_STATUSES, "paid");

    if (!normalizedName) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!/^[a-z0-9._-]{3,}$/i.test(normalizedUsername)) {
      return res.status(400).json({ message: "Username must be at least 3 characters and use letters/numbers" });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ message: "Valid email is required" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const roleError = ensureAdminCanManageRole({
      actorRole: req.user.role,
      targetRole: "user",
      nextRole: normalizedRole,
    });

    if (roleError) {
      return res.status(403).json({ message: roleError });
    }

    const [existing] = await pool.query(
      "SELECT id FROM users WHERE email = ? OR username = ?",
      [normalizedEmail, normalizedUsername]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "User with this email or username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const normalizedCmNo = String(cm_no || "").trim() || null;

    const [result] = await pool.query(
      `INSERT INTO users (name, username, email, cm_no, password, role, status, can_book, fees_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normalizedName,
        normalizedUsername,
        normalizedEmail,
        normalizedCmNo,
        hashedPassword,
        normalizedRole,
        normalizedStatus,
        normalizedCanBook,
        normalizedFeesStatus,
      ]
    );

    const [created] = await pool.query(
      `SELECT id, name, username, email, cm_no, role, status, can_book, fees_status, created_at, updated_at
       FROM users
       WHERE id = ?`,
      [result.insertId]
    );

    emitRealtime("users:updated", { action: "created", id: result.insertId });
    res.status(201).json(created[0]);
  } catch (error) {
    console.error(error);
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ message: "User with this email or username already exists" });
    }
    res.status(500).json({ message: "Failed to create user" });
  }
};

exports.updateUser = async (req, res) => {
  const { id } = req.params;
  const { name, username, email, cm_no, password, role, status, can_book, fees_status } = req.body;

  try {
    const [users] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const currentUser = users[0];
    const normalizedUsername = String(username || currentUser.username).trim().toLowerCase();
    const normalizedEmail = String(email || currentUser.email).trim().toLowerCase();
    const normalizedCmNo = cm_no === undefined ? currentUser.cm_no : String(cm_no || "").trim() || null;
    const normalizedRole = role === undefined
      ? currentUser.role
      : normalizeEnumValue(role, USER_ROLES, currentUser.role);
    const normalizedStatus = status === undefined
      ? currentUser.status
      : normalizeEnumValue(status, USER_STATUSES, currentUser.status);
    const normalizedCanBook = can_book === undefined
      ? currentUser.can_book
      : normalizeEnumValue(can_book, USER_CAN_BOOK, currentUser.can_book);
    const normalizedFeesStatus = fees_status === undefined
      ? currentUser.fees_status
      : normalizeEnumValue(fees_status, USER_FEES_STATUSES, currentUser.fees_status);

    const [duplicate] = await pool.query(
      "SELECT id FROM users WHERE (email = ? OR username = ?) AND id != ?",
      [normalizedEmail, normalizedUsername, id]
    );

    if (duplicate.length > 0) {
      return res.status(400).json({ message: "User with this email or username already exists" });
    }

    const roleError = ensureAdminCanManageRole({
      actorRole: req.user.role,
      targetRole: currentUser.role,
      nextRole: normalizedRole,
    });

    if (roleError) {
      return res.status(403).json({ message: roleError });
    }

    if (Number(id) === Number(req.user.id)) {
      if (normalizedRole !== currentUser.role) {
        return res.status(400).json({ message: "You cannot change your own role" });
      }

      if (normalizedStatus !== currentUser.status) {
        return res.status(400).json({ message: "You cannot change your own status" });
      }
    }

    if (
      currentUser.role === "superadmin" &&
      (normalizedRole !== "superadmin" || normalizedStatus !== "active")
    ) {
      const superadminCount = await countSuperadmins();

      if (superadminCount <= 1) {
        return res.status(400).json({ message: "At least one active superadmin must remain" });
      }
    }

    let nextPassword = currentUser.password;
    if (password && String(password).trim()) {
      if (String(password).trim().length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      nextPassword = await bcrypt.hash(String(password).trim(), 10);
    }

    await pool.query(
      `UPDATE users
       SET name = ?, username = ?, email = ?, cm_no = ?, password = ?, role = ?, status = ?, can_book = ?, fees_status = ?,
           token_version = CASE WHEN ? THEN token_version + 1 ELSE token_version END
       WHERE id = ?`,
      [
        String(name || currentUser.name).trim(),
        normalizedUsername,
        normalizedEmail,
        normalizedCmNo,
        nextPassword,
        normalizedRole,
        normalizedStatus,
        normalizedCanBook,
        normalizedFeesStatus,
        Boolean(password && String(password).trim()),
        id,
      ]
    );

    const [updated] = await pool.query(
      `SELECT id, name, username, email, cm_no, role, status, can_book, fees_status, created_at, updated_at
       FROM users
       WHERE id = ?`,
      [id]
    );

    emitRealtime("users:updated", { action: "updated", id: Number(id) });
    if (
      Boolean(password && String(password).trim()) ||
      normalizedStatus !== "active"
    ) {
      await disconnectUserSockets(id);
    }
    res.json(updated[0]);
  } catch (error) {
    console.error(error);
    if (isDuplicateEntryError(error)) {
      return res.status(409).json({ message: "User with this email or username already exists" });
    }
    res.status(500).json({ message: "Failed to update user" });
  }
};

exports.deleteUser = async (req, res) => {
  const { id } = req.params;

  try {
    const [users] = await pool.query("SELECT id, role FROM users WHERE id = ?", [id]);

    if (users.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    if (Number(id) === Number(req.user.id)) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const targetUser = users[0];
    const roleError = ensureAdminCanManageRole({
      actorRole: req.user.role,
      targetRole: targetUser.role,
      nextRole: targetUser.role,
    });

    if (roleError) {
      return res.status(403).json({ message: roleError });
    }

    if (targetUser.role === "superadmin") {
      const superadminCount = await countSuperadmins();

      if (superadminCount <= 1) {
        return res.status(400).json({ message: "You cannot delete the last superadmin" });
      }
    }

    await pool.query("DELETE FROM users WHERE id = ?", [id]);
    emitRealtime("users:updated", { action: "deleted", id: Number(id) });
    await disconnectUserSockets(id);
    res.json({ message: "User deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete user" });
  }
};

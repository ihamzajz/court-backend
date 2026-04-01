const pool = require("../config/db");
const fs = require("fs");
const path = require("path");
const { getUploadSubdirPath } = require("../config/uploads");
const { emitRealtime } = require("../socket");
const { isDuplicateEntryError } = require("../utils/dbErrors");

// ===============================
// CREATE COURT
// ===============================
exports.createCourt = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Court name required" });
    }

    // check if exists
    const [existing] = await pool.query(
      "SELECT id FROM courts WHERE name = ?",
      [name]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "Court already exists" });
    }

    const picture = req.file ? req.file.filename : null;

    const [result] = await pool.query(
      "INSERT INTO courts (name, picture) VALUES (?, ?)",
      [name, picture]
    );

    const [court] = await pool.query(
      "SELECT * FROM courts WHERE id = ?",
      [result.insertId]
    );

    emitRealtime("courts:updated", { action: "created", id: result.insertId });
    res.status(201).json(court[0]);

  } catch (err) {
    console.error(err);
    if (isDuplicateEntryError(err)) {
      return res.status(409).json({ message: "Court already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

// ===============================
// GET ALL COURTS
// ===============================
exports.getCourts = async (req, res) => {
  try {

    const [courts] = await pool.query(
      "SELECT * FROM courts ORDER BY created_at DESC"
    );

    res.json(courts);

  } catch (err) {
    console.error(err);
    if (isDuplicateEntryError(err)) {
      return res.status(409).json({ message: "Court already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

// ===============================
// GET COURT BY ID
// ===============================
exports.getCourtById = async (req, res) => {
  try {

    const [court] = await pool.query(
      "SELECT * FROM courts WHERE id = ?",
      [req.params.id]
    );

    if (court.length === 0) {
      return res.status(404).json({ message: "Court not found" });
    }

    res.json(court[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ===============================
// UPDATE COURT
// ===============================
exports.updateCourt = async (req, res) => {
  try {

    const { name } = req.body;

    const [courts] = await pool.query(
      "SELECT * FROM courts WHERE id = ?",
      [req.params.id]
    );

    if (courts.length === 0) {
      return res.status(404).json({ message: "Court not found" });
    }

    const court = courts[0];

    // delete old picture if new uploaded
    if (req.file && court.picture) {

      const oldPath = path.join(
        getUploadSubdirPath("courts"),
        court.picture
      );

      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const newName = name || court.name;
    const newPicture = req.file ? req.file.filename : court.picture;

    await pool.query(
      "UPDATE courts SET name = ?, picture = ? WHERE id = ?",
      [newName, newPicture, req.params.id]
    );

    const [updated] = await pool.query(
      "SELECT * FROM courts WHERE id = ?",
      [req.params.id]
    );

    emitRealtime("courts:updated", { action: "updated", id: Number(req.params.id) });
    res.json(updated[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// ===============================
// DELETE COURT
// ===============================
exports.deleteCourt = async (req, res) => {
  try {

    const [courts] = await pool.query(
      "SELECT * FROM courts WHERE id = ?",
      [req.params.id]
    );

    if (courts.length === 0) {
      return res.status(404).json({ message: "Court not found" });
    }

    const court = courts[0];

    const [bookingRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM bookings WHERE court_id = ?",
      [req.params.id]
    );

    if (Number(bookingRows[0]?.total || 0) > 0) {
      return res.status(400).json({
        message: "Court cannot be deleted because it is used in existing bookings",
      });
    }

    // delete picture file
    if (court.picture) {

      const filePath = path.join(
        getUploadSubdirPath("courts"),
        court.picture
      );

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await pool.query(
      "DELETE FROM courts WHERE id = ?",
      [req.params.id]
    );

    emitRealtime("courts:updated", { action: "deleted", id: Number(req.params.id) });
    res.json({ message: "Court deleted" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

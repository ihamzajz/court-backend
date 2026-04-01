const pool = require("../config/db");
const fs = require("fs");
const path = require("path");
const { getUploadSubdirPath } = require("../config/uploads");
const { emitRealtime } = require("../socket");
const { isDuplicateEntryError } = require("../utils/dbErrors");

exports.createEvent = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Venue name required" });
    }

    const normalizedName = name.trim();

    const [existing] = await pool.query(
      "SELECT id FROM events WHERE name = ?",
      [normalizedName]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: "Venue already exists" });
    }

    const picture = req.file ? req.file.filename : null;

    const [result] = await pool.query(
      "INSERT INTO events (name, picture) VALUES (?, ?)",
      [normalizedName, picture]
    );

    const [event] = await pool.query(
      "SELECT * FROM events WHERE id = ?",
      [result.insertId]
    );

    emitRealtime("events:updated", { action: "created", id: result.insertId });
    res.status(201).json(event[0]);
  } catch (err) {
    console.error(err);
    if (isDuplicateEntryError(err)) {
      return res.status(409).json({ message: "Venue already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

exports.getEvents = async (_req, res) => {
  try {
    const [events] = await pool.query(
      "SELECT * FROM events ORDER BY created_at DESC"
    );

    res.json(events);
  } catch (err) {
    console.error(err);
    if (isDuplicateEntryError(err)) {
      return res.status(409).json({ message: "Venue already exists" });
    }
    res.status(500).json({ message: "Server error" });
  }
};

exports.getEventById = async (req, res) => {
  try {
    const [event] = await pool.query(
      "SELECT * FROM events WHERE id = ?",
      [req.params.id]
    );

    if (event.length === 0) {
      return res.status(404).json({ message: "Venue not found" });
    }

    res.json(event[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateEvent = async (req, res) => {
  try {
    const { name } = req.body;

    const [events] = await pool.query(
      "SELECT * FROM events WHERE id = ?",
      [req.params.id]
    );

    if (events.length === 0) {
      return res.status(404).json({ message: "Venue not found" });
    }

    const event = events[0];

    if (req.file && event.picture) {
      const oldPath = path.join(
        getUploadSubdirPath("events"),
        event.picture
      );

      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    const nextName = name?.trim() || event.name;
    const nextPicture = req.file ? req.file.filename : event.picture;

    const [duplicate] = await pool.query(
      "SELECT id FROM events WHERE name = ? AND id != ?",
      [nextName, req.params.id]
    );

    if (duplicate.length > 0) {
      return res.status(400).json({ message: "Venue already exists" });
    }

    await pool.query(
      "UPDATE events SET name = ?, picture = ? WHERE id = ?",
      [nextName, nextPicture, req.params.id]
    );

    const [updated] = await pool.query(
      "SELECT * FROM events WHERE id = ?",
      [req.params.id]
    );

    emitRealtime("events:updated", { action: "updated", id: Number(req.params.id) });
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteEvent = async (req, res) => {
  try {
    const [events] = await pool.query(
      "SELECT * FROM events WHERE id = ?",
      [req.params.id]
    );

    if (events.length === 0) {
      return res.status(404).json({ message: "Venue not found" });
    }

    const event = events[0];

    const [bookingRows] = await pool.query(
      "SELECT COUNT(*) AS total FROM event_bookings WHERE event_id = ?",
      [req.params.id]
    );

    if (Number(bookingRows[0]?.total || 0) > 0) {
      return res.status(400).json({
        message: "Venue cannot be deleted because it is used in existing bookings",
      });
    }

    if (event.picture) {
      const filePath = path.join(
        getUploadSubdirPath("events"),
        event.picture
      );

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await pool.query("DELETE FROM events WHERE id = ?", [req.params.id]);

    emitRealtime("events:updated", { action: "deleted", id: Number(req.params.id) });
    res.json({ message: "Venue deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

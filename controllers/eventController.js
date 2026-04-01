const pool = require("../config/db");
const { getUploadSubdirPath } = require("../config/uploads");
const { emitRealtime } = require("../socket");
const { isDuplicateEntryError } = require("../utils/dbErrors");
const { deleteFileIfExists } = require("../utils/uploadFiles");

exports.createEvent = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      if (req.file) {
        deleteFileIfExists(getUploadSubdirPath("events"), req.file.filename);
      }
      return res.status(400).json({ message: "Venue name required" });
    }

    const normalizedName = name.trim();

    const [existing] = await pool.query(
      "SELECT id FROM events WHERE name = ?",
      [normalizedName]
    );

    if (existing.length > 0) {
      if (req.file) {
        deleteFileIfExists(getUploadSubdirPath("events"), req.file.filename);
      }
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
    if (req.file) {
      deleteFileIfExists(getUploadSubdirPath("events"), req.file.filename);
    }
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
      if (req.file) {
        deleteFileIfExists(getUploadSubdirPath("events"), req.file.filename);
      }
      return res.status(404).json({ message: "Venue not found" });
    }

    const event = events[0];

    const previousPicture = event.picture;

    const nextName = name?.trim() || event.name;
    const nextPicture = req.file ? req.file.filename : event.picture;

    const [duplicate] = await pool.query(
      "SELECT id FROM events WHERE name = ? AND id != ?",
      [nextName, req.params.id]
    );

    if (duplicate.length > 0) {
      if (req.file) {
        deleteFileIfExists(getUploadSubdirPath("events"), req.file.filename);
      }
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

    if (req.file && previousPicture) {
      deleteFileIfExists(getUploadSubdirPath("events"), previousPicture);
    }

    emitRealtime("events:updated", { action: "updated", id: Number(req.params.id) });
    res.json(updated[0]);
  } catch (err) {
    if (req.file) {
      deleteFileIfExists(getUploadSubdirPath("events"), req.file.filename);
    }
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

    if (event.picture) {
      deleteFileIfExists(getUploadSubdirPath("events"), event.picture);
    }

    await pool.query("DELETE FROM events WHERE id = ?", [req.params.id]);

    emitRealtime("events:updated", { action: "deleted", id: Number(req.params.id) });
    res.json({ message: "Venue deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

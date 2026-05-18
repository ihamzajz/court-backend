const pool = require("../config/db");
const { emitRealtime } = require("../socket");

const BOOKING_FOR_VALUES = ["court", "event"];
const STATUS_VALUES = ["active", "inactive"];

const normalizeText = (value) => String(value || "").trim();

const parseNullableInt = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const validateBookingCategoryPayload = (body) => {
  const typeOfBooking = normalizeText(body.type_of_booking);
  const bookingFor = normalizeText(body.booking_for).toLowerCase();
  const minPlayers = parseNullableInt(body.min_players);
  const maxPlayers = parseNullableInt(body.max_players);
  const minTime = parseNullableInt(body.min_time);
  const maxTime = parseNullableInt(body.max_time);
  const minAge = parseNullableInt(body.min_age, 0);
  const noOfGuest = parseNullableInt(body.no_of_guest, 0);
  const status = normalizeText(body.status || "active").toLowerCase();

  if (!typeOfBooking) {
    return { error: "type_of_booking is required" };
  }

  if (!BOOKING_FOR_VALUES.includes(bookingFor)) {
    return { error: "booking_for must be court or event" };
  }

  if (!STATUS_VALUES.includes(status)) {
    return { error: "status must be active or inactive" };
  }

  const numericFields = [
    ["min_players", minPlayers],
    ["max_players", maxPlayers],
    ["min_time", minTime],
    ["max_time", maxTime],
    ["min_age", minAge],
    ["no_of_guest", noOfGuest],
  ];

  for (const [field, value] of numericFields) {
    if (value === null || value < 0) {
      return { error: `${field} must be a valid non-negative integer` };
    }
  }

  if (maxPlayers < minPlayers) {
    return { error: "max_players must be greater than or equal to min_players" };
  }

  if (maxTime < minTime) {
    return { error: "max_time must be greater than or equal to min_time" };
  }

  return {
    value: {
      typeOfBooking,
      bookingFor,
      minPlayers,
      maxPlayers,
      minTime,
      maxTime,
      minAge,
      noOfGuest,
      status,
    },
  };
};

exports.createBookingCategory = async (req, res) => {
  try {
    const validation = validateBookingCategoryPayload(req.body);

    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const {
      typeOfBooking,
      bookingFor,
      minPlayers,
      maxPlayers,
      minTime,
      maxTime,
      minAge,
      noOfGuest,
      status,
    } = validation.value;

    const [existing] = await pool.query(
      `SELECT id
       FROM booking_category
       WHERE LOWER(type_of_booking) = LOWER(?)
         AND booking_for = ?
       LIMIT 1`,
      [typeOfBooking, bookingFor]
    );

    if (existing.length > 0) {
      return res.status(409).json({ message: "Booking category already exists" });
    }

    const [result] = await pool.query(
      `INSERT INTO booking_category
        (type_of_booking, booking_for, min_players, max_players, min_time, max_time, min_age, no_of_guest, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [typeOfBooking, bookingFor, minPlayers, maxPlayers, minTime, maxTime, minAge, noOfGuest, status]
    );

    const [rows] = await pool.query(
      "SELECT * FROM booking_category WHERE id = ?",
      [result.insertId]
    );

    emitRealtime("booking-categories:updated", { action: "created", id: result.insertId });
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getBookingCategories = async (req, res) => {
  try {
    const bookingFor = normalizeText(req.query.booking_for).toLowerCase();
    const status = normalizeText(req.query.status).toLowerCase();
    const search = normalizeText(req.query.search).toLowerCase();

    let query = "SELECT * FROM booking_category WHERE 1=1";
    const params = [];

    if (bookingFor) {
      if (!BOOKING_FOR_VALUES.includes(bookingFor)) {
        return res.status(400).json({ message: "booking_for must be court or event" });
      }

      query += " AND booking_for = ?";
      params.push(bookingFor);
    }

    if (status) {
      if (!STATUS_VALUES.includes(status)) {
        return res.status(400).json({ message: "status must be active or inactive" });
      }

      query += " AND status = ?";
      params.push(status);
    }

    if (search) {
      query += " AND LOWER(type_of_booking) LIKE ?";
      params.push(`%${search}%`);
    }

    query += " ORDER BY created_at DESC";

    const [rows] = await pool.query(query, params);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.getBookingCategoryById = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM booking_category WHERE id = ?",
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Booking category not found" });
    }

    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.updateBookingCategory = async (req, res) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM booking_category WHERE id = ?",
      [req.params.id]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: "Booking category not found" });
    }

    const existing = existingRows[0];

    const validation = validateBookingCategoryPayload({
      type_of_booking: req.body.type_of_booking ?? existing.type_of_booking,
      booking_for: req.body.booking_for ?? existing.booking_for,
      min_players: req.body.min_players ?? existing.min_players,
      max_players: req.body.max_players ?? existing.max_players,
      min_time: req.body.min_time ?? existing.min_time,
      max_time: req.body.max_time ?? existing.max_time,
      min_age: req.body.min_age ?? existing.min_age,
      no_of_guest: req.body.no_of_guest ?? existing.no_of_guest,
      status: req.body.status ?? existing.status,
    });

    if (validation.error) {
      return res.status(400).json({ message: validation.error });
    }

    const {
      typeOfBooking,
      bookingFor,
      minPlayers,
      maxPlayers,
      minTime,
      maxTime,
      minAge,
      noOfGuest,
      status,
    } = validation.value;

    const [duplicate] = await pool.query(
      `SELECT id
       FROM booking_category
       WHERE LOWER(type_of_booking) = LOWER(?)
         AND booking_for = ?
         AND id != ?
       LIMIT 1`,
      [typeOfBooking, bookingFor, req.params.id]
    );

    if (duplicate.length > 0) {
      return res.status(409).json({ message: "Booking category already exists" });
    }

    await pool.query(
      `UPDATE booking_category
       SET type_of_booking = ?,
           booking_for = ?,
           min_players = ?,
           max_players = ?,
           min_time = ?,
           max_time = ?,
           min_age = ?,
           no_of_guest = ?,
           status = ?
       WHERE id = ?`,
      [
        typeOfBooking,
        bookingFor,
        minPlayers,
        maxPlayers,
        minTime,
        maxTime,
        minAge,
        noOfGuest,
        status,
        req.params.id,
      ]
    );

    const [rows] = await pool.query(
      "SELECT * FROM booking_category WHERE id = ?",
      [req.params.id]
    );

    emitRealtime("booking-categories:updated", {
      action: "updated",
      id: Number(req.params.id),
    });
    return res.json(rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

exports.deleteBookingCategory = async (req, res) => {
  try {
    const [existingRows] = await pool.query(
      "SELECT * FROM booking_category WHERE id = ?",
      [req.params.id]
    );

    if (!existingRows.length) {
      return res.status(404).json({ message: "Booking category not found" });
    }

    await pool.query("DELETE FROM booking_category WHERE id = ?", [req.params.id]);

    emitRealtime("booking-categories:updated", {
      action: "deleted",
      id: Number(req.params.id),
    });
    return res.json({ message: "Booking category deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

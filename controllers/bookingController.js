const pool = require("../config/db");
const { emitRealtime } = require("../socket");
const { withNamedLock } = require("../utils/locking");
const {
  MAX_DAILY_ACTIVE_BOOKINGS,
  countUserActiveBookingsForDate,
} = require("../utils/bookingLimits");

const BOOKING_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
const PAYMENT_STATUSES = ["UNPAID", "PAID"];

const resolveUserAge = (player, bookingDate) => {
  const directAge = Number.parseInt(player?.age, 10);
  if (!Number.isNaN(directAge) && directAge >= 0) {
    return directAge;
  }

  const dob = String(player?.dob || "").trim();
  if (!dob) {
    return null;
  }

  const dobDate = new Date(`${dob}T00:00:00`);
  const bookingRef = new Date(`${bookingDate}T00:00:00`);

  if (Number.isNaN(dobDate.getTime()) || Number.isNaN(bookingRef.getTime())) {
    return null;
  }

  let age = bookingRef.getFullYear() - dobDate.getFullYear();
  const monthDiff = bookingRef.getMonth() - dobDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && bookingRef.getDate() < dobDate.getDate())) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

const getBookingCategory = async (connection, bookingCategoryId, bookingFor) => {
  const [rows] = await connection.query(
    `SELECT *
     FROM booking_category
     WHERE id = ?
       AND booking_for = ?
       AND status = 'active'
     LIMIT 1`,
    [bookingCategoryId, bookingFor]
  );

  return rows[0] || null;
};

const parseTimeToMinutes = (value) => {
  const parts = String(value || "").split(":");

  if (parts.length < 2) return null;

  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

const isPastBookingRequest = (bookingDate, startTime) => {
  const startMinutes = parseTimeToMinutes(startTime);
  if (startMinutes === null) return true;

  const date = new Date(`${bookingDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return true;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  if (date < startOfToday) {
    return true;
  }

  if (date.getTime() !== startOfToday.getTime()) {
    return false;
  }

  return startMinutes <= now.getHours() * 60 + now.getMinutes();
};

const hasConflict = async (connection, courtId, bookingDate, startTime, endTime) => {
  const [rows] = await connection.query(
    `SELECT id FROM bookings
     WHERE court_id = ?
       AND booking_date = ?
       AND booking_status NOT IN ('CANCELLED','REJECTED')
       AND (
            (start_time < ? AND end_time > ?)
         OR (start_time < ? AND end_time > ?)
         OR (start_time >= ? AND end_time <= ?)
       )
     LIMIT 1`,
    [courtId, bookingDate, endTime, endTime, startTime, startTime, startTime, endTime]
  );

  return rows.length > 0;
};

exports.createBooking = async (req, res) => {
  const { courtId, bookingDate, startTime, endTime, playerIds = [], bookingCategoryId } = req.body;
  const userId = req.user.id;

  if (!courtId || !bookingDate || !startTime || !endTime || !bookingCategoryId) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const durationMinutes = startMinutes !== null && endMinutes !== null ? endMinutes - startMinutes : null;

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes || durationMinutes === null) {
    return res.status(400).json({ message: "Invalid booking time range" });
  }

  if (isPastBookingRequest(bookingDate, startTime)) {
    return res.status(400).json({ message: "Past bookings are not allowed" });
  }

  if (String(req.user.can_book || "no").toLowerCase() !== "yes") {
    return res.status(403).json({ message: "Booking is disabled for your account" });
  }

  if (String(req.user.fees_status || "paid").toLowerCase() === "defaulter") {
    return res.status(403).json({ message: "Defaulter users cannot create bookings" });
  }

  try {
    const booking = await withNamedLock(
      `booking:court:${courtId}:${bookingDate}`,
      async (connection) => {
        const category = await getBookingCategory(connection, bookingCategoryId, "court");

        if (!category) {
          const error = new Error("Booking category not found");
          error.statusCode = 404;
          throw error;
        }

        const normalizedPlayerIds = Array.from(
          new Set([userId, ...playerIds.map((id) => Number(id)).filter(Boolean)])
        );

        if (normalizedPlayerIds.length < Number(category.min_players || 0)) {
          const error = new Error(`Minimum ${category.min_players} players are required for this booking`);
          error.statusCode = 400;
          throw error;
        }

        if (normalizedPlayerIds.length > Number(category.max_players || 0)) {
          const error = new Error(`Maximum ${category.max_players} players are allowed for this booking`);
          error.statusCode = 400;
          throw error;
        }

        if (durationMinutes < Number(category.min_time || 0) || durationMinutes > Number(category.max_time || 0)) {
          const error = new Error(
            `Booking duration must be between ${category.min_time} and ${category.max_time} minutes`
          );
          error.statusCode = 400;
          throw error;
        }

        await connection.beginTransaction();

        try {
          const [courtRows] = await connection.query(
            "SELECT id FROM courts WHERE id = ? LIMIT 1",
            [courtId]
          );

          if (!courtRows.length) {
            const error = new Error("Court not found");
            error.statusCode = 404;
            throw error;
          }

          const [playerRows] = await connection.query(
            `SELECT id, name, cm_no, fees_status, age, dob
             FROM users
             WHERE status = 'active'
               AND id IN (?)`,
            [normalizedPlayerIds]
          );

          const players = normalizedPlayerIds
            .map((id) => playerRows.find((player) => player.id === id))
            .filter(Boolean);

          if (!players.some((player) => player.id === userId)) {
            const error = new Error("Booking user must be included as player 1");
            error.statusCode = 400;
            throw error;
          }

          const defaulterPlayer = players.find(
            (player) =>
              player.id !== userId &&
              String(player.fees_status || "paid").toLowerCase() === "defaulter"
          );

          if (defaulterPlayer) {
            const error = new Error("This user is defaulter. Select other user.");
            error.statusCode = 400;
            throw error;
          }

          if (Number(category.min_age || 0) > 0) {
            const invalidAgePlayer = players.find((player) => {
              const age = resolveUserAge(player, bookingDate);
              return age === null || age < Number(category.min_age);
            });

            if (invalidAgePlayer) {
              const error = new Error(
                `${invalidAgePlayer.name} does not meet the minimum age of ${category.min_age}`
              );
              error.statusCode = 400;
              throw error;
            }
          }

          const conflict = await hasConflict(connection, courtId, bookingDate, startTime, endTime);
          if (conflict) {
            const error = new Error("Time slot not available");
            error.statusCode = 409;
            throw error;
          }

          const activeBookingsCount = await countUserActiveBookingsForDate(
            connection,
            userId,
            bookingDate
          );

          if (activeBookingsCount >= MAX_DAILY_ACTIVE_BOOKINGS) {
            const error = new Error(
              `You can only keep ${MAX_DAILY_ACTIVE_BOOKINGS} active bookings in one day`
            );
            error.statusCode = 400;
            throw error;
          }

          const [result] = await connection.query(
            `INSERT INTO bookings
              (user_id, court_id, booking_type, booking_category_id, booking_date, start_time, end_time, players_json)
             VALUES (?, ?, 'COURT', ?, ?, ?, ?, ?)`,
            [userId, courtId, bookingCategoryId, bookingDate, startTime, endTime, JSON.stringify(players)]
          );

          const [rows] = await connection.query(
            `SELECT b.*, u.name AS user_name, c.name AS court_name
             FROM bookings b
             JOIN users u ON b.user_id = u.id
             JOIN courts c ON b.court_id = c.id
             WHERE b.id = ?`,
            [result.insertId]
          );

          await connection.commit();
          return rows[0];
        } catch (error) {
          await connection.rollback();
          throw error;
        }
      }
    );

    emitRealtime("bookings:updated", {
      action: "created",
      id: booking.id,
      courtId: Number(courtId),
      bookingDate,
      bookingStatus: booking.booking_status,
    });
    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ message: err.message || "Booking failed" });
  }
};

exports.getBookingsByDate = async (req, res) => {
  try {
    const { courtId, date } = req.query;

    if (!courtId || !date) {
      return res.status(400).json({ message: "courtId and date required" });
    }

    const [bookings] = await pool.query(
      `SELECT b.*, u.name AS user_name
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       WHERE b.court_id = ? 
         AND b.booking_date = ? 
         AND b.booking_status NOT IN ('CANCELLED','REJECTED')
       ORDER BY b.start_time`,
      [courtId, date]
    );

    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch bookings" });
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT user_id, court_id, booking_date, booking_status FROM bookings WHERE id = ?`,
      [bookingId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (rows[0].user_id !== userId) {
      return res.status(403).json({ message: "Unauthorized" });
    }

    await pool.query(`UPDATE bookings SET booking_status = 'CANCELLED' WHERE id = ?`, [bookingId]);

    emitRealtime("bookings:updated", {
      action: "cancelled",
      id: Number(bookingId),
      courtId: Number(rows[0].court_id),
      bookingDate: rows[0].booking_date,
      bookingStatus: "CANCELLED",
    });
    res.json({ message: "Booking cancelled" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Cancel failed" });
  }
};

exports.adminUpdateStatus = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { status, adminNote } = req.body;
    const normalizedStatus = String(status || "").trim().toUpperCase();

    if (!BOOKING_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({ message: "Invalid booking status" });
    }

    const [booking] = await pool.query(
      `SELECT b.*, u.name AS user_name, c.name AS court_name
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN courts c ON b.court_id = c.id
      WHERE b.id = ?`,
      [bookingId]
    );

    if (!booking.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    await pool.query(
      `UPDATE bookings SET booking_status = ?, admin_note = ? WHERE id = ?`,
      [normalizedStatus, String(adminNote || "").trim(), bookingId]
    );

    booking[0].booking_status = normalizedStatus;
    booking[0].admin_note = String(adminNote || "").trim();

    emitRealtime("bookings:updated", {
      action: "status-updated",
      id: Number(bookingId),
      courtId: Number(booking[0].court_id),
      bookingDate: booking[0].booking_date,
      bookingStatus: normalizedStatus,
    });
    res.json(booking[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Admin update failed" });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { paymentStatus } = req.body;
    const normalizedPaymentStatus = String(paymentStatus || "").trim().toUpperCase();

    if (!PAYMENT_STATUSES.includes(normalizedPaymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }

    await pool.query(
      `UPDATE bookings SET payment_status = ? WHERE id = ?`,
      [normalizedPaymentStatus, bookingId]
    );

    const [booking] = await pool.query(
      `SELECT b.*, u.name AS user_name, c.name AS court_name
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN courts c ON b.court_id = c.id
      WHERE b.id = ?`,
      [bookingId]
    );

    if (!booking.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    emitRealtime("bookings:updated", { action: "payment-updated", id: Number(bookingId) });
    res.json(booking[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Payment update failed" });
  }
};

exports.getMyBookings = async (req, res) => {
  try {
    const userId = req.user.id;

    const [bookings] = await pool.query(
      `SELECT b.*, c.name AS court_name
       FROM bookings b
       JOIN courts c ON b.court_id = c.id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`,
      [userId]
    );

    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch history" });
  }
};

exports.getAllBookingsAdmin = async (req, res) => {
  try {
    const {
      year,
      month,
      dateFrom,
      dateTo,
      search,
      bookingStatus,
      paymentStatus
    } = req.query;

    let query = `SELECT b.*, u.name AS user_name, u.email AS user_email, c.name AS court_name
                 FROM bookings b
                 JOIN users u ON b.user_id = u.id
                 JOIN courts c ON b.court_id = c.id
                 WHERE 1=1`;
    const params = [];
    const normalizedSearch = String(search || "").trim().toLowerCase();

    if (year) {
      if (month) {
        query += ` AND YEAR(b.booking_date) = ? AND MONTH(b.booking_date) = ?`;
        params.push(year, month);
      } else {
        query += ` AND YEAR(b.booking_date) = ?`;
        params.push(year);
      }
    }

    if (dateFrom && dateTo) {
      query += ` AND b.booking_date BETWEEN ? AND ?`;
      params.push(dateFrom, dateTo);
    }

    if (bookingStatus) {
      query += ` AND b.booking_status = ?`;
      params.push(bookingStatus);
    }
    if (paymentStatus) {
      query += ` AND b.payment_status = ?`;
      params.push(paymentStatus);
    }

    if (normalizedSearch) {
      query += ` AND (LOWER(u.name) LIKE ? OR LOWER(c.name) LIKE ?)`;
      params.push(`%${normalizedSearch}%`, `%${normalizedSearch}%`);
    }

    query += ` ORDER BY b.created_at DESC`;

    const page = Number.parseInt(req.query.page, 10);
    const limit = Number.parseInt(req.query.limit, 10);
    const shouldPaginate = Number.isInteger(page) && Number.isInteger(limit) && page > 0 && limit > 0;

    if (shouldPaginate) {
      const safeLimit = Math.min(limit, 100);
      const offset = (page - 1) * safeLimit;
      const countQuery = `SELECT COUNT(*) AS total
                          FROM bookings b
                          JOIN users u ON b.user_id = u.id
                          JOIN courts c ON b.court_id = c.id
                          WHERE 1=1${query.split('WHERE 1=1')[1].split(' ORDER BY')[0]}`;
      const [countRows] = await pool.query(countQuery, params);
      const paginatedQuery = `${query} LIMIT ? OFFSET ?`;
      const [bookings] = await pool.query(paginatedQuery, [...params, safeLimit, offset]);

      return res.json({
        items: bookings,
        page,
        limit: safeLimit,
        total: Number(countRows[0]?.total || 0),
        totalPages: Math.ceil(Number(countRows[0]?.total || 0) / safeLimit),
      });
    }

    const [bookings] = await pool.query(query, params);
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Admin booking fetch failed" });
  }
};

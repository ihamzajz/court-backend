const pool = require("../config/db");
const { emitRealtime } = require("../socket");
const { withNamedLock } = require("../utils/locking");
const {
  MAX_DAILY_ACTIVE_BOOKINGS,
  countUserActiveBookingsForDate,
} = require("../utils/bookingLimits");

const BOOKING_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];
const PAYMENT_STATUSES = ["UNPAID", "PAID"];

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

const hasConflict = async (connection, eventId, bookingDate, startTime, endTime) => {
  const [rows] = await connection.query(
    `SELECT id FROM event_bookings
     WHERE event_id = ?
       AND booking_date = ?
       AND booking_status NOT IN ('CANCELLED','REJECTED')
       AND (
            (start_time < ? AND end_time > ?)
         OR (start_time < ? AND end_time > ?)
         OR (start_time >= ? AND end_time <= ?)
       )
     LIMIT 1`,
    [eventId, bookingDate, endTime, endTime, startTime, startTime, startTime, endTime]
  );

  return rows.length > 0;
};

exports.createEventBooking = async (req, res) => {
  const { eventId, bookingDate, startTime, endTime } = req.body;
  const userId = req.user.id;

  if (!eventId || !bookingDate || !startTime || !endTime) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
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
      `booking:event:${eventId}:${bookingDate}`,
      async (connection) => {
        await connection.beginTransaction();

        try {
          const [eventRows] = await connection.query(
            "SELECT id FROM events WHERE id = ? LIMIT 1",
            [eventId]
          );

          if (!eventRows.length) {
            const error = new Error("Venue not found");
            error.statusCode = 404;
            throw error;
          }

          const conflict = await hasConflict(connection, eventId, bookingDate, startTime, endTime);
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
            `INSERT INTO event_bookings
              (user_id, event_id, booking_date, start_time, end_time)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, eventId, bookingDate, startTime, endTime]
          );

          const [rows] = await connection.query(
            `SELECT eb.*, u.name AS user_name, u.email AS user_email, e.name AS event_name
             FROM event_bookings eb
             JOIN users u ON eb.user_id = u.id
             JOIN events e ON eb.event_id = e.id
             WHERE eb.id = ?`,
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

    emitRealtime("event-bookings:updated", {
      action: "created",
      id: booking.id,
      eventId: Number(eventId),
      bookingDate,
      bookingStatus: booking.booking_status,
    });
    res.status(201).json(booking);
  } catch (err) {
    console.error(err);
    res.status(err.statusCode || 500).json({ message: err.message || "Event booking failed" });
  }
};

exports.getEventBookingsByDate = async (req, res) => {
  try {
    const { eventId, date } = req.query;

    if (!eventId || !date) {
      return res.status(400).json({ message: "eventId and date required" });
    }

    const [bookings] = await pool.query(
      `SELECT eb.*, u.name AS user_name
       FROM event_bookings eb
       JOIN users u ON eb.user_id = u.id
       WHERE eb.event_id = ?
         AND eb.booking_date = ?
         AND eb.booking_status NOT IN ('CANCELLED','REJECTED')
       ORDER BY eb.start_time`,
      [eventId, date]
    );

    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch event bookings" });
  }
};

exports.getMyEventBookings = async (req, res) => {
  try {
    const userId = req.user.id;

    const [bookings] = await pool.query(
      `SELECT eb.*, e.name AS event_name
       FROM event_bookings eb
       JOIN events e ON eb.event_id = e.id
       WHERE eb.user_id = ?
       ORDER BY eb.created_at DESC`,
      [userId]
    );

    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch event history" });
  }
};

exports.adminUpdateEventBookingStatus = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { status, adminNote } = req.body;
    const normalizedStatus = String(status || "").trim().toUpperCase();

    if (!BOOKING_STATUSES.includes(normalizedStatus)) {
      return res.status(400).json({ message: "Invalid booking status" });
    }

    const [booking] = await pool.query(
      `SELECT eb.*, u.name AS user_name, u.email AS user_email, e.name AS event_name
       FROM event_bookings eb
       JOIN users u ON eb.user_id = u.id
       JOIN events e ON eb.event_id = e.id
       WHERE eb.id = ?`,
      [bookingId]
    );

    if (!booking.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    await pool.query(
      `UPDATE event_bookings SET booking_status = ?, admin_note = ? WHERE id = ?`,
      [normalizedStatus, String(adminNote || "").trim(), bookingId]
    );

    booking[0].booking_status = normalizedStatus;
    booking[0].admin_note = String(adminNote || "").trim();

    emitRealtime("event-bookings:updated", {
      action: "status-updated",
      id: Number(bookingId),
      eventId: Number(booking[0].event_id),
      bookingDate: booking[0].booking_date,
      bookingStatus: normalizedStatus,
    });
    res.json(booking[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Admin update failed" });
  }
};

exports.updateEventBookingPayment = async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { paymentStatus } = req.body;
    const normalizedPaymentStatus = String(paymentStatus || "").trim().toUpperCase();

    if (!PAYMENT_STATUSES.includes(normalizedPaymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }

    await pool.query(
      `UPDATE event_bookings SET payment_status = ? WHERE id = ?`,
      [normalizedPaymentStatus, bookingId]
    );

    const [booking] = await pool.query(
      `SELECT eb.*, u.name AS user_name, u.email AS user_email, e.name AS event_name
       FROM event_bookings eb
       JOIN users u ON eb.user_id = u.id
       JOIN events e ON eb.event_id = e.id
       WHERE eb.id = ?`,
      [bookingId]
    );

    if (!booking.length) {
      return res.status(404).json({ message: "Booking not found" });
    }

    emitRealtime("event-bookings:updated", { action: "payment-updated", id: Number(bookingId) });
    res.json(booking[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Payment update failed" });
  }
};

exports.getAllEventBookingsAdmin = async (req, res) => {
  try {
    const {
      year,
      month,
      dateFrom,
      dateTo,
      search,
      bookingStatus,
      paymentStatus,
    } = req.query;

    let query = `SELECT eb.*, u.name AS user_name, u.email AS user_email, e.name AS event_name
                 FROM event_bookings eb
                 JOIN users u ON eb.user_id = u.id
                 JOIN events e ON eb.event_id = e.id
                 WHERE 1=1`;
    const params = [];
    const normalizedSearch = String(search || "").trim().toLowerCase();

    if (year) {
      if (month) {
        query += ` AND YEAR(eb.booking_date) = ? AND MONTH(eb.booking_date) = ?`;
        params.push(year, month);
      } else {
        query += ` AND YEAR(eb.booking_date) = ?`;
        params.push(year);
      }
    }

    if (dateFrom && dateTo) {
      query += ` AND eb.booking_date BETWEEN ? AND ?`;
      params.push(dateFrom, dateTo);
    }

    if (bookingStatus) {
      query += ` AND eb.booking_status = ?`;
      params.push(bookingStatus);
    }

    if (paymentStatus) {
      query += ` AND eb.payment_status = ?`;
      params.push(paymentStatus);
    }

    if (normalizedSearch) {
      query += ` AND (LOWER(u.name) LIKE ? OR LOWER(e.name) LIKE ?)`;
      params.push(`%${normalizedSearch}%`, `%${normalizedSearch}%`);
    }

    query += ` ORDER BY eb.created_at DESC`;

    const page = Number.parseInt(req.query.page, 10);
    const limit = Number.parseInt(req.query.limit, 10);
    const shouldPaginate = Number.isInteger(page) && Number.isInteger(limit) && page > 0 && limit > 0;

    if (shouldPaginate) {
      const safeLimit = Math.min(limit, 100);
      const offset = (page - 1) * safeLimit;
      const paginatedQuery = `${query} LIMIT ? OFFSET ?`;
      const [bookings] = await pool.query(paginatedQuery, [...params, safeLimit, offset]);

      return res.json({
        items: bookings,
        page,
        limit: safeLimit,
      });
    }

    const [bookings] = await pool.query(query, params);
    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Admin event booking fetch failed" });
  }
};

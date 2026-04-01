const ACTIVE_BOOKING_STATUSES = ["PENDING", "APPROVED"];
const MAX_DAILY_ACTIVE_BOOKINGS = 5;

const countUserActiveBookingsForDate = async (connection, userId, bookingDate) => {
  const [courtRows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM bookings
     WHERE user_id = ?
       AND booking_date = ?
       AND booking_status IN (?, ?)`,
    [userId, bookingDate, ...ACTIVE_BOOKING_STATUSES]
  );

  const [eventRows] = await connection.query(
    `SELECT COUNT(*) AS total
     FROM event_bookings
     WHERE user_id = ?
       AND booking_date = ?
       AND booking_status IN (?, ?)`,
    [userId, bookingDate, ...ACTIVE_BOOKING_STATUSES]
  );

  return Number(courtRows[0]?.total || 0) + Number(eventRows[0]?.total || 0);
};

module.exports = {
  ACTIVE_BOOKING_STATUSES,
  MAX_DAILY_ACTIVE_BOOKINGS,
  countUserActiveBookingsForDate,
};

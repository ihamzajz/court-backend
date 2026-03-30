// routes/bookingRoutes.js
const express = require("express");
const router = express.Router();

const {
  createBooking,
  getBookingsByDate,
  cancelBooking,
  adminUpdateStatus,
  updatePayment,
  getAllBookingsAdmin,
  getMyBookings
} = require("../controllers/bookingController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

// User
router.post("/", protect, createBooking);           // create booking
router.get("/my", protect, getMyBookings);         // user booking history
router.delete("/:id", protect, cancelBooking);     // user cancel booking

// Dialog view (by date)
router.get("/", protect, getBookingsByDate);

// Admin
router.put("/admin/:id/status", protect, adminOnly, adminUpdateStatus);
router.put("/admin/:id/payment", protect, adminOnly, updatePayment);
router.get("/admin/all", protect, adminOnly, getAllBookingsAdmin);

module.exports = router;
const express = require("express");
const router = express.Router();

const {
  createEventBooking,
  getEventBookingsByDate,
  getMyEventBookings,
  adminUpdateEventBookingStatus,
  updateEventBookingPayment,
  getAllEventBookingsAdmin,
} = require("../controllers/eventBookingController");

const { protect, adminOnly } = require("../middleware/authMiddleware");

router.post("/", protect, createEventBooking);
router.get("/my", protect, getMyEventBookings);
router.get("/", protect, getEventBookingsByDate);

router.put("/admin/:id/status", protect, adminOnly, adminUpdateEventBookingStatus);
router.put("/admin/:id/payment", protect, adminOnly, updateEventBookingPayment);
router.get("/admin/all", protect, adminOnly, getAllEventBookingsAdmin);

module.exports = router;

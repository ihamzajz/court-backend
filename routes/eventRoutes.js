const express = require("express");
const router = express.Router();
const upload = require("../middleware/uploadEvents");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const {
  createEvent,
  getEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} = require("../controllers/eventController");

router.post("/", protect, adminOnly, upload.single("picture"), createEvent);
router.put("/:id", protect, adminOnly, upload.single("picture"), updateEvent);

router.get("/", getEvents);
router.get("/:id", getEventById);
router.delete("/:id", protect, adminOnly, deleteEvent);

module.exports = router;

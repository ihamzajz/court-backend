const express = require("express");

const {
  getBookingPlayers,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} = require("../controllers/userController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/booking-options", protect, getBookingPlayers);
router.get("/", protect, adminOnly, getUsers);
router.post("/", protect, adminOnly, createUser);
router.put("/:id", protect, adminOnly, updateUser);
router.delete("/:id", protect, adminOnly, deleteUser);

module.exports = router;

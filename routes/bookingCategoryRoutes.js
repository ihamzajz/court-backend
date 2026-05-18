const express = require("express");
const router = express.Router();

const { protect, adminOnly } = require("../middleware/authMiddleware");
const {
  createBookingCategory,
  getBookingCategories,
  getBookingCategoryById,
  updateBookingCategory,
  deleteBookingCategory,
} = require("../controllers/bookingCategoryController");

router.post("/", protect, adminOnly, createBookingCategory);
router.put("/:id", protect, adminOnly, updateBookingCategory);

router.get("/", getBookingCategories);
router.get("/:id", getBookingCategoryById);
router.delete("/:id", protect, adminOnly, deleteBookingCategory);

module.exports = router;

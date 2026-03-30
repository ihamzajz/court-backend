const express = require("express");

const {
  getPublicSlides,
  getAllSlidesAdmin,
  createSlide,
  updateSlide,
  deleteSlide,
  reorderSlides,
} = require("../controllers/slideController");
const uploadSlides = require("../middleware/uploadSlides");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", getPublicSlides);
router.get("/admin/all", protect, adminOnly, getAllSlidesAdmin);
router.put("/reorder", protect, adminOnly, reorderSlides);
router.post("/", protect, adminOnly, uploadSlides.single("picture"), createSlide);
router.put("/:id", protect, adminOnly, uploadSlides.single("picture"), updateSlide);
router.delete("/:id", protect, adminOnly, deleteSlide);

module.exports = router;

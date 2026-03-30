const express = require("express");

const {
  getPublicFaqs,
  getAllFaqsAdmin,
  createFaq,
  updateFaq,
  deleteFaq,
  reorderFaqs,
} = require("../controllers/faqController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/", getPublicFaqs);
router.get("/admin/all", protect, adminOnly, getAllFaqsAdmin);
router.put("/reorder", protect, adminOnly, reorderFaqs);
router.post("/", protect, adminOnly, createFaq);
router.put("/:id", protect, adminOnly, updateFaq);
router.delete("/:id", protect, adminOnly, deleteFaq);

module.exports = router;

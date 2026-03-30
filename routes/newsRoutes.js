const express = require("express");

const {
  getPublicNews,
  getNewsById,
  getAllNewsAdmin,
  createNews,
  updateNews,
  deleteNews,
  reorderNews,
} = require("../controllers/newsController");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const uploadNews = require("../middleware/uploadNews");

const router = express.Router();

router.get("/", getPublicNews);
router.get("/admin/all", protect, adminOnly, getAllNewsAdmin);
router.put("/reorder", protect, adminOnly, reorderNews);
router.post("/", protect, adminOnly, uploadNews.single("picture"), createNews);
router.get("/:id", getNewsById);
router.put("/:id", protect, adminOnly, uploadNews.single("picture"), updateNews);
router.delete("/:id", protect, adminOnly, deleteNews);

module.exports = router;

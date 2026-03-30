const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const {
  createCourt,
  getCourts,
  getCourtById,
  updateCourt,
  deleteCourt
} = require("../controllers/courtController");

router.post("/", protect, adminOnly, upload.single("picture"), createCourt);
router.put("/:id", protect, adminOnly, upload.single("picture"), updateCourt);

router.get("/", getCourts);
router.get("/:id", getCourtById);
router.delete("/:id", protect, adminOnly, deleteCourt);

module.exports = router;

const express = require("express");

const {
  registerUser,
  loginUser,
  changePassword,
  deleteCurrentUser,
  getCurrentUser,
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.get("/me", protect, getCurrentUser);
router.put("/change-password", protect, changePassword);
router.delete("/me", protect, deleteCurrentUser);

module.exports = router;

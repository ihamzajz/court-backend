const express = require("express");

const {
  renderPrivacyPolicy,
  renderAccountDeletionPage,
  submitAccountDeletionRequest,
  listAccountDeletionRequests,
  processAccountDeletionRequest,
} = require("../controllers/complianceController");
const { protect, adminOnly } = require("../middleware/authMiddleware");

const router = express.Router();

router.get("/privacy-policy", renderPrivacyPolicy);
router.get("/account-deletion", renderAccountDeletionPage);
router.post("/account-deletion", submitAccountDeletionRequest);
router.get("/api/compliance/account-deletion-requests", protect, adminOnly, listAccountDeletionRequests);
router.put(
  "/api/compliance/account-deletion-requests/:id/process",
  protect,
  adminOnly,
  processAccountDeletionRequest
);

module.exports = router;

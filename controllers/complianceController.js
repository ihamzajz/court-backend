const pool = require("../config/db");
const { getAppName, getPrivacyContactName, getSupportEmail, getSupportWhatsapp } = require("../config/env");
const { disconnectUserSockets, emitRealtime } = require("../socket");

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getPolicyHtml = () => {
  const appName = escapeHtml(getAppName());
  const supportEmail = escapeHtml(getSupportEmail() || "support@example.com");
  const supportWhatsapp = escapeHtml(getSupportWhatsapp());
  const contactName = escapeHtml(getPrivacyContactName());

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${appName} Privacy Policy</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f4f7fb; color: #0f172a; }
      main { max-width: 780px; margin: 0 auto; padding: 20px 14px 32px; }
      section { background: #fff; border: 1px solid #dbe5f0; border-radius: 16px; padding: 18px; margin-top: 14px; }
      h1, h2 { color: #163b7a; }
      h1 { font-size: 28px; margin: 0 0 8px; }
      h2 { font-size: 20px; margin: 0 0 10px; }
      p, li { font-size: 14px; line-height: 1.55; }
      ul { padding-left: 22px; }
      a { color: #1d4ed8; }
      .muted { color: #475569; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${appName} Privacy Policy</h1>
        <p class="muted">Last updated: March 30, 2026</p>
        <p>${appName} helps users request court and event bookings. To provide these services, the app stores limited account and booking information.</p>
      </section>
      <section>
        <h2>Information We Collect</h2>
        <ul>
          <li>Account details such as name, username, email address, and optional club or member number.</li>
          <li>Authentication information such as encrypted passwords and session data.</li>
          <li>Booking data such as court bookings, event bookings, status history, and payment status.</li>
          <li>Admin-uploaded media such as court, event, slide, and news images.</li>
        </ul>
      </section>
      <section>
        <h2>How We Use Information</h2>
        <ul>
          <li>To create and manage user accounts.</li>
          <li>To process booking requests and show booking history.</li>
          <li>To let administrators review, approve, reject, and manage bookings.</li>
          <li>To publish app content such as slides, FAQs, news, courts, and events.</li>
          <li>To protect accounts and improve app security.</li>
        </ul>
      </section>
      <section>
        <h2>Data Sharing</h2>
        <p>${appName} does not sell personal information. Data is only shared with authorized administrators and service providers required to operate the platform, such as hosting, database, and email delivery providers.</p>
      </section>
      <section>
        <h2>Data Retention</h2>
        <p>We keep account and booking information only as long as needed to provide the service, comply with legal obligations, resolve disputes, and enforce policies.</p>
      </section>
      <section>
        <h2>Account Deletion</h2>
        <p>If you create an account in ${appName}, you can request deletion directly inside the app from the Profile screen by selecting <strong>Delete Account</strong>.</p>
        <p>You can also submit a deletion request on the web at <a href="/account-deletion">/account-deletion</a>.</p>
      </section>
      <section>
        <h2>Security</h2>
        <p>We use reasonable technical and organizational safeguards to protect account information, including encrypted password storage and authenticated access controls.</p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>If you have questions about this policy, contact ${contactName} at <a href="mailto:${supportEmail}">${supportEmail}</a>.</p>
        <p>You can also contact us on WhatsApp at <strong>${supportWhatsapp}</strong>.</p>
      </section>
    </main>
  </body>
</html>`;
};

const getDeletionPageHtml = (message = "", isSuccess = false) => {
  const appName = escapeHtml(getAppName());
  const supportEmail = escapeHtml(getSupportEmail() || "support@example.com");
  const supportWhatsapp = escapeHtml(getSupportWhatsapp());
  const banner = message
    ? `<div style="margin-bottom:16px;padding:14px 16px;border-radius:12px;border:1px solid ${
        isSuccess ? "#a7f3d0" : "#fecaca"
      };background:${isSuccess ? "#ecfdf5" : "#fef2f2"};color:${isSuccess ? "#166534" : "#991b1b"};">${escapeHtml(
        message
      )}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${appName} Account Deletion</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 0; background: #f4f7fb; color: #0f172a; }
      main { max-width: 680px; margin: 0 auto; padding: 20px 14px 32px; }
      section { background: #fff; border: 1px solid #dbe5f0; border-radius: 16px; padding: 18px; }
      h1 { font-size: 26px; margin: 0 0 10px; }
      p, label, input, textarea, button { font-size: 14px; }
      label { display: block; margin-bottom: 8px; font-weight: 700; color: #163b7a; }
      input, textarea { width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 12px; border: 1px solid #cbd5e1; margin-bottom: 16px; }
      textarea { min-height: 110px; resize: vertical; }
      button { background: #1d4ed8; color: #fff; border: 0; border-radius: 12px; padding: 12px 18px; font-weight: 700; cursor: pointer; }
      .muted { color: #475569; }
      a { color: #1d4ed8; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>${appName} Account Deletion Request</h1>
        <p class="muted">Use this page if you need to request deletion outside the mobile app. If you can still sign in, the fastest option is the in-app <strong>Delete Account</strong> action from your profile.</p>
        ${banner}
        <form method="post" action="/account-deletion">
          <label for="email">Account Email</label>
          <input id="email" name="email" type="email" autocomplete="email" required />

          <label for="note">Additional Details (Optional)</label>
          <textarea id="note" name="note" placeholder="Add any information that will help us identify your account."></textarea>

          <button type="submit">Submit Deletion Request</button>
        </form>
        <p class="muted" style="margin-top:18px;">If you need help, contact <a href="mailto:${supportEmail}">${supportEmail}</a> or WhatsApp <strong>${supportWhatsapp}</strong>.</p>
      </section>
    </main>
  </body>
</html>`;
};

const renderPrivacyPolicy = (_req, res) => {
  res.type("html").send(getPolicyHtml());
};

const renderAccountDeletionPage = (_req, res) => {
  res.type("html").send(getDeletionPageHtml());
};

const submitAccountDeletionRequest = async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const note = String(req.body?.note || "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).type("html").send(
      getDeletionPageHtml("Please enter a valid email address.", false)
    );
  }

  try {
    const [users] = await pool.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    const userId = users[0]?.id || null;

    await pool.query(
      `INSERT INTO account_deletion_requests (user_id, email, note)
       VALUES (?, ?, ?)`,
      [userId, email, note || null]
    );

    return res
      .status(200)
      .type("html")
      .send(
        getDeletionPageHtml(
          "Your deletion request has been received. We will review it and process your request.",
          true
        )
      );
  } catch (error) {
    console.error("Failed to submit account deletion request", error);
    return res
      .status(500)
      .type("html")
      .send(getDeletionPageHtml("We could not submit your request right now. Please try again.", false));
  }
};

const normalizeDeletionStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "processed" ? "processed" : "pending";
};

const listAccountDeletionRequests = async (req, res) => {
  const status = normalizeDeletionStatus(req.query?.status);

  try {
    const [rows] = await pool.query(
      `SELECT
         adr.id,
         adr.user_id,
         adr.email,
         adr.note,
         adr.resolution_note,
         adr.status,
         adr.processed_by,
         adr.processed_at,
         adr.created_at,
         adr.updated_at,
         u.name AS user_name,
         u.username AS user_username,
         u.status AS user_status,
         processed_user.name AS processed_by_name
       FROM account_deletion_requests adr
       LEFT JOIN users u ON u.id = adr.user_id
       LEFT JOIN users processed_user ON processed_user.id = adr.processed_by
       WHERE adr.status = ?
       ORDER BY adr.created_at DESC`,
      [status]
    );

    return res.json(rows);
  } catch (error) {
    console.error("Failed to fetch account deletion requests", error);
    return res.status(500).json({ message: "Failed to fetch account deletion requests" });
  }
};

const processAccountDeletionRequest = async (req, res) => {
  const requestId = Number(req.params?.id);
  const action = String(req.body?.action || "mark_processed").trim().toLowerCase();
  const resolutionNote = String(req.body?.resolutionNote || "").trim() || null;

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ message: "Valid request id is required" });
  }

  if (action !== "mark_processed" && action !== "delete_user") {
    return res.status(400).json({ message: "Unsupported processing action" });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [requestRows] = await connection.query(
      `SELECT id, user_id, email, status
       FROM account_deletion_requests
       WHERE id = ?
       FOR UPDATE`,
      [requestId]
    );

    if (requestRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "Deletion request not found" });
    }

    const deletionRequest = requestRows[0];

    if (deletionRequest.status === "processed") {
      await connection.rollback();
      return res.status(400).json({ message: "Deletion request already processed" });
    }

    let deletedUserId = null;

    if (action === "delete_user" && deletionRequest.user_id) {
      const [userRows] = await connection.query(
        `SELECT id
         FROM users
         WHERE id = ?
         FOR UPDATE`,
        [deletionRequest.user_id]
      );

      if (userRows.length > 0) {
        deletedUserId = Number(userRows[0].id);
        await connection.query("DELETE FROM users WHERE id = ?", [deletedUserId]);
      }
    }

    await connection.query(
      `UPDATE account_deletion_requests
       SET status = 'processed',
           resolution_note = ?,
           processed_by = ?,
           processed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [resolutionNote, req.user.id, requestId]
    );

    await connection.commit();

    emitRealtime("users:updated", { action: "deletion-request-processed", id: requestId });

    if (deletedUserId) {
      await disconnectUserSockets(deletedUserId);
    }

    const [updatedRows] = await pool.query(
      `SELECT
         adr.id,
         adr.user_id,
         adr.email,
         adr.note,
         adr.resolution_note,
         adr.status,
         adr.processed_by,
         adr.processed_at,
         adr.created_at,
         adr.updated_at,
         processed_user.name AS processed_by_name
       FROM account_deletion_requests adr
       LEFT JOIN users processed_user ON processed_user.id = adr.processed_by
       WHERE adr.id = ?`,
      [requestId]
    );

    return res.json({
      message:
        action === "delete_user"
          ? "Deletion request processed and linked account removed"
          : "Deletion request marked as processed",
      deletedUserId,
      request: updatedRows[0],
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Failed to process account deletion request", error);
    return res.status(500).json({ message: "Failed to process account deletion request" });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};

module.exports = {
  renderPrivacyPolicy,
  renderAccountDeletionPage,
  submitAccountDeletionRequest,
  listAccountDeletionRequests,
  processAccountDeletionRequest,
};

const pool = require("../config/db");

const ensureUsersTokenVersionColumn = async () => {
  const [tableRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'`
  );

  if (Number(tableRows[0]?.total || 0) === 0) {
    return;
  }

  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME = 'token_version'`
  );

  if (Number(rows[0]?.total || 0) > 0) {
    return;
  }

  await pool.query(`
    ALTER TABLE users
    ADD COLUMN token_version INT NOT NULL DEFAULT 0 AFTER fees_status
  `);
};

const ensureAccountDeletionRequestColumns = async () => {
  const [tableRows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'account_deletion_requests'`
  );

  if (Number(tableRows[0]?.total || 0) === 0) {
    return;
  }

  const requiredColumns = [
    {
      name: "processed_by",
      sql: "ALTER TABLE account_deletion_requests ADD COLUMN processed_by INT DEFAULT NULL AFTER status",
    },
    {
      name: "processed_at",
      sql: "ALTER TABLE account_deletion_requests ADD COLUMN processed_at TIMESTAMP NULL DEFAULT NULL AFTER processed_by",
    },
    {
      name: "resolution_note",
      sql: "ALTER TABLE account_deletion_requests ADD COLUMN resolution_note TEXT DEFAULT NULL AFTER note",
    },
  ];

  for (const column of requiredColumns) {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'account_deletion_requests'
         AND COLUMN_NAME = ?`,
      [column.name]
    );

    if (Number(rows[0]?.total || 0) === 0) {
      await pool.query(column.sql);
    }
  }
};

const ensureAuthTables = async () => {
  await ensureUsersTokenVersionColumn();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS slides (
      id INT NOT NULL AUTO_INCREMENT,
      title VARCHAR(255) NOT NULL,
      subtitle VARCHAR(255) DEFAULT NULL,
      picture VARCHAR(255) NOT NULL,
      sort_order INT NOT NULL DEFAULT 1,
      is_active ENUM('yes', 'no') NOT NULL DEFAULT 'yes',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS account_deletion_requests (
      id INT NOT NULL AUTO_INCREMENT,
      user_id INT DEFAULT NULL,
      email VARCHAR(150) NOT NULL,
      note TEXT DEFAULT NULL,
      resolution_note TEXT DEFAULT NULL,
      status ENUM('pending', 'processed') NOT NULL DEFAULT 'pending',
      processed_by INT DEFAULT NULL,
      processed_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_account_deletion_requests_user_id (user_id),
      KEY idx_account_deletion_requests_email (email),
      CONSTRAINT fk_account_deletion_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  await ensureAccountDeletionRequestColumns();
};

module.exports = {
  ensureAuthTables,
};

const pool = require("../config/db");

const acquireNamedLock = async (connection, lockName, timeoutSeconds = 10) => {
  const [rows] = await connection.query("SELECT GET_LOCK(?, ?) AS acquired", [
    lockName,
    timeoutSeconds,
  ]);

  return rows[0]?.acquired === 1;
};

const releaseNamedLock = async (connection, lockName) => {
  try {
    await connection.query("SELECT RELEASE_LOCK(?)", [lockName]);
  } catch {
    // Best-effort cleanup. Connection release will still happen.
  }
};

const withNamedLock = async (lockName, handler, timeoutSeconds = 10) => {
  const connection = await pool.getConnection();

  try {
    const acquired = await acquireNamedLock(connection, lockName, timeoutSeconds);

    if (!acquired) {
      const error = new Error("Resource is busy. Please try again.");
      error.statusCode = 503;
      throw error;
    }

    return await handler(connection);
  } finally {
    await releaseNamedLock(connection, lockName);
    connection.release();
  }
};

module.exports = {
  withNamedLock,
};

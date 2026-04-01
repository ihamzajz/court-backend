const pool = require("../config/db");
const { getUploadSubdirPath } = require("../config/uploads");
const { emitRealtime } = require("../socket");
const { deleteFileIfExists } = require("../utils/uploadFiles");

const newsDir = getUploadSubdirPath("news");

const normalizeStatus = (value, fallback = "active") => {
  if (typeof value === "string") {
    return value.toLowerCase() === "inactive" ? "inactive" : "active";
  }

  if (typeof value === "boolean") {
    return value ? "active" : "inactive";
  }

  return fallback;
};

const normalizeSortOrder = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const getNextSortOrder = async () => {
  const [rows] = await pool.query("SELECT MAX(sort_order) AS maxOrder FROM news");
  return (rows[0]?.maxOrder || 0) + 1;
};

const removePicture = (pictureValue) => deleteFileIfExists(newsDir, pictureValue);

exports.getPublicNews = async (_req, res) => {
  try {
    const [news] = await pool.query(
      `SELECT id, heading, content, picture, status, sort_order, created_at
       FROM news
       WHERE status = 'active'
       ORDER BY sort_order ASC, created_at DESC`
    );

    res.json(news);
  } catch (error) {
    if (req.file) removePicture(req.file.filename);
    console.error(error);
    res.status(500).json({ message: "Failed to fetch news" });
  }
};

exports.getNewsById = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, heading, content, picture, status, sort_order, created_at, updated_at
       FROM news
       WHERE id = ?`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "News not found" });
    }

    if (rows[0].status !== "active") {
      return res.status(404).json({ message: "News not found" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch news detail" });
  }
};

exports.getAllNewsAdmin = async (_req, res) => {
  try {
    const [news] = await pool.query(
      `SELECT id, heading, content, picture, status, sort_order, created_at, updated_at
       FROM news
       ORDER BY sort_order ASC, created_at DESC`
    );

    res.json(news);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch news" });
  }
};

exports.createNews = async (req, res) => {
  try {
    const { heading, content, status, sortOrder } = req.body;

    if (!heading?.trim() || !content?.trim()) {
      if (req.file) removePicture(req.file.filename);
      return res.status(400).json({ message: "Heading and content are required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "News image is required" });
    }

    const resolvedSortOrder =
      sortOrder === undefined || String(sortOrder).trim() === ""
        ? await getNextSortOrder()
        : normalizeSortOrder(sortOrder);

    const [result] = await pool.query(
      `INSERT INTO news (heading, content, picture, status, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [heading.trim(), content.trim(), req.file.filename, normalizeStatus(status), resolvedSortOrder]
    );

    const [created] = await pool.query("SELECT * FROM news WHERE id = ?", [result.insertId]);
    emitRealtime("news:updated", { action: "created", id: result.insertId });
    res.status(201).json(created[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create news" });
  }
};

exports.updateNews = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM news WHERE id = ?", [req.params.id]);

    if (!rows.length) {
      if (req.file) removePicture(req.file.filename);
      return res.status(404).json({ message: "News not found" });
    }

    const currentNews = rows[0];
    const previousPicture = currentNews.picture;
    const nextPicture = req.file ? req.file.filename : currentNews.picture;

    await pool.query(
      `UPDATE news
       SET heading = ?, content = ?, picture = ?, status = ?, sort_order = ?
       WHERE id = ?`,
      [
        req.body.heading?.trim() || currentNews.heading,
        req.body.content?.trim() || currentNews.content,
        nextPicture,
        req.body.status !== undefined ? normalizeStatus(req.body.status, currentNews.status) : currentNews.status,
        req.body.sortOrder !== undefined
          ? normalizeSortOrder(req.body.sortOrder, currentNews.sort_order)
          : currentNews.sort_order,
        req.params.id,
      ]
    );

    const [updated] = await pool.query("SELECT * FROM news WHERE id = ?", [req.params.id]);
    if (req.file && previousPicture) {
      removePicture(previousPicture);
    }
    emitRealtime("news:updated", { action: "updated", id: Number(req.params.id) });
    res.json(updated[0]);
  } catch (error) {
    if (req.file) removePicture(req.file.filename);
    console.error(error);
    res.status(500).json({ message: "Failed to update news" });
  }
};

exports.deleteNews = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM news WHERE id = ?", [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ message: "News not found" });
    }

    if (rows[0].picture) {
      removePicture(rows[0].picture);
    }

    await pool.query("DELETE FROM news WHERE id = ?", [req.params.id]);
    emitRealtime("news:updated", { action: "deleted", id: Number(req.params.id) });
    res.json({ message: "News deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete news" });
  }
};

exports.reorderNews = async (req, res) => {
  try {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];

    if (!orderedIds.length) {
      return res.status(400).json({ message: "orderedIds is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (let index = 0; index < orderedIds.length; index += 1) {
        await connection.query("UPDATE news SET sort_order = ? WHERE id = ?", [index + 1, orderedIds[index]]);
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [news] = await pool.query(
      `SELECT id, heading, content, picture, status, sort_order, created_at, updated_at
       FROM news
       ORDER BY sort_order ASC, created_at DESC`
    );

    emitRealtime("news:updated", { action: "reordered" });
    res.json(news);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to reorder news" });
  }
};

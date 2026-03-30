const fs = require("fs");
const path = require("path");

const pool = require("../config/db");
const { getUploadSubdirPath } = require("../config/uploads");
const { emitRealtime } = require("../socket");

const slidesDir = getUploadSubdirPath("slides");
const getPictureFilename = (pictureValue) => {
  if (!pictureValue) return null;
  return path.basename(pictureValue);
};

const normalizeSortOrder = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const normalizeIsActive = (value, fallback = "yes") => {
  if (typeof value === "string") {
    return value.toLowerCase() === "no" ? "no" : "yes";
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return fallback;
};

const getNextSortOrder = async () => {
  const [rows] = await pool.query("SELECT MAX(sort_order) AS maxOrder FROM slides");
  return (rows[0]?.maxOrder || 0) + 1;
};

exports.getPublicSlides = async (_req, res) => {
  try {
    const [slides] = await pool.query(
      `SELECT id, title, subtitle, picture, sort_order, is_active
       FROM slides
       WHERE is_active = 'yes'
       ORDER BY sort_order ASC, created_at DESC`
    );

    res.json(slides);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch slides" });
  }
};

exports.getAllSlidesAdmin = async (_req, res) => {
  try {
    const [slides] = await pool.query(
      `SELECT id, title, subtitle, picture, sort_order, is_active, created_at
       FROM slides
       ORDER BY sort_order ASC, created_at DESC`
    );

    res.json(slides);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch slides" });
  }
};

exports.createSlide = async (req, res) => {
  try {
    const { title, subtitle, sortOrder, isActive } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ message: "Slide title is required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Slide image is required" });
    }

    const [countRows] = await pool.query("SELECT COUNT(*) AS total FROM slides");
    if ((countRows[0]?.total || 0) >= 10) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: "Maximum 10 slides allowed" });
    }

    const resolvedSortOrder =
      sortOrder === undefined || String(sortOrder).trim() === ""
        ? await getNextSortOrder()
        : normalizeSortOrder(sortOrder);

    const [result] = await pool.query(
      `INSERT INTO slides (title, subtitle, picture, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [
        title.trim(),
        subtitle?.trim() || null,
        req.file.filename,
        resolvedSortOrder,
        normalizeIsActive(isActive),
      ]
    );

    const [slides] = await pool.query("SELECT * FROM slides WHERE id = ?", [result.insertId]);
    emitRealtime("slides:updated", { action: "created", id: result.insertId });
    res.status(201).json(slides[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to create slide" });
  }
};

exports.updateSlide = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM slides WHERE id = ?", [req.params.id]);
    if (rows.length === 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ message: "Slide not found" });
    }

    const slide = rows[0];
    const oldPictureFilename = getPictureFilename(slide.picture);
    const nextPicture = req.file
      ? req.file.filename
      : slide.picture;

    if (req.file && oldPictureFilename) {
      const oldPath = path.join(slidesDir, oldPictureFilename);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    await pool.query(
      `UPDATE slides
       SET title = ?, subtitle = ?, picture = ?, sort_order = ?, is_active = ?
       WHERE id = ?`,
      [
        req.body.title?.trim() || slide.title,
        req.body.subtitle !== undefined ? req.body.subtitle?.trim() || null : slide.subtitle,
        nextPicture,
        req.body.sortOrder !== undefined
          ? normalizeSortOrder(req.body.sortOrder, slide.sort_order)
          : slide.sort_order,
        req.body.isActive !== undefined
          ? normalizeIsActive(req.body.isActive, slide.is_active)
          : slide.is_active,
        req.params.id,
      ]
    );

    const [updated] = await pool.query("SELECT * FROM slides WHERE id = ?", [req.params.id]);
    emitRealtime("slides:updated", { action: "updated", id: Number(req.params.id) });
    res.json(updated[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update slide" });
  }
};

exports.deleteSlide = async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM slides WHERE id = ?", [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "Slide not found" });
    }

    const slide = rows[0];
    const pictureFilename = getPictureFilename(slide.picture);
    if (pictureFilename) {
      const filePath = path.join(slidesDir, pictureFilename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await pool.query("DELETE FROM slides WHERE id = ?", [req.params.id]);
    emitRealtime("slides:updated", { action: "deleted", id: Number(req.params.id) });
    res.json({ message: "Slide deleted" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete slide" });
  }
};

exports.reorderSlides = async (req, res) => {
  try {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];

    if (!orderedIds.length) {
      return res.status(400).json({ message: "orderedIds is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      for (let index = 0; index < orderedIds.length; index += 1) {
        await connection.query("UPDATE slides SET sort_order = ? WHERE id = ?", [
          index + 1,
          orderedIds[index],
        ]);
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [slides] = await pool.query(
      `SELECT id, title, subtitle, picture, sort_order, is_active, created_at
       FROM slides
       ORDER BY sort_order ASC, created_at DESC`
    );

    emitRealtime("slides:updated", { action: "reordered" });
    res.json(slides);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to reorder slides" });
  }
};

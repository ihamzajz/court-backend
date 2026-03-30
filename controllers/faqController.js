const pool = require("../config/db");
const { emitRealtime } = require("../socket");

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

const clampSortOrder = (value, min, max) => Math.min(Math.max(value, min), max);

const getOrderedFaqIds = async (connection, excludeId = null) => {
  const params = [];
  let query = `
    SELECT id
    FROM faqs
  `;

  if (excludeId !== null) {
    query += " WHERE id <> ?";
    params.push(excludeId);
  }

  query += " ORDER BY sort_order ASC, created_at ASC, id ASC";

  const [rows] = await connection.query(query, params);
  return rows.map((row) => row.id);
};

const applyFaqOrder = async (connection, orderedIds) => {
  for (let index = 0; index < orderedIds.length; index += 1) {
    await connection.query("UPDATE faqs SET sort_order = ? WHERE id = ?", [index + 1, orderedIds[index]]);
  }
};

const compactFaqSortOrders = async (connection) => {
  const orderedIds = await getOrderedFaqIds(connection);
  await applyFaqOrder(connection, orderedIds);
};

const insertAtOrder = (ids, idToInsert, requestedOrder) => {
  const maxOrder = ids.length + 1;
  const targetOrder = clampSortOrder(requestedOrder || maxOrder, 1, maxOrder);
  const nextIds = [...ids];
  nextIds.splice(targetOrder - 1, 0, idToInsert);
  return nextIds;
};

exports.getPublicFaqs = async (_req, res) => {
  try {
    const [faqs] = await pool.query(
      `SELECT id, question, answer, status, sort_order
       FROM faqs
       WHERE status = 'active'
       ORDER BY sort_order ASC, created_at ASC`
    );

    res.json(faqs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch FAQs" });
  }
};

exports.getAllFaqsAdmin = async (_req, res) => {
  try {
    const [faqs] = await pool.query(
      `SELECT id, question, answer, status, sort_order, created_at, updated_at
       FROM faqs
       ORDER BY sort_order ASC, created_at ASC`
    );

    res.json(faqs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch FAQs" });
  }
};

exports.createFaq = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { question, answer, status, sortOrder } = req.body;

    if (!question?.trim() || !answer?.trim()) {
      return res.status(400).json({ message: "Question and answer are required" });
    }

    const requestedOrder = normalizeSortOrder(sortOrder, 0);

    await connection.beginTransaction();

    const [result] = await connection.query(
      `INSERT INTO faqs (question, answer, status, sort_order)
       VALUES (?, ?, ?, ?)`,
      [question.trim(), answer.trim(), normalizeStatus(status), 0]
    );

    const orderedIds = await getOrderedFaqIds(connection, result.insertId);
    const nextOrder = insertAtOrder(orderedIds, result.insertId, requestedOrder);
    await applyFaqOrder(connection, nextOrder);

    await connection.commit();

    const [created] = await pool.query("SELECT * FROM faqs WHERE id = ?", [result.insertId]);
    emitRealtime("faqs:updated", { action: "created", id: result.insertId });
    res.status(201).json(created[0]);
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: "Failed to create FAQ" });
  } finally {
    connection.release();
  }
};

exports.updateFaq = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query("SELECT * FROM faqs WHERE id = ?", [req.params.id]);

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "FAQ not found" });
    }

    const currentFaq = rows[0];
    const currentOrder = Number(currentFaq.sort_order) || 1;
    const requestedOrder =
      req.body.sortOrder !== undefined
        ? normalizeSortOrder(req.body.sortOrder, currentOrder)
        : currentOrder;

    await connection.query(
      `UPDATE faqs
       SET question = ?, answer = ?, status = ?, sort_order = ?
       WHERE id = ?`,
      [
        req.body.question?.trim() || currentFaq.question,
        req.body.answer?.trim() || currentFaq.answer,
        req.body.status !== undefined ? normalizeStatus(req.body.status, currentFaq.status) : currentFaq.status,
        0,
        req.params.id,
      ]
    );

    const orderedIds = await getOrderedFaqIds(connection, currentFaq.id);
    const nextOrder = insertAtOrder(orderedIds, currentFaq.id, requestedOrder);
    await applyFaqOrder(connection, nextOrder);

    await connection.commit();

    const [updated] = await pool.query("SELECT * FROM faqs WHERE id = ?", [req.params.id]);
    emitRealtime("faqs:updated", { action: "updated", id: Number(req.params.id) });
    res.json(updated[0]);
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: "Failed to update FAQ" });
  } finally {
    connection.release();
  }
};

exports.deleteFaq = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query("SELECT id FROM faqs WHERE id = ?", [req.params.id]);

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "FAQ not found" });
    }

    await connection.query("DELETE FROM faqs WHERE id = ?", [req.params.id]);
    await compactFaqSortOrders(connection);
    await connection.commit();

    emitRealtime("faqs:updated", { action: "deleted", id: Number(req.params.id) });
    res.json({ message: "FAQ deleted" });
  } catch (error) {
    await connection.rollback();
    console.error(error);
    res.status(500).json({ message: "Failed to delete FAQ" });
  } finally {
    connection.release();
  }
};

exports.reorderFaqs = async (req, res) => {
  try {
    const orderedIds = Array.isArray(req.body?.orderedIds) ? req.body.orderedIds : [];

    if (!orderedIds.length) {
      return res.status(400).json({ message: "orderedIds is required" });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await applyFaqOrder(connection, orderedIds);

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    const [faqs] = await pool.query(
      `SELECT id, question, answer, status, sort_order, created_at, updated_at
       FROM faqs
       ORDER BY sort_order ASC, created_at ASC`
    );

    emitRealtime("faqs:updated", { action: "reordered" });
    res.json(faqs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to reorder FAQs" });
  }
};

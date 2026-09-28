const express = require("express");
const { getPool } = require("../db");
const { addAttempt } = require("./attempts");

const router = express.Router();

// 문항 리스트 (학습모드): ?type=text|image&multi=1|2&page&limit
router.get("/", async (req, res) => {
  try {
    const { type, multi, page = 1, limit = 20 } = req.query;
    const where = [];
    const params = [];
    if (type === "image") {
      where.push("JSON_LENGTH(COALESCE(images,'[]')) > 0");
    } else if (type === "text") {
      where.push("JSON_LENGTH(COALESCE(images,'[]')) = 0");
    }
    if (multi === "1") {
      where.push("JSON_LENGTH(answer) = 1");
    } else if (multi === "2") {
      where.push("JSON_LENGTH(answer) > 1");
    }
    const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
    const offset = (Number(page) - 1) * Number(limit);
    const [[{ total }]] = await getPool().query(
      `SELECT COUNT(*) AS total FROM questions ${whereSql}`,
      params
    );
    const [rows] = await getPool().query(
      `SELECT id, no, question, options, answer, explanation, images, question_type
       FROM questions ${whereSql}
       ORDER BY no LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );
    res.json({
      total,
      page: Number(page),
      limit: Number(limit),
      items: rows.map(normalizeQuestion),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/random", async (req, res) => {
  try {
    const { count = 40 } = req.query;
    const [rows] = await getPool().query(
      "SELECT id, no, question, options, answer, explanation, images, question_type FROM questions ORDER BY RAND() LIMIT ?",
      [Number(count)]
    );
    res.json({ items: rows.map(normalizeQuestion) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const [rows] = await getPool().query(
      "SELECT id, no, question, options, answer, explanation, images, question_type FROM questions WHERE id = ?",
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "not found" });
    res.json(normalizeQuestion(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 문제 번호(no)로 조회 - 유사문제 추천 시 해당 문제로 이동용
router.get("/by-no/:no", async (req, res) => {
  try {
    const [rows] = await getPool().query(
      "SELECT id, no, question, options, answer, explanation, images, question_type FROM questions WHERE no = ?",
      [req.params.no]
    );
    if (!rows.length) return res.status(404).json({ error: "not found" });
    res.json(normalizeQuestion(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 정답 제출 (학습/모의고사 공용)
router.post("/:id/answer", async (req, res) => {
  try {
    const { userAnswer, mode = "study" } = req.body;
    if (!Array.isArray(userAnswer) || userAnswer.length === 0) {
      return res.status(400).json({ error: "userAnswer array required" });
    }
    const [rows] = await getPool().query("SELECT id, answer FROM questions WHERE id = ?", [
      req.params.id,
    ]);
    if (!rows.length) return res.status(404).json({ error: "not found" });
    const correct = JSON.parse(rows[0].answer);
    const sorted = (a) => [...a].sort((x, y) => x - y);
    const isCorrect = JSON.stringify(sorted(userAnswer)) === JSON.stringify(sorted(correct));

    const attemptId = await addAttempt(req.params.id, userAnswer, isCorrect, mode);
    res.json({ question_id: req.params.id, is_correct: isCorrect, user_answer: userAnswer, attempt_id: attemptId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function normalizeQuestion(r) {
  return {
    id: r.id,
    no: r.no,
    question: r.question,
    options: JSON.parse(r.options),
    answer: JSON.parse(r.answer),
    explanation: r.explanation,
    images: r.images ? JSON.parse(r.images) : [],
    question_type: r.question_type,
  };
}

module.exports = router;
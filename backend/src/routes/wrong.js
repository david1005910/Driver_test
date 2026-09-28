const express = require("express");
const { getPool } = require("../db");

const router = express.Router();

function normalizeQuestion(r) {
  return {
    id: r.id,
    no: r.no,
    question: r.question,
    options: JSON.parse(r.options),
    answer: JSON.parse(r.answer),
    explanation: r.explanation,
    images: r.images ? JSON.parse(r.images) : [],
    wrong_count: r.wrong_count,
    solved_count: r.solved_count,
    last_wrong_at: r.last_wrong_at,
  };
}

// 오답노트 목록 (틀린 횟수 기준 정렬)
router.get("/", async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT q.id, q.no, q.question, q.options, q.answer, q.explanation, q.images,
              w.wrong_count, w.solved_count, w.last_wrong_at
       FROM wrong_answers w
       JOIN questions q ON q.id = w.question_id
       WHERE w.wrong_count > 0
       ORDER BY w.wrong_count DESC, w.last_wrong_at DESC`
    );
    res.json({ total: rows.length, items: rows.map(normalizeQuestion) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 오답 재학습: 문제 노출 (정답/해설 포함)
router.get("/:id", async (req, res) => {
  try {
    const [rows] = await getPool().query(
      `SELECT q.id, q.no, q.question, q.options, q.answer, q.explanation, q.images,
              w.wrong_count, w.solved_count
       FROM wrong_answers w JOIN questions q ON q.id = w.question_id
       WHERE w.question_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "not in wrong note" });
    res.json(normalizeQuestion(rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// "다시 맞으면 오답에서 제거" — 정답 제출은 questions route에서 처리
router.delete("/:id", async (req, res) => {
  try {
    await getPool().query(
      "UPDATE wrong_answers SET wrong_count = 0, last_correct_at = NOW() WHERE question_id = ?",
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
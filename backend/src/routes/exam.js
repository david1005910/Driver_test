const express = require("express");
const { getPool } = require("../db");
const { addAttempt } = require("./attempts");

const router = express.Router();

// 모의고사 문항 구성 (license=1|2, count=40)
router.get("/paper", async (req, res) => {
  try {
    const license = req.query.license === "1" ? 1 : 2;
    const count = Number(req.query.count || 40);
    const [rows] = await getPool().query(
      "SELECT id, no, question, options, answer, explanation, images FROM questions ORDER BY RAND() LIMIT ?",
      [count]
    );
    // 실제 시험과 동일 구조(mixed 4지/5지선다) — 정보 제공 목적으로 answer는 감춘다
    const paper = rows.map((r) => ({
      id: r.id,
      no: r.no,
      question: r.question,
      options: JSON.parse(r.options),
      images: r.images ? JSON.parse(r.images) : [],
    }));
    res.json({
      license,
      pass_score: license === 1 ? 70 : 60,
      time_minutes: 40,
      items: paper,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 모의고사 제출/채점
router.post("/grade", async (req, res) => {
  try {
    const { license = 2, answers } = req.body; // answers: [{question_id, user_answer:[]}]
    if (!Array.isArray(answers)) return res.status(400).json({ error: "answers array required" });

    const ids = answers.map((a) => a.question_id);
    const [rows] = await getPool().query(
      "SELECT id, answer FROM questions WHERE id IN (?)",
      [ids]
    );
    const answerMap = new Map(rows.map((r) => [r.id, JSON.parse(r.answer)]));

    let correctCount = 0;
    const results = [];
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      for (const a of answers) {
        const correct = answerMap.get(a.question_id);
        if (!correct) continue;
        const sorted = (x) => [...x].sort((m, n) => m - n);
        const isCorrect =
          JSON.stringify(sorted(a.user_answer)) === JSON.stringify(sorted(correct));
        if (isCorrect) correctCount += 1;
        const userAnsJson = JSON.stringify(a.user_answer || []);
        await conn.query(
          "INSERT INTO attempts (question_id, user_answer, is_correct, mode) VALUES (?, ?, ?, 'exam')",
          [a.question_id, userAnsJson, isCorrect ? 1 : 0]
        );
        const lastWrongAt = isCorrect ? null : new Date();
        await conn.query(
          `INSERT INTO wrong_answers (question_id, wrong_count, solved_count, last_wrong_at, last_correct_at)
           VALUES (?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             wrong_count = IF(VALUES(wrong_count) > 0, wrong_count + 1, wrong_count),
             solved_count = solved_count + 1,
             last_wrong_at = IF(VALUES(wrong_count) > 0, NOW(), last_wrong_at),
             last_correct_at = NOW()`,
          [a.question_id, isCorrect ? 0 : 1, 1, lastWrongAt]
        );
        results.push({
          question_id: a.question_id,
          user_answer: a.user_answer || [],
          correct_answer: correct,
          is_correct: isCorrect,
        });
      }
      await conn.commit();
    } finally {
      conn.release();
    }

    const total = results.length;
    const score = total ? Math.round((correctCount / total) * 100) : 0;
    const pass_score = license === 1 ? 70 : 60;
    res.json({
      license,
      total,
      correct: correctCount,
      score,
      passed: score >= pass_score,
      pass_score,
      results,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
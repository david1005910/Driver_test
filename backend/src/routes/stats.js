const express = require("express");
const { getPool } = require("../db");

const router = express.Router();

// 학습 통계 대시보드
router.get("/", async (req, res) => {
  try {
    const [[{ totalQ }]] = await getPool().query("SELECT COUNT(*) AS totalQ FROM questions");
    const [[{ attempts }]] = await getPool().query("SELECT COUNT(*) AS attempts FROM attempts");
    const [[{ correct }]] = await getPool().query(
      "SELECT COUNT(*) AS correct FROM attempts WHERE is_correct = 1"
    );
    const [[{ wrongCounts }]] = await getPool().query(
      "SELECT COALESCE(SUM(wrong_count),0) AS wrongCounts FROM wrong_answers"
    );
    const [[{ wrongQuestions }]] = await getPool().query(
      "SELECT COUNT(*) AS wrongQuestions FROM wrong_answers WHERE wrong_count > 0"
    );
    const [[{ recent }]] = await getPool().query(
      "SELECT COUNT(*) AS recent FROM attempts WHERE created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)"
    );
    const [[{ recentCorrect }]] = await getPool().query(
      "SELECT COUNT(*) AS recentCorrect FROM attempts WHERE is_correct = 1 AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)"
    );
    // 최근 오답 TOP5
    const [weak] = await getPool().query(
      `SELECT q.id, q.no, q.question, q.images, w.wrong_count
       FROM wrong_answers w JOIN questions q ON q.id = w.question_id
       WHERE w.wrong_count > 0 ORDER BY w.wrong_count DESC LIMIT 5`
    );
    res.json({
      total_questions: totalQ,
      attempts,
      accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
      wrong_questions: wrongQuestions,
      wrong_attempts: wrongCounts,
      recent7d: { attempts: recent, accuracy: recent ? Math.round((recentCorrect / recent) * 100) : 0 },
      weak_top5: weak.map((r) => ({
        id: r.id,
        no: r.no,
        question: r.question,
        images: r.images ? JSON.parse(r.images) : [],
        wrong_count: r.wrong_count,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
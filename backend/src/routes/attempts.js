const { getPool } = require("../db");

async function addAttempt(questionId, userAnswer, isCorrect, mode) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const userAnsJson = JSON.stringify(userAnswer);
    const [r] = await conn.query(
      "INSERT INTO attempts (question_id, user_answer, is_correct, mode) VALUES (?, ?, ?, ?)",
      [questionId, userAnsJson, isCorrect ? 1 : 0, mode]
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
      [questionId, isCorrect ? 0 : 1, 1, lastWrongAt]
    );
    await conn.commit();
    return r.insertId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { addAttempt };